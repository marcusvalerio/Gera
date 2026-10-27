import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = user.role === "technician"
      ? await db()`SELECT id, external_key, order_number, title, description, location, equipment, priority, status, assigned_username, scheduled_for, completed_at, notes, sap_created, sap_closed,
        COALESCE(NULLIF(source_data->'__gera'->>'week', ''), NULL) AS week,
        COALESCE(NULLIF(source_data->'__gera'->>'indicator', ''), 'FORA P3M') AS indicator,
        NULLIF(source_data->'__gera'->>'group', '') AS grp,
        (SELECT COALESCE(json_agg(json_build_object('from', e.details->>'from', 'to', e.details->>'to', 'by', COALESCE(u.display_name, '—'), 'at', e.created_at) ORDER BY e.created_at DESC), '[]'::json)
           FROM order_events e LEFT JOIN app_users u ON u.auth_user_id = e.actor_auth_user_id
          WHERE e.work_order_id = work_orders.id AND e.event_type = 'schedule.changed') AS date_history
        FROM work_orders WHERE assigned_username = ${user.username} ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, scheduled_for NULLS LAST, created_at DESC LIMIT 500`
      : await db()`SELECT id, external_key, order_number, title, description, location, equipment, priority, status, assigned_username, scheduled_for, completed_at, notes, sap_created, sap_closed,
        COALESCE(NULLIF(source_data->'__gera'->>'week', ''), NULL) AS week,
        COALESCE(NULLIF(source_data->'__gera'->>'indicator', ''), 'FORA P3M') AS indicator,
        NULLIF(source_data->'__gera'->>'group', '') AS grp,
        (SELECT COALESCE(json_agg(json_build_object('from', e.details->>'from', 'to', e.details->>'to', 'by', COALESCE(u.display_name, '—'), 'at', e.created_at) ORDER BY e.created_at DESC), '[]'::json)
           FROM order_events e LEFT JOIN app_users u ON u.auth_user_id = e.actor_auth_user_id
          WHERE e.work_order_id = work_orders.id AND e.event_type = 'schedule.changed') AS date_history
        FROM work_orders ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, scheduled_for NULLS LAST, created_at DESC LIMIT 500`;
    return NextResponse.json({ orders: rows });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao carregar ordens." }, { status: 500 });
  }
}

// Anotação livre da pessoa sobre a atividade.
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as { id?: string; notes?: string; sapClosed?: boolean };
    if (body.id && typeof body.sapClosed === "boolean") {
      const found = await db()`SELECT assigned_username FROM work_orders WHERE id = ${body.id} LIMIT 1`;
      if (!found.length) return NextResponse.json({ error: "Ordem não encontrada." }, { status: 404 });
      if (user.role === "technician" && found[0].assigned_username !== user.username) return NextResponse.json({ error: "Esta ordem não está atribuída a você." }, { status: 403 });
      await db()`UPDATE work_orders SET sap_closed = ${body.sapClosed}, updated_at = now() WHERE id = ${body.id}`;
      await db()`INSERT INTO order_events (work_order_id, event_type, actor_auth_user_id, details) VALUES (${body.id}, 'sap.closed', ${user.auth_user_id}, ${JSON.stringify({ done: body.sapClosed })}::jsonb)`;
      return NextResponse.json({ ok: true });
    }
    const notes = String(body.notes ?? "").trim();
    if (!body.id) return NextResponse.json({ error: "Informe a ordem." }, { status: 400 });
    if (notes.length > 1000) return NextResponse.json({ error: "Texto muito longo (máximo de 1000 caracteres)." }, { status: 400 });
    const found = await db()`SELECT assigned_username FROM work_orders WHERE id = ${body.id} LIMIT 1`;
    if (!found.length) return NextResponse.json({ error: "Ordem não encontrada." }, { status: 404 });
    if (user.role === "technician" && found[0].assigned_username !== user.username) return NextResponse.json({ error: "Esta ordem não está atribuída a você." }, { status: 403 });
    await db()`UPDATE work_orders SET notes = ${notes || null}, updated_at = now() WHERE id = ${body.id}`;
    await db()`INSERT INTO order_events (work_order_id, event_type, actor_auth_user_id, details) VALUES (${body.id}, 'notes.changed', ${user.auth_user_id}, ${JSON.stringify({ notes })}::jsonb)`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao salvar as informações." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as { id?: string; status?: "pending" | "in_progress" | "completed" | "blocked" };
    if (!body.id || !body.status) return NextResponse.json({ error: "Informe a ordem e o novo status." }, { status: 400 });
    const allowed = ["pending", "in_progress", "completed", "blocked"];
    if (!allowed.includes(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    const found = await db()`SELECT id, assigned_username, status FROM work_orders WHERE id = ${body.id} LIMIT 1`;
    if (!found.length) return NextResponse.json({ error: "Ordem não encontrada." }, { status: 404 });
    if (found[0].status === "completed") return NextResponse.json({ error: "Atividade já concluída. Não pode mais ser alterada." }, { status: 409 });
    if (user.role === "technician" && found[0].assigned_username !== user.username) return NextResponse.json({ error: "Esta ordem não está atribuída a você." }, { status: 403 });
    const rows = await db()`UPDATE work_orders SET status = ${body.status}, completed_at = CASE WHEN ${body.status} = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END, completed_by = CASE WHEN ${body.status} = 'completed' THEN ${user.username} ELSE NULL END, updated_at = now() WHERE id = ${body.id} RETURNING id, status, completed_at`;
    await db()`INSERT INTO order_events (work_order_id, event_type, actor_auth_user_id, details) VALUES (${body.id}, 'status.changed', ${user.auth_user_id}, ${JSON.stringify({ status: body.status })}::jsonb)`;
    await db()`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${user.auth_user_id}, 'order.status_changed', 'work_order', ${body.id}, ${JSON.stringify({ status: body.status })}::jsonb)`;
    return NextResponse.json({ order: rows[0] });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao atualizar ordem." }, { status: 500 });
  }
}

// Exclui uma atividade (somente administrador principal).
export async function DELETE(request: Request) {
  try {
    const actor = await requireAdmin(true);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Informe a atividade." }, { status: 400 });
    const rows = await db()`DELETE FROM work_orders WHERE id = ${id} RETURNING order_number, title, assigned_username`;
    if (!rows.length) return NextResponse.json({ error: "Atividade não encontrada." }, { status: 404 });
    await db()`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'order.deleted', 'work_order', ${id}, ${JSON.stringify(rows[0])}::jsonb)`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao excluir a atividade." }, { status: 500 });
  }
}
