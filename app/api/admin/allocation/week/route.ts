import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/permissions";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function weekStart(value: string | null) {
  const base = value && ISO_DATE.test(value) ? new Date(value + "T12:00:00Z") : new Date();
  base.setUTCDate(base.getUTCDate() - base.getUTCDay()); // semana começa no domingo
  return base.toISOString().slice(0, 10);
}
function fail(error: unknown, fallback: string) {
  if (error instanceof Response) return error.text().then(text => NextResponse.json({ error: text }, { status: error.status }));
  return NextResponse.json({ error: fallback, detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
}

// Grade semanal: minutos alocados por pessoa e por dia.
export async function GET(request: Request) {
  try {
    await requireUser();
    const start = weekStart(new URL(request.url).searchParams.get("start"));
    const sql = db();
    const [days, people, orders] = await Promise.all([
      sql`SELECT to_char(d, 'YYYY-MM-DD') AS day FROM generate_series(${start}::date, ${start}::date + 6, interval '1 day') AS d`,
      sql`SELECT username, MAX(name) AS name FROM (
            SELECT assigned_username AS username, NULLIF(source_data->'__gera'->>'name', '') AS name FROM work_orders WHERE assigned_username IS NOT NULL
            UNION ALL
            SELECT username, upper(display_name) FROM app_users WHERE role = 'technician' AND is_active
          ) p GROUP BY username ORDER BY MAX(name) NULLS LAST, username`,
      sql`SELECT id, order_number, title, location, status, assigned_username, to_char(scheduled_for, 'YYYY-MM-DD') AS day, work_minutes
          FROM work_orders WHERE scheduled_for BETWEEN ${start}::date AND ${start}::date + 6 AND status <> 'cancelled'
          ORDER BY scheduled_for, order_number`,
    ]);
    return NextResponse.json({ start, days: days.map(d => d.day), people, orders });
  } catch (error) { return fail(error, "Falha ao carregar a alocação semanal."); }
}

// Cria uma atividade manual.
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const body = await request.json() as { username?: string; day?: string; title?: string; orderNumber?: string; minutes?: number; location?: string; sapCreated?: boolean | null; week?: string; indicator?: string; group?: string };
    const title = (body.title ?? "").trim();
    const minutes = Math.round(Number(body.minutes ?? 0));
    if (!body.username || !body.day || !ISO_DATE.test(body.day)) return NextResponse.json({ error: "Informe a pessoa e a data." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Informe a descrição da atividade." }, { status: 400 });
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return NextResponse.json({ error: "Informe o tempo em minutos (1 a 1440)." }, { status: 400 });
    const orderNumber = (body.orderNumber ?? "").trim() || null;
    const key = orderNumber ? `os:${orderNumber.toLowerCase()}` : `manual:${createHash("sha256").update(`${body.username}|${body.day}|${title}|${Date.now()}`).digest("hex").slice(0, 32)}`;
    const sql = db();
    const rows = await sql`INSERT INTO work_orders (external_key, order_number, title, location, assigned_username, scheduled_for, work_minutes, sap_created, source_data)
      VALUES (${key}, ${orderNumber}, ${title}, ${(body.location ?? "").trim() || null}, ${body.username}, ${body.day}, ${minutes}, ${typeof body.sapCreated === "boolean" ? body.sapCreated : null}, ${JSON.stringify({ __gera: { manual: true, week: (body.week ?? "").trim().toUpperCase(), indicator: body.indicator === "P3M" ? "P3M" : "FORA P3M", group: (body.group ?? "").trim() } })}::jsonb)
      ON CONFLICT (external_key) DO NOTHING RETURNING id`;
    if (!rows.length) return NextResponse.json({ error: `A ordem ${orderNumber} já existe.` }, { status: 409 });
    await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'order.created_manual', 'work_order', ${rows[0].id}, ${JSON.stringify({ username: body.username, day: body.day, minutes })}::jsonb)`;
    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (error) { return fail(error, "Falha ao criar a atividade."); }
}

// Muda a data (e opcionalmente o responsável) de uma atividade.
export async function PATCH(request: Request) {
  try {
    const actor = await requireUser();
    const body = await request.json() as { id?: string; day?: string; username?: string };
    if (!body.id || !body.day || !ISO_DATE.test(body.day)) return NextResponse.json({ error: "Informe a atividade e a nova data." }, { status: 400 });
    const sql = db();
    const found = await sql`SELECT status, to_char(scheduled_for, 'YYYY-MM-DD') AS day, assigned_username FROM work_orders WHERE id = ${body.id} LIMIT 1`;
    if (!found.length) return NextResponse.json({ error: "Atividade não encontrada." }, { status: 404 });
    if (found[0].status === "completed") return NextResponse.json({ error: "Atividade já concluída. Não pode mais ser alterada." }, { status: 409 });
    const username = (actor.role !== "technician" && body.username) || found[0].assigned_username;
    if (found[0].day === body.day && username === found[0].assigned_username) return NextResponse.json({ ok: true });
    await sql`UPDATE work_orders SET scheduled_for = ${body.day}, assigned_username = ${username}, updated_at = now() WHERE id = ${body.id}`;
    await sql`INSERT INTO order_events (work_order_id, event_type, actor_auth_user_id, details) VALUES (${body.id}, 'schedule.changed', ${actor.auth_user_id}, ${JSON.stringify({ from: found[0].day, to: body.day, username })}::jsonb)`;
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error, "Falha ao mudar a data."); }
}
