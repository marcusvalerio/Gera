import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/permissions";

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = await request.json() as { currentPassword?: string; newPassword?: string };
    if (!body.currentPassword || !body.newPassword || body.newPassword.length < 12) {
      return NextResponse.json({ error: "A nova senha deve ter pelo menos 12 caracteres." }, { status: 400 });
    }
    const { error } = await auth.changePassword({
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      revokeOtherSessions: true,
    });
    if (error) return NextResponse.json({ error: error.message ?? "Não foi possível alterar a senha." }, { status: 400 });
    await db()`UPDATE app_users SET must_change_password = false, updated_at = now() WHERE auth_user_id = ${user.auth_user_id}`;
    await db()`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id) VALUES (${user.auth_user_id}, 'password.changed', 'app_user', ${user.auth_user_id})`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao trocar senha." }, { status: 500 });
  }
}
