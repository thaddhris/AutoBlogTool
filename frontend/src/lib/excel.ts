import * as XLSX from "xlsx";
import { createRequest, CreateRequestInput, listRequests } from "./requests";
import { BlogRequest } from "./types";

const HEADERS = ["label", "topic", "keywords", "instructions", "priority"];

export function templateBuffer(): Buffer {
  const example = [
    {
      label: "Why predictive maintenance matters in cement plants",
      topic:
        "Predictive maintenance for rotary kilns: how IoT + AI cut unplanned downtime",
      keywords: "predictive maintenance, cement plant, rotary kiln, IoT",
      instructions: "Aim for plant operations heads, emphasize ROI numbers",
      priority: 10,
    },
    {
      label: "OEE basics for plant managers",
      topic: "What OEE is, how it's measured, and quick wins to improve it",
      keywords: "OEE, overall equipment effectiveness, manufacturing KPI",
      instructions: "",
      priority: 0,
    },
  ];
  const ws = XLSX.utils.json_to_sheet(example, { header: HEADERS });
  ws["!cols"] = [
    { wch: 40 },
    { wch: 60 },
    { wch: 40 },
    { wch: 40 },
    { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BlogRequests");
  const arr = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(arr as ArrayBuffer);
}

export function exportBuffer(rows?: BlogRequest[]): Buffer {
  const all = rows ?? listRequests();
  const flat = all.map((r) => ({
    label: r.label,
    topic: r.topic,
    keywords: r.keywords.join(", "),
    instructions: r.instructions,
    priority: r.priority,
    status: r.status,
    created_at: r.created_at,
  }));
  const ws = XLSX.utils.json_to_sheet(flat, {
    header: [...HEADERS, "status", "created_at"],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BlogRequests");
  const arr = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(arr as ArrayBuffer);
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

export function importBuffer(buf: Buffer): ImportResult {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { created: 0, skipped: 0, errors: [{ row: 0, error: "Empty workbook" }] };
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const out: ImportResult = { created: 0, skipped: 0, errors: [] };
  rows.forEach((row, idx) => {
    const label = String(row.label ?? "").trim();
    const topic = String(row.topic ?? "").trim();
    if (!label || !topic) {
      out.skipped++;
      return;
    }
    const keywords = String(row.keywords ?? "")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const instructions = String(row.instructions ?? "").trim();
    const priorityRaw = row.priority;
    const priority =
      typeof priorityRaw === "number"
        ? priorityRaw
        : parseInt(String(priorityRaw || "0"), 10) || 0;
    try {
      const input: CreateRequestInput = {
        label,
        topic,
        keywords,
        instructions,
        priority,
      };
      createRequest(input);
      out.created++;
    } catch (err) {
      out.errors.push({
        row: idx + 2, // +2: header row + 1-indexed
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  return out;
}
