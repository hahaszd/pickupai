# Issue tracker

**There isn't one.** This is a single-developer repo: 124 commits by one author,
GitHub Issues empty, no PRDs, no `.scratch/`. Work is decided in conversation and
recorded — when it is architectural — as an ADR under `docs/adr/`.

This file exists so skills that expect a tracker stop asking.

## For `/code-review`

Run the **Standards** axis against [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md).

**Skip the Spec axis** unless the user passes a spec path explicitly. Commit
messages carry no issue references, so there is nothing to fetch, and a review
that reports "no spec available" every time is noise rather than signal.

## For `/research`

Write findings to `docs/research/<topic>.md`.

## If this changes

Adopting a real tracker means running `/setup-matt-pocock-skills`, which also
unlocks `to-tickets`, `triage` and `to-spec`. That was considered and deferred:
those skills coordinate work across people, and this repo has one. Revisit when
a second person starts committing.
