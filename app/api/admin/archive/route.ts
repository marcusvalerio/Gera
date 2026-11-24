import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/permissions";

const MONTH = /^\d{4}-\d{2}$/;
const TZ = "America/Sao_Paulo";

function fail(error: unknown, fallback: string) {
  if (error instanceof Response) return error.text().then(text => NextResponse.json({ error: text }, { status: error.status }));
  return NextResponse.json({ error: fallback, detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
}

// Meses fechados: resumo de cada mês (para comparar) e, com ?month=, as atividades daquele mês.
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const sql = db();
    const month = new URL(request.url).searchParams.get("month");
    if (month) {
      if (!MONTH.test(month)) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
      const [orders, people] = await Promise.all([
        sql`SELECT id, order_number, title, location, equipment, assigned_username, work_minutes,
            to_char(scheduled_for, 'YYYY-MM-DD') AS day, completed_at,
            COALESCE(NULLIF(source_data->'__gera'->>'name', ''), assigned_username, 'Sem executante') AS person,
            COALESCE(NULLIF(source_data->'__gera'->>'indicator', ''), 'FORA P3M') AS indicator
          FROM work_orders WHERE archived_month = ${month} ORDER BY completed_at DESC LIMIT 2000`,
        sql`SELECT COALESCE(NULLIF(source_data->'__gera'->>'name', ''), assigned_username, 'Sem executante') AS name,
            count(*)::int AS done, COALESCE(sum(work_minutes), 0)::int AS minutes
          FROM work_orders WHERE archived_month = ${month} GROUP BY 1 ORDER BY done DESC, name`,
      ]);
      return NextResponse.json({ month, orders, people });
    }
    // Mês corrente (ainda aberto) + meses fechados, com os mesmos números para comparação.
    const [months, current, pending] = await Promise.all([
      sql`SELECT archived_month AS month, count(*)::int AS done, COALESCE(sum(work_minutes), 0)::int AS minutes,
          count(*) FILTER (WHERE COALESCE(NULLIF(source_data->'__gera'->>'indicator', ''), 'FORA P3M') = 'P3M')::int AS p3m,
          count(*) FILTER (WHERE scheduled_for IS NOT NULL AND (completed_at AT TIME ZONE 'America/Sao_Paulo')::date <= scheduled_for)::int AS on_time,
          count(DISTINCT COALESCE(NULLIF(source_data->'__gera'->>'name', ''), assigned_username))::int AS people,
          max(archived_at) AS archived_at
        FROM work_orders WHERE archived_month IS NOT NULL GROUP BY archived_month ORDER BY archived_month DESC`,
      sql`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month, count(*)::int AS done, COALESCE(sum(work_minutes), 0)::int AS minutes,
          count(*) FILTER (WHERE COALESCE(NULLIF(source_data->'__gera'->>'indicator', ''), 'FORA P3M') = 'P3M')::int AS p3m,
          count(*) FILTER (WHERE scheduled_for IS NOT NULL AND (completed_at AT TIME ZONE 'America/Sao_Paulo')::date <= scheduled_for)::int AS on_time,
          count(DISTINCT COALESCE(NULLIF(source_data->'__gera'->>'name', ''), assigned_username))::int AS people
        FROM work_orders WHERE archived_month IS NULL AND status = 'completed'
          AND (completed_at AT TIME ZONE 'America/Sao_Paulo') >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')`,
      // Concluídas antes do mês atual que ainda não foram fechadas.
      sql`SELECT to_char(completed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month, count(*)::int AS count
        FROM work_orders WHERE archived_month IS NULL AND status = 'completed' AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE 'America/Sao_Paulo') < date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
        GROUP BY 1 ORDER BY 1`,
    ]);
    return NextResponse.json({ timezone: TZ, current: current[0], months, pending });
  } catch (error) { return fail(error, "Falha ao carregar os meses fechados."); }
}

// Fecha o mês: arquiva as atividades concluídas antes do mês atual (cada uma no mês em que foi concluída).
// As pendentes continuam na folha nova.
export async function POST() {
  try {
    const actor = await requireAdmin(true);
    const sql = db();
    const rows = await sql`UPDATE work_orders SET archived_month = to_char(completed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), archived_at = now()
      WHERE archived_month IS NULL AND status = 'completed' AND completed_at IS NOT NULL
        AND (completed_at AT TIME ZONE 'America/Sao_Paulo') < date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
      RETURNING archived_month`;
    const byMonth: Record<string, number> = {};
    for (const r of rows as Array<{ archived_month: string }>) byMonth[r.archived_month] = (byMonth[r.archived_month] ?? 0) + 1;
    await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'month.closed', 'work_order', NULL, ${JSON.stringify({ archived: rows.length, byMonth })}::jsonb)`;
    return NextResponse.json({ archived: rows.length, byMonth });
  } catch (error) { return fail(error, "Falha ao fechar o mês."); }
}

// Reabre um mês fechado (volta para a folha atual) com ?month=&action=reopen, ou exclui de vez com ?month=.
export async function DELETE(request: Request) {
  try {
    const actor = await requireAdmin(true);
    const params = new URL(request.url).searchParams;
    const month = params.get("month") ?? "";
    if (!MONTH.test(month)) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
    const sql = db();
    if (params.get("action") === "reopen") {
      const rows = await sql`UPDATE work_orders SET archived_month = NULL, archived_at = NULL WHERE archived_month = ${month} RETURNING id`;
      await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'month.reopened', 'work_order', ${month}, ${JSON.stringify({ count: rows.length })}::jsonb)`;
      return NextResponse.json({ reopened: rows.length });
    }
    const rows = await sql`DELETE FROM work_orders WHERE archived_month = ${month} AND status = 'completed' RETURNING id`;
    await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'month.deleted', 'work_order', ${month}, ${JSON.stringify({ count: rows.length })}::jsonb)`;
    return NextResponse.json({ deleted: rows.length });
  } catch (error) { return fail(error, "Falha ao alterar o mês fechado."); }
}
