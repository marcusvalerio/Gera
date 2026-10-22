import { NextResponse } from "next/server";
import { currentUser } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error) {
    console.error("[gera] /api/me falhou:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Falha ao carregar perfil.", detail }, { status: 500 });
  }
}
