import { NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/permissions";
import { usernameFromDisplayName } from "@/lib/username";

export const runtime = "nodejs";
type ImportRow = { external_key: string; order_number: string | null; title: string; description: string | null; location: string | null; equipment: string | null; assigned_username: string | null; priority: "low" | "normal" | "high" | "critical"; scheduled_for: string | null; work_minutes: number; source_data: Record<string, unknown> };
function clean(value: unknown) { return value == null ? "" : String(value).trim(); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function normalizedKey(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function pick(row: Record<string, unknown>, aliases: string[]) {
  const values = new Map(Object.entries(row).map(([k,v]) => [normalizedKey(k), v]));
  for (const alias of aliases) { const value = values.get(normalizedKey(alias)); if (value !== undefined && clean(value)) return clean(value); }
  return "";
}
function parseRows(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const first = workbook.SheetNames[0];
  if (!first) throw new Error("A planilha não contém abas.");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[first], { defval: "" });
  if (!raw.length) throw new Error("A primeira aba não contém linhas de dados.");
  const rows = raw.map((r, index) => {
    const order = pick(r, ["ordem", "ordem de serviço", "os", "numero os", "número da ordem", "order number", "id"]);
    const title = pick(r, ["txt", "atividade", "atividade/serviço", "servico", "serviço", "tarefa", "titulo", "título", "descricao", "descrição"]) || (order ? `Ordem ${order}` : "Trabalho");
    const equipment = pick(r, ["equipamento", "ativo", "máquina", "maquina"]);
    const location = pick(r, ["local de instalação", "local instalação", "local", "localização", "localizacao", "setor", "área", "area"]);
    const description = pick(r, ["descrição detalhada", "descricao detalhada", "observação", "observacao", "detalhes"]);
    const technician = pick(r, ["nome", "técnico", "tecnico", "responsável", "responsavel", "executor"]);
    const priorityRaw = pick(r, ["prioridade", "criticidade"]).toLowerCase();
    const priority: ImportRow["priority"] = /crit|urgente/.test(priorityRaw) ? "critical" : /alta|high/.test(priorityRaw) ? "high" : /baixa|low/.test(priorityRaw) ? "low" : "normal";
    const dateRaw = pick(r, ["data", "data prevista", "prazo", "scheduled for"]);
    const date = dateRaw ? new Date(dateRaw) : null;
    const scheduled_for = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0,10) : null;
    const workRaw = pick(r, ["trabalho", "tempo de trabalho", "tempo", "minutos", "work minutes"]);
    const workMinutes = workRaw ? Number(workRaw.replace(",", ".")) : 0;
    if (!Number.isFinite(workMinutes) || workMinutes < 0) throw new Error(`Linha ${index + 2}: Trabalho deve ser informado em minutos válidos.`);
    const stable = order || [title, equipment, location].filter(Boolean).join("|");
    if (!stable || !title) throw new Error(`Linha ${index + 2}: não foi possível identificar a ordem ou a atividade.`);
    const external_key = order ? `os:${order.toLowerCase()}` : `hash:${createHash("sha256").update(stable.toLowerCase()).digest("hex").slice(0,32)}`;
    return { external_key, order_number: order || null, title, description: description || null, location: location || null, equipment: equipment || null, assigned_username: technician ? usernameFromDisplayName(technician) : null, priority, scheduled_for, work_minutes: Math.round(workMinutes), source_data: { ...r, __gera: { name: technician, indicator: pick(r, ["indicador"]), week: pick(r, ["semana"]), work_minutes: Math.round(workMinutes) } } };
  });
  const seen = new Set<string>();
  for (const row of rows) { if (seen.has(row.external_key)) throw new Error(`A planilha contém identificador duplicado: ${row.order_number ?? row.title}.`); seen.add(row.external_key); }
  return rows;
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const form = await request.formData();
    const file = form.get("file");
    const apply = form.get("apply") === "true";
    if (!(file instanceof File)) return NextResponse.json({ error: "Envie um arquivo Excel (.xlsx, .xls) ou CSV." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "O arquivo deve ter no máximo 10 MB." }, { status: 413 });
    const allowed = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!allowed) return NextResponse.json({ error: "Formato não suportado. Use .xlsx, .xls ou .csv." }, { status: 415 });
    const rows = parseRows(Buffer.from(await file.arrayBuffer()));
    const sql = db();
    const keys = rows.map(r => r.external_key);
    const existing = keys.length ? await sql`SELECT external_key, order_number, title, description, location, equipment, priority, assigned_username, scheduled_for, status, source_data, work_minutes FROM work_orders WHERE external_key = ANY(${keys})` : [];
    const existingMap = new Map<string, Record<string, unknown>>(existing.map((r: Record<string, unknown>) => [String(r.external_key), r] as [string, Record<string, unknown>]));
    const actionFor = (r: ImportRow) => {
      const current = existingMap.get(r.external_key);
      if (!current) return "new";
      const changed = String(current.order_number ?? "") !== String(r.order_number ?? "")
        || String(current.title ?? "") !== r.title
        || String(current.description ?? "") !== String(r.description ?? "")
        || String(current.location ?? "") !== String(r.location ?? "")
        || String(current.equipment ?? "") !== String(r.equipment ?? "")
        || String(current.priority ?? "") !== r.priority
        || String(current.assigned_username ?? "") !== String(r.assigned_username ?? "")
        || String(current.scheduled_for ?? "").slice(0,10) !== String(r.scheduled_for ?? "")
        || Number(current.work_minutes ?? 0) !== r.work_minutes
        || canonical(current.source_data ?? {}) !== canonical(r.source_data);
      return changed ? "changed" : "unchanged";
    };
    const actions = new Map(rows.map(r => [r.external_key, actionFor(r)]));
    const absent = keys.length
      ? await sql`SELECT count(*)::int AS count FROM work_orders WHERE NOT (external_key = ANY(${keys}))`
      : await sql`SELECT count(*)::int AS count FROM work_orders`;
    const summary = {
      total: rows.length,
      new: rows.filter(r => actions.get(r.external_key) === "new").length,
      changed: rows.filter(r => actions.get(r.external_key) === "changed").length,
      unchanged: rows.filter(r => actions.get(r.external_key) === "unchanged").length,
      existing: rows.filter(r => actions.get(r.external_key) !== "new").length,
      notInFile: Number(absent[0]?.count ?? 0),
      completedPreserved: rows.filter(r => String(existingMap.get(r.external_key)?.status ?? "") === "completed").length,
      preview: rows.slice(0, 100).map(r => ({ order: r.order_number, title: r.title, equipment: r.equipment, location: r.location, assigned: r.assigned_username, priority: r.priority, scheduled_for: r.scheduled_for, work_minutes: r.work_minutes, name: (r.source_data.__gera as Record<string, unknown> | undefined)?.name, indicator: (r.source_data.__gera as Record<string, unknown> | undefined)?.indicator, week: (r.source_data.__gera as Record<string, unknown> | undefined)?.week, action: actions.get(r.external_key) })),
    };
    if (!apply) return NextResponse.json({ summary, message: "Prévia gerada. Confirme para aplicar a importação." });
    const importId = randomUUID();
    const statements = [
      sql`INSERT INTO imports (id, filename, uploaded_by, status, total_rows, created_count, updated_count, unchanged_count, summary) VALUES (${importId}, ${file.name}, ${actor.auth_user_id}, 'applied', ${rows.length}, ${summary.new}, ${summary.changed}, ${summary.unchanged}, ${JSON.stringify(summary)}::jsonb)`
    ];
    for (const r of rows) {
      statements.push(sql`WITH upserted AS (
        INSERT INTO work_orders (external_key, order_number, title, description, location, equipment, priority, assigned_username, scheduled_for, source_data, work_minutes, last_import_id)
        VALUES (${r.external_key}, ${r.order_number}, ${r.title}, ${r.description}, ${r.location}, ${r.equipment}, ${r.priority}, ${r.assigned_username}, ${r.scheduled_for}, ${JSON.stringify(r.source_data)}::jsonb, ${r.work_minutes}, ${importId})
        ON CONFLICT (external_key) DO UPDATE SET order_number = EXCLUDED.order_number, title = EXCLUDED.title, description = EXCLUDED.description, location = EXCLUDED.location, equipment = EXCLUDED.equipment, priority = EXCLUDED.priority, assigned_username = EXCLUDED.assigned_username, scheduled_for = EXCLUDED.scheduled_for, source_data = EXCLUDED.source_data, work_minutes = EXCLUDED.work_minutes, last_import_id = EXCLUDED.last_import_id, updated_at = now()
        WHERE work_orders.order_number IS DISTINCT FROM EXCLUDED.order_number OR work_orders.title IS DISTINCT FROM EXCLUDED.title OR work_orders.description IS DISTINCT FROM EXCLUDED.description OR work_orders.location IS DISTINCT FROM EXCLUDED.location OR work_orders.equipment IS DISTINCT FROM EXCLUDED.equipment OR work_orders.priority IS DISTINCT FROM EXCLUDED.priority OR work_orders.assigned_username IS DISTINCT FROM EXCLUDED.assigned_username OR work_orders.scheduled_for IS DISTINCT FROM EXCLUDED.scheduled_for OR work_orders.source_data IS DISTINCT FROM EXCLUDED.source_data OR work_orders.work_minutes IS DISTINCT FROM EXCLUDED.work_minutes
        RETURNING id
      )
      INSERT INTO order_events (work_order_id, event_type, actor_auth_user_id, details)
      SELECT id, ${existingMap.has(r.external_key) ? 'import.updated' : 'import.created'}, ${actor.auth_user_id}, ${JSON.stringify({ importId, filename: file.name })}::jsonb FROM upserted`);
    }
    statements.push(sql`INSERT INTO audit_logs (actor_auth_user_id, action, entity_type, entity_id, details) VALUES (${actor.auth_user_id}, 'orders.imported', 'import', ${importId}, ${JSON.stringify({ filename: file.name, total: rows.length, new: summary.new, changed: summary.changed, unchanged: summary.unchanged, notInFile: summary.notInFile })}::jsonb)`);
    await sql.transaction(statements);
    return NextResponse.json({ summary, importId, message: "Importação aplicada. Ordens concluídas tiveram seu status preservado; itens ausentes no arquivo não foram excluídos." });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na importação." }, { status: 400 });
  }
}
