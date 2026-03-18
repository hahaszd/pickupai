import { NO_SMS_INTENTS } from "../twilio/sms.js";

export type InboundIntent =
  | "new_job"
  | "follow_up"
  | "complaint"
  | "reschedule"
  | "quote_only"
  | "wrong_number"
  | "spam"
  | "telemarketer"
  | "job_applicant"
  | "supplier"
  | "trade_referral"
  | "silent"
  | "abusive"
  | "unknown";

export type ScenarioPriority = "P0" | "P1" | "P2";
export type CaptureTarget = "complete" | "degraded" | "none";

export type InboundScenario = {
  id: string;
  priority: ScenarioPriority;
  intent: InboundIntent;
  category: "core" | "noise" | "risk-overlay";
  label: string;
  overlays?: Array<"emergency" | "out_of_area" | "returning_customer" | "out_of_scope" | "partial_info">;
  assertions: {
    shouldSaveLead: boolean;
    shouldEndCall: boolean;
    shouldSendOwnerSms: boolean;
    captureTarget: CaptureTarget;
    expectedLeadStatus?: "new" | "called_back" | "booked" | "handled";
  };
};

export type CaptureInput = {
  name?: string | null;
  phone?: string | null;
  issue_summary?: string | null;
  urgency_level?: "emergency" | "urgent" | "routine" | null;
  caller_intent?: string | null;
  address?: string | null;
};

export type CaptureQuality = {
  level: "pass_complete" | "pass_degraded" | "fail";
  missingCoreFields: string[];
  reason: string;
};

const CORE_FIELDS = ["name", "phone", "issue_summary", "urgency_level", "caller_intent"] as const;

function isNonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateCaptureQuality(input: CaptureInput): CaptureQuality {
  const missingCoreFields = CORE_FIELDS.filter((field) => {
    const val = (input as Record<string, unknown>)[field];
    return !isNonEmpty(val);
  });

  const hasCallback = isNonEmpty(input.phone);
  const hasSummary = isNonEmpty(input.issue_summary);

  if (missingCoreFields.length === 0) {
    return {
      level: "pass_complete",
      missingCoreFields,
      reason: "all core fields collected"
    };
  }

  // Degraded but acceptable when we still captured enough for a callback.
  if (hasCallback && hasSummary) {
    return {
      level: "pass_degraded",
      missingCoreFields,
      reason: "fallback path: phone number and issue summary captured"
    };
  }

  return {
    level: "fail",
    missingCoreFields,
    reason: "insufficient data for follow-up"
  };
}

export const INBOUND_SCENARIO_MATRIX: InboundScenario[] = [
  {
    id: "p0_new_job_emergency",
    priority: "P0",
    intent: "new_job",
    category: "core",
    label: "New job with active emergency risk",
    overlays: ["emergency"],
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p0_new_job_partial_info",
    priority: "P0",
    intent: "new_job",
    category: "risk-overlay",
    label: "New job with partial details before caller drops",
    overlays: ["partial_info"],
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p0_follow_up_returning_customer",
    priority: "P0",
    intent: "follow_up",
    category: "core",
    label: "Returning customer asks for follow-up",
    overlays: ["returning_customer"],
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p0_complaint_escalation",
    priority: "P0",
    intent: "complaint",
    category: "core",
    label: "Complaint requiring urgent owner callback",
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p0_out_of_area_job",
    priority: "P0",
    intent: "new_job",
    category: "risk-overlay",
    label: "Job appears outside service area",
    overlays: ["out_of_area"],
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p0_wrong_number",
    priority: "P0",
    intent: "wrong_number",
    category: "noise",
    label: "Wrong number call",
    assertions: {
      shouldSaveLead: false,
      shouldEndCall: true,
      shouldSendOwnerSms: false,
      captureTarget: "none"
    }
  },
  {
    id: "p0_spam_or_telemarketer",
    priority: "P0",
    intent: "spam",
    category: "noise",
    label: "Spam or telemarketing call",
    assertions: {
      shouldSaveLead: false,
      shouldEndCall: true,
      shouldSendOwnerSms: false,
      captureTarget: "none"
    }
  },
  {
    id: "p0_silent_caller",
    priority: "P0",
    intent: "silent",
    category: "noise",
    label: "Silent caller after prompt retries",
    assertions: {
      shouldSaveLead: false,
      shouldEndCall: true,
      shouldSendOwnerSms: false,
      captureTarget: "none"
    }
  },
  {
    id: "p0_abusive_caller",
    priority: "P0",
    intent: "abusive",
    category: "noise",
    label: "Abusive caller after one warning",
    assertions: {
      shouldSaveLead: false,
      shouldEndCall: true,
      shouldSendOwnerSms: false,
      captureTarget: "none"
    }
  },
  {
    id: "p1_reschedule",
    priority: "P1",
    intent: "reschedule",
    category: "core",
    label: "Reschedule existing booking",
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p1_quote_only",
    priority: "P1",
    intent: "quote_only",
    category: "core",
    label: "Quote-only enquiry",
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p1_supplier_call",
    priority: "P1",
    intent: "supplier",
    category: "core",
    label: "Supplier call routed as non-job but actionable",
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p2_trade_referral",
    priority: "P2",
    intent: "trade_referral",
    category: "core",
    label: "Trade referral for collaboration",
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded",
      expectedLeadStatus: "new"
    }
  },
  {
    id: "p2_job_applicant",
    priority: "P2",
    intent: "job_applicant",
    category: "noise",
    label: "Job applicant call",
    assertions: {
      shouldSaveLead: false,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "none"
    }
  },
  {
    id: "p2_unknown",
    priority: "P2",
    intent: "unknown",
    category: "core",
    label: "Unknown intent fallback with minimal details",
    assertions: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded",
      expectedLeadStatus: "new"
    }
  }
];

export function expectedSmsForIntent(intent: InboundIntent): boolean {
  return !NO_SMS_INTENTS.has(intent);
}
