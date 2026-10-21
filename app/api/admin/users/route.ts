import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/permissions";
import { loginEmail, makeUsername } from "@/lib/username";

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const body = await request.json() as { name?: string; role?: "admin" | "technician" };
    const name = (body.name ?? "").trim();
    const role = body.role === "admin" ? "admin" : "technician";
    if (name.length < 4 || name.length > 120) return NextResponse.json({ error: "Informe o nome completo." }, { status: 400 });
    if (role === "admin" && actor.role !== "super_admin") return NextResponse.json({ error: "Somente o administrador principal pode criar administradores." }, { status: 403 });
    const username = makeUsername(name);
    const temporaryPassword = randomBytes(12).toString("base64url") + "A9!";
    const sql = db();
    const duplicate = await sql`SELECT 1 FROM app_users WHERE username = ${username} LIMIT 1`;
    if (duplicate.length) return NextResponse.json({ error: `O login ${username} já existe. Edite o nome ou cadastre uma variação.` }, { status: 409 });

    const { data: created, error } = await auth.signUp.email({
      email: loginEmail(username),
      password: temporaryPassword,
      name,
    });
    if (error || !created?.user?.id) return NextResponse.json({ error: error?.message ?? "Não foi possível criar o usuário no Neon Auth." }, { status: 400 });

    await sql`INSERT INTO app_users (auth_user_id, username, display_name, role, must_change_password, created_by) VALUES (${created.user.id}, ${username}, ${name}, ${role}, true, ${actor.auth_user_id})`;
    await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'user.created', 'app_user', ${created.user.id}, ${JSON.stringify({ username, role })}::jsonb)`;
    return NextResponse.json({ user: { username, name, role }, temporaryPassword, note: "A senha é exibida uma única vez. Entregue-a ao usuário com segurança." }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao cadastrar usuário." }, { status: 500 });
  }
}
