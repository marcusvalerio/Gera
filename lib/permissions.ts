import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export type GeraRole = "super_admin" | "admin" | "technician";
export type GeraUser = {
  auth_user_id: string;
  username: string;
  display_name: string;
  role: GeraRole;
  is_active: boolean;
  must_change_password: boolean;
};

export async function currentUser(): Promise<GeraUser | null> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const sql = db();
  const rows = await sql`
    SELECT auth_user_id, username, display_name, role, is_active, must_change_password
    FROM app_users WHERE auth_user_id = ${user.id} LIMIT 1
  `;
  const profile = rows[0] as GeraUser | undefined;
  if (!profile || !profile.is_active) return null;
  return profile;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Response("Não autenticado.", { status: 401 });
  if (user.must_change_password) throw new Response("Troca de senha obrigatória.", { status: 428 });
  return user;
}

export async function requireAdmin(allowSuperOnly = false) {
  const user = await requireUser();
  const allowed = allowSuperOnly ? user.role === "super_admin" : user.role === "super_admin" || user.role === "admin";
  if (!allowed) throw new Response("Acesso negado.", { status: 403 });
  return user;
}

export async function authHeaders() {
  return headers();
}
