import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/permissions";

// The password itself is changed client-side via Neon Auth; this only clears the first-access flag.
export async function POST() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    await db()`UPDATE app_users SET must_change_password = false, updated_at = now() WHERE auth_user_id = ${user.auth_user_id}`;
    await db()`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id) VALUES (${user.auth_user_id}, 'password.changed', 'app_user', ${user.auth_user_id})`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao trocar senha." }, { status: 500 });
  }
}
