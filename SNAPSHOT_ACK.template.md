# SNAPSHOT_ACK template

Copy this file to `SNAPSHOT_ACK.md` whenever a `tests/**/*.snap` file changes
vs `main`. The `check:snapshot-ack` gate (part of `npm run check`) requires
this file to:

- Contain today's date in `YYYY-MM-DD` format.
- List every changed snapshot file with a one-line justification.

Why: snapshots encode the P6 public-surface and P9 phase-order contracts.
They must not change silently. The ack is committed alongside the snapshot
change so reviewers see *why* the contract moved.

Delete `SNAPSHOT_ACK.md` (not the template) once the snapshot change has
landed on `main` — otherwise it lingers and confuses the next contributor.

---

# SNAPSHOT_ACK

Date: YYYY-MM-DD

- tests/__snapshots__/<file>.snap — one-line justification
- tests/__snapshots__/<other-file>.snap — one-line justification
