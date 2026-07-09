# docs/adr/ — Architecture Decision Records

Any non-trivial architectural choice must be logged here as a dated, numbered entry **before** implementation begins.

## Convention

| Field | Rule |
|-------|------|
| Filename | `NNNN-title-with-dashes.md` (zero-padded, e.g. `0001-use-workers.md`) |
| Status | `proposed` → `accepted` | `superseded` | `deprecated` |
| Required sections | Title, Date, Status, Context, Decision, Consequences |

## Process

1. Create the ADR file with status `proposed` before writing code.
2. If the decision is revisited later, update the status to `superseded` and link to the new ADR.

This keeps a permanent, auditable record of why the system is the way it is.
