import { NextResponse } from "next/server";
import { currentUser } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Falha ao carregar perfil." }, { status: 500 });
  }
}
