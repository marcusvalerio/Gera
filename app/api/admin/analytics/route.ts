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

    const [summaryRows, statusRows, priorityRows, trendRows, technicianRows, occurrenceRows, importRows, recentRows] = await Promise.all([
      sql`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('pending','blocked'))::int AS pending,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked,
        COUNT(*) FILTER (WHERE scheduled_for < CURRENT_DATE AND status NOT IN ('completed','cancelled'))::int AS overdue,
        COUNT(*) FILTER (WHERE created_at >= now() - (\${days}::text || ' days')::interval)::int AS created_in_period,
        COUNT(*) FILTER (WHERE completed_at >= now() - (\${days}::text || ' days')::interval)::int AS completed_in_period
        FROM work_orders`,
      sql`SELECT status, COUNT(*)::int AS count FROM work_orders GROUP BY status ORDER BY count DESC`,
      sql`SELECT priority, COUNT(*)::int AS count FROM work_orders WHERE status NOT IN ('completed','cancelled') GROUP BY priority ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`,
      sql`SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
        COUNT(w.id) FILTER (WHERE w.created_at::date = d.day)::int AS created,
        COUNT(w.id) FILTER (WHERE w.completed_at::date = d.day)::int AS completed
        FROM generate_series(CURRENT_DATE - ((\${days} - 1) * interval '1 day'), CURRENT_DATE, interval '1 day') AS d(day)
        LEFT JOIN work_orders w ON w.created_at::date = d.day OR w.completed_at::date = d.day
        GROUP BY d.day ORDER BY d.day`,
      sql`SELECT COALESCE(assigned_username, 'Não atribuído') AS username,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status IN ('pending','blocked'))::int AS pending,
        COUNT(*) FILTER (WHERE scheduled_for < CURRENT_DATE AND status NOT IN ('completed','cancelled'))::int AS overdue
        FROM work_orders GROUP BY assigned_username ORDER BY completed DESC, total DESC LIMIT 20`,
      sql`SELECT category, status, COUNT(*)::int AS count FROM occurrences WHERE created_at >= now() - (\${days}::text || ' days')::interval GROUP BY category, status ORDER BY count DESC LIMIT 30`,
      sql`SELECT id, filename, status, total_rows, created_count, updated_count, unchanged_count, error_count, created_at, applied_at
        FROM imports ORDER BY created_at DESC LIMIT 10`,
      sql`SELECT id, order_number, title, status, priority, assigned_username, updated_at FROM work_orders ORDER BY updated_at DESC LIMIT 8`
    ]);

    const summary = summaryRows[0] ?? {};
    const total = Number(summary.total ?? 0);
    const completed = Number(summary.completed ?? 0);
    return NextResponse.json({
      periodDays: days,
      summary: { ...summary, completionRate: total ? Math.round((completed / total) * 1000) / 10 : 0 },
      byStatus: statusRows,
      byPriority: priorityRows,
      trend: trendRows,
      byTechnician: technicianRows,
      occurrences: occurrenceRows,
      imports: importRows,
      recentOrders: recentRows
    });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao gerar o dashboard gerencial." }, { status: 500 });
  }
}
