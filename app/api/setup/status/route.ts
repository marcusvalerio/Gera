import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET() {
  try {
    const rows = await db()`SELECT 1 FROM app_users WHERE role = 'super_admin' LIMIT 1`;
    return NextResponse.json({ setupRequired: rows.length === 0 });
  } catch {
    return NextResponse.json({ setupRequired: false, error: "Configuração do banco pendente." }, { status: 503 });
  }
}
