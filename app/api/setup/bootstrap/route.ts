import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { makeUsername } from "@/lib/username";

export async function POST(request: Request) {
  try {
    const expected = process.env.GERA_BOOTSTRAP_SECRET;
    if (!expected) return NextResponse.json({ error: "A configuração inicial ainda não foi habilitada pelo deploy." }, { status: 503 });
    const body = await request.json() as { secret?: string; name?: string };
    if (!body.secret || body.secret.length < 20 || body.secret.length !== expected.length || !timingSafeEqual(Buffer.from(body.secret), Buffer.from(expected))) return NextResponse.json({ error: "Código de configuração inválido." }, { status: 403 });
    const { data: session } = await auth.getSession();
    if (!session?.user) return NextResponse.json({ error: "Entre com a conta recém-criada antes de concluir a configuração." }, { status: 401 });
    const sql = db();
    const existing = await sql`SELECT 1 FROM app_users WHERE role = 'super_admin' LIMIT 1`;
    if (existing.length) return NextResponse.json({ error: "O administrador principal já foi configurado." }, { status: 409 });
    const name = (body.name || session.user.name || "").trim();
    const username = makeUsername(name);
    await sql`INSERT INTO app_users (auth_user_id, username, display_name, role, is_active, must_change_password) VALUES (${session.user.id}, ${username}, ${name}, 'super_admin', true, false)`;
    await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${session.user.id}, 'bootstrap.completed', 'app_user', ${session.user.id}, ${JSON.stringify({ username })}::jsonb)`;
    return NextResponse.json({ ok: true, username });
  } catch (error) {
    if (error instanceof Error && /nome e sobrenome/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na configuração inicial." }, { status: 500 });
  }
}
