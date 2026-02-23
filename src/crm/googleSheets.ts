import { readFile } from "node:fs/promises";
import fetch from "node-fetch";
import { GoogleAuth } from "google-auth-library";
import { env } from "../env.js";
import type { LeadRow } from "../db/repo.js";
import type { CrmExportResult, CrmExporter } from "./types.js";

export function createGoogleSheetsExporter(): CrmExporter | null {
  if (
    !env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    !env.GOOGLE_SHEETS_WORKSHEET_NAME ||
    !env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH
  ) {
    return null;
  }

  return {
    destination: `sheets:${env.GOOGLE_SHEETS_SPREADSHEET_ID}/${env.GOOGLE_SHEETS_WORKSHEET_NAME}`,
    async exportLead(lead: LeadRow): Promise<CrmExportResult> {
      try {
        // Validate service account JSON early for clearer errors.
        await readFile(env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH!, "utf8");

        const auth = new GoogleAuth({
          keyFile: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH!,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"]
        });
        const client = await auth.getClient();
        const tokenResp: any = await client.getAccessToken();
        const token = typeof tokenResp === "string" ? tokenResp : tokenResp?.token;
        if (!token) {
          return { ok: false, destination: this.destination, error: "Failed to obtain Google access token" };
        }

        const range = `${env.GOOGLE_SHEETS_WORKSHEET_NAME!}!A1`;
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          env.GOOGLE_SHEETS_SPREADSHEET_ID!
        )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

        const values = [
          [
            lead.created_at,
            lead.call_id,
            lead.name ?? "",
            lead.phone ?? "",
            lead.address ?? "",
            lead.issue_type ?? "",
            lead.issue_summary ?? "",
            lead.urgency_level ?? "",
            lead.preferred_time ?? "",
            lead.next_action ?? "",
            lead.notes ?? "",
            lead.confidence ?? ""
          ]
        ];

        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ values })
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

