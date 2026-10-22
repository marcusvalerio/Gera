import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/permissions";

// Gera uma nova senha provisória para quem esqueceu a sua.
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const { username } = await request.json() as { username?: string };
    if (!username) return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
    const sql = db();
    const rows = await sql`SELECT auth_user_id, role FROM app_users WHERE username = ${username} LIMIT 1`;
    const target = rows[0] as { auth_user_id: string; role: string } | undefined;
    if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (target.role !== "technician" && actor.role !== "super_admin") return NextResponse.json({ error: "Somente o administrador principal pode redefinir a senha de administradores." }, { status: 403 });
    if (target.auth_user_id === actor.auth_user_id) return NextResponse.json({ error: "Use a tela Segurança para trocar a sua própria senha." }, { status: 400 });

    const temporaryPassword = randomBytes(9).toString("base64url") + "A9!";
    const hash = await hashPassword(temporaryPassword);
    const updated = await sql`UPDATE neon_auth.account SET password = ${hash}, "updatedAt" = now() WHERE "userId" = ${target.auth_user_id} AND "providerId" = 'credential' RETURNING id`;
    if (!updated.length) return NextResponse.json({ error: "Conta de login não encontrada no Neon Auth." }, { status: 404 });
    await sql`DELETE FROM neon_auth.session WHERE "userId" = ${target.auth_user_id}`;
    await sql`UPDATE app_users SET must_change_password = true, updated_at = now() WHERE auth_user_id = ${target.auth_user_id}`;
    await sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'user.password_reset', 'app_user', ${target.auth_user_id}, ${JSON.stringify({ username })}::jsonb)`;
    return NextResponse.json({ username, temporaryPassword });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao redefinir a senha.", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
