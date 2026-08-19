import { getDb } from "@/lib/db";
import { notifyLibraryChange } from "@/lib/libraryEvents";

// 데이터 백업/복원 — 일회성 상태인 activeSession을 제외한 전 테이블을 JSON으로 내보내고 id 기준 병합 복원 (스펙 §82)
// Data backup/restore — exports every table except the transient activeSession, restores with id-based merge (spec §82)
// 주의: 백업 유틸 성격상 Repository 경계 대신 DB에 직접 접근한다 (Supabase 전환 시 재작성 대상)
// Note: as a backup utility this bypasses the repository boundary (rewrite when moving to Supabase)

const EXPORT_VERSION = 1;

const TABLE_NAMES = [
  "books",
  "userBooks",
  "readingSessions",
  "preferences",
  "aiProfiles",
  "recommendations",
  "notes",
  "quotes",
  "goals",
  "wrapped",
] as const;

type TableName = (typeof TABLE_NAMES)[number];

interface ExportPayload {
  app: "rive";
  version: number;
  exportedAt: number;
  tables: Partial<Record<TableName, unknown[]>>;
}

export async function exportAllData(): Promise<void> {
  const db = getDb();
  const tables: ExportPayload["tables"] = {};
  for (const name of TABLE_NAMES) {
    tables[name] = await db.table(name).toArray();
  }
  const payload: ExportPayload = {
    app: "rive",
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    tables,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rive-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  imported: number;
}

export async function importAllData(file: File): Promise<ImportResult> {
  const text = await file.text();
  const payload = JSON.parse(text) as ExportPayload;

  if (payload.app !== "rive" || typeof payload.version !== "number" || !payload.tables) {
    throw new Error("not a rive backup file");
  }

  // 앱보다 새 버전의 백업은 스키마를 알 수 없으므로 거부한다 (5차 조사 L15)
  // Reject backups newer than the app — their schema is unknown here (audit 5 L15)
  if (payload.version > EXPORT_VERSION) {
    throw new Error(`unsupported backup version: ${payload.version}`);
  }

  const db = getDb();
  let imported = 0;
  for (const name of TABLE_NAMES) {
    const rows = payload.tables[name];
    if (!Array.isArray(rows) || rows.length === 0) {
      continue;
    }
    // 동일 id는 백업 내용으로 덮어쓰고, 없는 항목은 추가한다 (병합 복원)
    // Same-id rows are overwritten by the backup; new rows are added (merge restore)
    await db.table(name).bulkPut(rows);
    imported += rows.length;
  }

  notifyLibraryChange();
  return { imported };
}
