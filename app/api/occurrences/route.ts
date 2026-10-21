import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/permissions";
export async function GET() {
  try {
    const user = await requireUser();
    const rows = user.role === "technician"
      ? await db()`SELECT o.id, o.work_order_id, o.category, o.description, o.status, o.created_at, w.order_number, w.title FROM occurrences o JOIN work_orders w ON w.id = o.work_order_id WHERE o.created_by = ${user.auth_user_id} ORDER BY o.created_at DESC LIMIT 200`
      : await db()`SELECT o.id, o.work_order_id, o.category, o.description, o.status, o.created_at, w.order_number, w.title FROM occurrences o JOIN work_orders w ON w.id = o.work_order_id ORDER BY o.created_at DESC LIMIT 200`;
    return NextResponse.json({ occurrences: rows });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao carregar ocorrências." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as { workOrderId?: string; category?: string; description?: string };
    const category = (body.category ?? "").trim();
    const description = (body.description ?? "").trim();
    if (!body.workOrderId || !category || !description) return NextResponse.json({ error: "Informe a ordem, categoria e descrição." }, { status: 400 });
    if (category.length > 80 || description.length > 2000) return NextResponse.json({ error: "A categoria ou descrição excede o limite permitido." }, { status: 400 });
    const found = await db()`SELECT id, assigned_username FROM work_orders WHERE id = ${body.workOrderId} LIMIT 1`;
    if (!found.length) return NextResponse.json({ error: "Ordem não encontrada." }, { status: 404 });
    if (user.role === "technician" && found[0].assigned_username !== user.username) return NextResponse.json({ error: "Esta ordem não está atribuída a você." }, { status: 403 });
    const rows = await db()`INSERT INTO occurrences (work_order_id, created_by, category, description) VALUES (${body.workOrderId}, ${user.auth_user_id}, ${category}, ${description}) RETURNING id, status, created_at`;
    await db()`INSERT INTO order_events (work_order_id, event_type, actor_auth_user_id, details) VALUES (${body.workOrderId}, 'occurrence.created', ${user.auth_user_id}, ${JSON.stringify({ category, description })}::jsonb)`;
    await db()`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${user.auth_user_id}, 'occurrence.created', 'occurrence', ${rows[0].id}, ${JSON.stringify({ workOrderId: body.workOrderId, category })}::jsonb)`;
    return NextResponse.json({ occurrence: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao registrar ocorrência." }, { status: 500 });
  }
}
