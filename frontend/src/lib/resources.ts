import { db } from "./db";
import { Resource, ResourceStatus, ResourceType } from "./types";

interface ResourceRow {
  id: string;
  request_id: string;
  name: string;
  type: string;
  source: string;
  content: string;
  status: string;
  error: string | null;
  created_at: string;
}

function rowToResource(r: ResourceRow): Resource {
  return {
    id: r.id,
    request_id: r.request_id,
    name: r.name,
    type: r.type as ResourceType,
    source: r.source,
    content: r.content,
    status: r.status as ResourceStatus,
    error: r.error,
    created_at: r.created_at,
  };
}

export function listResources(requestId: string): Resource[] {
  const rows = db()
    .prepare<[string], ResourceRow>(
      `SELECT * FROM resources WHERE request_id = ? ORDER BY created_at ASC`,
    )
    .all(requestId);
  return rows.map(rowToResource);
}

export function getResource(id: string): Resource | null {
  const row = db()
    .prepare<[string], ResourceRow>(`SELECT * FROM resources WHERE id = ?`)
    .get(id);
  return row ? rowToResource(row) : null;
}

export function deleteResource(id: string): boolean {
  const info = db().prepare(`DELETE FROM resources WHERE id = ?`).run(id);
  return info.changes > 0;
}
