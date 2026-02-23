import fetch from "node-fetch";
import { env } from "../env.js";
import type { LeadRow } from "../db/repo.js";
import type { CrmExportResult, CrmExporter } from "./types.js";

export function createAirtableExporter(): CrmExporter | null {
  if (!env.AIRTABLE_API_TOKEN || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_NAME) return null;
  return {
    destination: `airtable:${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_NAME}`,
    async exportLead(lead: LeadRow): Promise<CrmExportResult> {
      const url = `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID!)}/${encodeURIComponent(
        env.AIRTABLE_TABLE_NAME!
      )}`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            fields: {
              CallId: lead.call_id,
              Name: lead.name ?? undefined,
              Phone: lead.phone ?? undefined,
              Address: lead.address ?? undefined,
              IssueSummary: lead.issue_summary ?? undefined,
              IssueType: lead.issue_type ?? undefined,
              Urgency: lead.urgency_level ?? undefined,
              PreferredTime: lead.preferred_time ?? undefined,
              Notes: lead.notes ?? undefined,
              NextAction: lead.next_action ?? undefined,
              Confidence: lead.confidence ?? undefined,
              CreatedAt: lead.created_at
            }
          })
        });

        if (!resp.ok) {
          const text = await resp.text();
          return { ok: false, destination: this.destination, error: `HTTP ${resp.status}: ${text}` };
        }
        return { ok: true, destination: this.destination };
      } catch (e: any) {
        return { ok: false, destination: this.destination, error: e?.message ?? String(e) };
      }
    }
  };
}

