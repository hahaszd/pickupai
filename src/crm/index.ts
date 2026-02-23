import type { LeadRow } from "../db/repo.js";
import type { CrmExporter, CrmExportResult } from "./types.js";
import { createAirtableExporter } from "./airtable.js";
import { createGoogleSheetsExporter } from "./googleSheets.js";

export function createCrmExporters(): CrmExporter[] {
  const exporters: (CrmExporter | null)[] = [createAirtableExporter(), createGoogleSheetsExporter()];
  return exporters.filter(Boolean) as CrmExporter[];
}

export async function exportLeadToCrm(exporters: CrmExporter[], lead: LeadRow): Promise<CrmExportResult[]> {
  if (exporters.length === 0) return [];
  const results: CrmExportResult[] = [];
  for (const ex of exporters) {
    results.push(await ex.exportLead(lead));
  }
  return results;
}

