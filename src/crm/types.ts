import type { LeadRow } from "../db/repo.js";

export type CrmExportResult =
  | { ok: true; destination: string }
  | { ok: false; destination: string; error: string };

export interface CrmExporter {
  destination: string;
  exportLead(lead: LeadRow): Promise<CrmExportResult>;
}

