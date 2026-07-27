import type { EvalScenario } from "../types.js";
import { PLUMBER_SCENARIOS } from "./plumber.js";
import { ELECTRICIAN_SCENARIOS } from "./electrician.js";
import { ROOFER_SCENARIOS } from "./roofer.js";
import { HANDYMAN_SCENARIOS } from "./handyman.js";

export const ALL_EVAL_SCENARIOS: EvalScenario[] = [
  ...PLUMBER_SCENARIOS,
  ...ELECTRICIAN_SCENARIOS,
  ...ROOFER_SCENARIOS,
  ...HANDYMAN_SCENARIOS
];
