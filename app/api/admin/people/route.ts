import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/permissions";
import { usernameFromDisplayName } from "@/lib/username";

// Pessoas que aparecem na planilha, cruzadas com os acessos cadastrados.
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const sql = db();
    const person = new URL(request.url).searchParams.get("username");
    if (person) {
      const [profile, orders, occurrences] = await Promise.all([
        sql`SELECT username, display_name, role, is_active, created_at FROM app_users WHERE username = ${person} LIMIT 1`,
        sql`SELECT id, order_number, title, location, status, priority, scheduled_for, work_minutes, completed_at, updated_at,
          source_data->'__gera'->>'name' AS sheet_name
          FROM work_orders WHERE assigned_username = ${person}
          ORDER BY COALESCE(completed_at, updated_at) DESC LIMIT 500`,
        sql`SELECT o.category, o.description, o.status, o.created_at, w.order_number
          FROM occurrences o JOIN work_orders w ON w.id = o.work_order_id
          WHERE w.assigned_username = ${person} ORDER BY o.created_at DESC LIMIT 50`,
      ]);
      const list = orders as Array<{ status: string; work_minutes: number; scheduled_for: string | null }>;
      const today = new Date().toISOString().slice(0, 10);
      const summary = {
        total: list.length,
        completed: list.filter(o => o.status === "completed").length,
        pending: list.filter(o => o.status === "pending" || o.status === "blocked").length,
        in_progress: list.filter(o => o.status === "in_progress").length,
        overdue: list.filter(o => o.scheduled_for && String(o.scheduled_for).slice(0, 10) < today && !["completed", "cancelled"].includes(o.status)).length,
        minutes: list.reduce((sum, o) => sum + Number(o.work_minutes || 0), 0),
      };
      return NextResponse.json({ username: person, profile: profile[0] ?? null, summary, orders, occurrences });
    }

    const [sheet, users] = await Promise.all([
      sql`SELECT assigned_username AS username,
          MAX(NULLIF(source_data->'__gera'->>'name', '')) AS sheet_name,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
        FROM work_orders WHERE assigned_username IS NOT NULL GROUP BY assigned_username`,
      sql`SELECT username, display_name, role, is_active, must_change_password, created_at FROM app_users ORDER BY display_name`,
    ]);
    const registered = new Map((users as Array<{ username: string }>).map(u => [u.username, u]));
    const people = (sheet as Array<{ username: string; sheet_name: string | null; total: number; completed: number }>).map(p => {
      const words = (p.sheet_name ?? "").trim().split(/\s+/).filter(Boolean);
      const suggestedName = words.length >= 2 ? `${words[0]} ${words[words.length - 1]}` : p.sheet_name ?? p.username;
      const pretty = suggestedName.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
      return { ...p, registered: registered.has(p.username), suggestedName: usernameFromDisplayName(pretty) === p.username ? pretty : (p.sheet_name ?? pretty) };
    }).sort((a, b) => Number(a.registered) - Number(b.registered) || b.total - a.total);
    return NextResponse.json({ people, users });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao carregar pessoas.", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
