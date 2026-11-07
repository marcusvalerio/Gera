import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/permissions";

function fail(error: unknown, fallback: string) {
  if (error instanceof Response) return error.text().then(text => NextResponse.json({ error: text }, { status: error.status }));
  return NextResponse.json({ error: fallback, detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
}

// Exclui a pessoa da alocação: as atividades não concluídas ficam sem responsável (nada é apagado).
export async function DELETE(request: Request) {
  try {
    const actor = await requireAdmin();
    const username = new URL(request.url).searchParams.get("username")?.trim();
    if (!username) return NextResponse.json({ error: "Informe a pessoa." }, { status: 400 });
    const sql = db();
    const [orders] = await sql.transaction([
      sql`UPDATE work_orders SET assigned_username = NULL, updated_at = now() WHERE assigned_username = ${username} AND status <> 'completed' RETURNING id`,
      sql`INSERT INTO allocation_excluded (username, excluded_by) VALUES (${username}, ${actor.username}) ON CONFLICT (username) DO UPDATE SET excluded_by = EXCLUDED.excluded_by, excluded_at = now()`,
    ]);
    const orderIds = (orders as Array<{ id: string }>).map(o => o.id);
    await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'allocation.person_excluded', 'person', ${username}, ${JSON.stringify({ orders: orderIds.length })}::jsonb)`;
    return NextResponse.json({ username, orderIds });
  } catch (error) { return fail(error, "Falha ao excluir a pessoa."); }
}

// Desfaz a exclusão: devolve as atividades que ainda estão sem responsável.
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const body = await request.json() as { username?: string; orderIds?: string[] };
    const username = body.username?.trim();
    if (!username) return NextResponse.json({ error: "Informe a pessoa." }, { status: 400 });
    const ids = Array.isArray(body.orderIds) ? body.orderIds.filter(id => typeof id === "string") : [];
    const sql = db();
    const [restored] = await sql.transaction([
      sql`UPDATE work_orders SET assigned_username = ${username}, updated_at = now() WHERE id = ANY(${ids}) AND assigned_username IS NULL RETURNING id`,
      sql`DELETE FROM allocation_excluded WHERE username = ${username}`,
    ]);
    await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'allocation.person_restored', 'person', ${username}, ${JSON.stringify({ orders: (restored as unknown[]).length })}::jsonb)`;
    return NextResponse.json({ restored: (restored as unknown[]).length });
  } catch (error) { return fail(error, "Falha ao desfazer a exclusão."); }
}
