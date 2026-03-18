# Inbound Call Test Matrix

This matrix is the operational baseline for inbound caller testing. It mirrors the executable scenarios in `src/testing/inbound-scenarios.ts` and lifecycle checks in `scripts/test-lifecycle.ts`.

## P0 (must pass before release)

| Scenario ID | Intent | Overlay | save_lead | end_call | Owner SMS | Capture target |
| --- | --- | --- | --- | --- | --- | --- |
| `p0_new_job_emergency` | `new_job` | emergency | yes | yes | yes | complete |
| `p0_new_job_partial_info` | `new_job` | partial info | yes | yes | yes | degraded |
| `p0_follow_up_returning_customer` | `follow_up` | returning customer | yes | yes | yes | complete |
| `p0_complaint_escalation` | `complaint` | escalation | yes | yes | yes | complete |
| `p0_out_of_area_job` | `new_job` | out of area | yes | yes | yes | complete |
| `p0_wrong_number` | `wrong_number` | none | no | yes | no | none |
| `p0_spam_or_telemarketer` | `spam` | none | no | yes | no | none |
| `p0_silent_caller` | `silent` | none | no | yes | no | none |
| `p0_abusive_caller` | `abusive` | none | no | yes | no | none |

## P1/P2 (regression and expansion)

- P1: `reschedule`, `quote_only`, `supplier` flows.
- P2: `trade_referral`, `job_applicant`, `unknown` fallback intent.

## Unified Assertions (every scenario)

For each scenario, assert this fixed order:

1. **Routing**: tenant routing and fallback behavior are deterministic.
2. **Tool call**: `save_lead` behavior matches scenario expectation.
3. **Call termination**: `end_call` always fires exactly once.
4. **Persistence**: call/lead data is written safely and idempotently.
5. **Notification**: owner SMS is sent/suppressed by intent policy.
6. **Dashboard**: lead visibility and status are correct for tenant scope.

## Dialog Quality Gates

### Complete Capture (target)

Required fields:

- `name`
- `callback_number`
- `summary`
- `urgency`
- `intent`

Result: `pass_complete`.

### Degraded But Actionable (allowed fallback)

Minimum required:

- `callback_number`
- `summary`

Result: `pass_degraded` (must still persist lead and notify owner when intent is actionable).

### Failure

If callback number or summary is missing, result is `fail`.

## Webhook Resilience Cases

Release-blocking webhook checks:

- duplicate `/twilio/voice/status` completed event remains idempotent.
- `/twilio/voice/recording` without `RecordingUrl` is handled gracefully.
- `/twilio/voice/transfer-fallback` returns valid stream TwiML (non-prod).
- retrying `/twilio/voice/incoming` with same `CallSid` returns valid TwiML and does not crash.

## Release Checklist

- [ ] All P0 scenarios green in CI.
- [ ] Quality gates: complete/degraded/fail behavior validated.
- [ ] Webhook resilience suite green.
- [ ] Multi-tenant lead isolation test green.
- [ ] Manual sample review: at least 10 call transcripts/recordings spot-checked.
