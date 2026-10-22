import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/permissions";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const rawDays = Number(url.searchParams.get("days") ?? 30);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const sql = db();
    const [daily, people, totals] = await Promise.all([
      sql`SELECT COALESCE(scheduled_for::text, source_data->>'Data', source_data->>'data', 'Sem data') AS day,
        SUM(work_minutes)::int AS minutes, COUNT(*)::int AS orders
        FROM work_orders
        WHERE COALESCE(scheduled_for, CURRENT_DATE) >= CURRENT_DATE - make_interval(days => ${days}::int)
        GROUP BY 1 ORDER BY 1`,
      sql`SELECT COALESCE(NULLIF(source_data->'__gera'->>'name', ''), assigned_username, 'Não atribuído') AS name,
        SUM(work_minutes)::int AS minutes, COUNT(*)::int AS orders
        FROM work_orders
        WHERE COALESCE(scheduled_for, CURRENT_DATE) >= CURRENT_DATE - make_interval(days => ${days}::int)
        GROUP BY 1 ORDER BY minutes DESC`,
      sql`SELECT COALESCE(SUM(work_minutes), 0)::int AS minutes, COUNT(*)::int AS orders,
        COUNT(DISTINCT COALESCE(scheduled_for::text, source_data->>'Data', source_data->>'data'))::int AS days
        FROM work_orders`
    ]);
    return NextResponse.json({ periodDays: days, daily, people, totals: totals[0] ?? { minutes: 0, orders: 0, days: 0 } });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    console.error("[gera] analytics:", error);
    return NextResponse.json({ error: "Falha ao carregar a alocação de trabalho.", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
