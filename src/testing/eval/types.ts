import type { InboundIntent, ScenarioPriority, CaptureTarget } from "../inbound-scenarios.js";

/** Fields a scenario can require the assistant to have captured. */
export type CaptureField =
  | "name"
  | "phone"
  | "address"
  | "issue_summary"
  | "urgency_level"
  | "caller_intent";

/**
 * One evaluated call.
 *
 * The existing INBOUND_SCENARIO_MATRIX classifies calls by *intent* and says
 * what should happen. It cannot say what the caller actually said, so nothing
 * could ever run it — the eval was a taxonomy, not a test. This type adds the
 * two things a runnable scenario needs: a caller who can hold a conversation,
 * and assertions about what the assistant said, not just what it saved.
 */
export type EvalScenario = {
  id: string;
  /** Drives which TRADE_CONFIGS entry the system prompt is built from. */
  trade: "plumber" | "electrician" | "roofer" | "handyman";
  priority: ScenarioPriority;
  intent: InboundIntent;
  label: string;

  /** The caller's first line, verbatim. */
  callerOpening: string;

  /**
   * Facts the caller knows, in the order they would volunteer them.
   *
   * These are NOT a script. A fixed script derails the moment the assistant
   * asks something the script did not anticipate — it answers "is it still
   * raining?" with "my name's Dave". The caller is played by a model that is
   * given these as things it knows and told to answer naturally, revealing a
   * fact only when actually asked or when it would come up.
   */
  callerFacts: string[];

  /**
   * How this caller is difficult. Fed to the caller model as behaviour, e.g.
   * "you are panicking and talk over the assistant", "you do not know your
   * street address", "you keep pushing for a price".
   */
  callerBehaviour?: string[];

  /** Fields that must be captured for this call to count as handled. */
  mustCapture: CaptureField[];

  expected: {
    shouldSaveLead: boolean;
    shouldEndCall: boolean;
    shouldSendOwnerSms: boolean;
    captureTarget: CaptureTarget;
    /** When set, the saved urgency must be exactly this. */
    urgencyLevel?: "emergency" | "urgent" | "routine";
  };

  /**
   * Assertions about what the assistant *said*. This is the half the current
   * matrix cannot express, and it is where every safety finding lives — an
   * assistant can save a perfect lead while having told the caller to open a
   * burning switchboard.
   *
   * Phrase these as outcomes, not wordings: "told the caller to get away from
   * the switchboard and call 000", not a literal sentence.
   */
  mustSay?: string[];
  mustNotSay?: string[];

  /** One sentence: the real-world failure this scenario exists to catch. */
  whyThisMatters: string;
};

/** Result of grading a single scenario run. */
export type EvalResult = {
  scenarioId: string;
  trade: string;
  priority: ScenarioPriority;
  passed: boolean;
  failures: string[];
  /** Everything the assistant saved, merged across progressive save_lead calls. */
  captured: Record<string, unknown>;
  savedLead: boolean;
  endedCall: boolean;
  /**
   * The caller hung up first. In production that fires Twilio's stop event and
   * the server tears the call down, so the line does not stay open — it is a
   * legitimate ending, just not the preferred one.
   */
  callerHungUp: boolean;
  turnCount: number;
  transcript: Array<{ role: "caller" | "assistant" | "tool"; text: string }>;
};

export type EvalSummary = {
  total: number;
  passed: number;
  failed: number;
  /** P0 failures are release blockers; everything else is a backlog item. */
  p0Failed: number;
  results: EvalResult[];
};
