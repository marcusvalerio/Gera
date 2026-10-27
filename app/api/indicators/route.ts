import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/permissions";

// Indicadores por grupo, P3M e semana, calculados a partir dos dados da planilha (source_data.__gera).
export async function GET() {
  try {
    await requireUser();
    const sql = db();
    const cte = `WITH o AS (
      SELECT w.status, w.work_minutes, w.scheduled_for, w.completed_at,
        COALESCE(NULLIF(w.source_data->'__gera'->>'group', ''), 'Sem grupo') AS grp,
        COALESCE(NULLIF(w.source_data->'__gera'->>'indicator', ''), 'FORA P3M') AS indicator,
        COALESCE(NULLIF(w.source_data->'__gera'->>'week', ''), 'Sem semana') AS week,
        COALESCE(NULLIF(w.source_data->'__gera'->>'name', ''), w.assigned_username, 'Sem executante') AS person,
        w.status = 'completed' AS done,
        w.status <> 'completed' AND w.scheduled_for < (now() AT TIME ZONE 'America/Sao_Paulo')::date AS late,
        w.status = 'completed' AND w.scheduled_for IS NOT NULL AND (w.completed_at AT TIME ZONE 'America/Sao_Paulo')::date <= w.scheduled_for AS on_time,
        w.scheduled_for IS NOT NULL AND w.scheduled_for <= (now() AT TIME ZONE 'America/Sao_Paulo')::date AS due
      FROM work_orders w WHERE w.status <> 'cancelled')`;
    const [groups, p3m, weeks, weekPeople] = await Promise.all([
      sql.query(`${cte} SELECT grp AS name, count(*) FILTER (WHERE NOT done AND NOT late)::int AS open, count(*) FILTER (WHERE done)::int AS done,
        count(*) FILTER (WHERE late)::int AS late, COALESCE(sum(work_minutes), 0)::int AS minutes FROM o GROUP BY grp ORDER BY grp`),
      sql.query(`${cte} SELECT indicator AS name, count(*)::int AS total, COALESCE(sum(work_minutes), 0)::int AS minutes,
        count(*) FILTER (WHERE done)::int AS done, count(*) FILTER (WHERE on_time)::int AS on_time,
        count(*) FILTER (WHERE due OR done)::int AS due, count(*) FILTER (WHERE late)::int AS late FROM o GROUP BY indicator ORDER BY indicator DESC`),
      sql.query(`${cte} SELECT week AS name, count(*)::int AS total, count(*) FILTER (WHERE done)::int AS done, count(*) FILTER (WHERE late)::int AS late,
        COALESCE(sum(work_minutes), 0)::int AS minutes FROM o GROUP BY week ORDER BY week`),
      sql.query(`${cte} SELECT week, person, count(*)::int AS total, count(*) FILTER (WHERE done)::int AS done, count(*) FILTER (WHERE late)::int AS late
        FROM o GROUP BY week, person ORDER BY week, person`),
    ]);
    return NextResponse.json({ groups, p3m, weeks, weekPeople });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: "Falha ao carregar os indicadores.", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
