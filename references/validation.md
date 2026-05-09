# Validation Matrix

Last verified: 2026-05-09 08:45 CST

Workspace:

```text
/Users/bytedance/Code/codingdmeo
```

## Verified

Automated validation now covers 168 cases:

```json
{
  "total": 168,
  "passed": 168,
  "failed": 0
}
```

| Capability | Command / scenario | Result |
| --- | --- | --- |
| Skill metadata | `SKILL.md` frontmatter | valid `name` and `description` |
| Repository state | `git status --short --branch` | clean, tracking `origin/main` |
| Orchestrator syntax | `node --check orchestrator/index.js` | passed |
| Real status | `next-actions --meego 7283953615` | `human:MR review` |
| Reconciliation | `reconcile --meego 7283953615 --json` | AI ready, missing empty |
| Needs human | missing PRD/acceptance synthetic state | `NEEDS_HUMAN_PRD` |
| Wrong Meego ID | nonexistent ID without `--doc` | fails, does not default to first todo |
| Proposal-first | `run-clownfish-flow` without `--execute-writes` | only plan files, `execute=false` |
| Review loop | request changes -> fix -> approve | proof records two review rounds |
| Deploy gate | approved MR -> deploy | safe-mode deploy plan |
| Dev acceptance | accept dev | state records accepted |
| Release gate | release review -> board | safe-mode board plan |
| Done state | board plan exists | next action is `orchestrator:done` |
| Proof | `proof --print` | includes Job / Gate / Next Action |

## Expanded Coverage

| Group | Cases |
| --- | ---: |
| Baseline metadata / syntax / safety | 4 |
| Next action state machine | 18 |
| AI Ready gate | 6 |
| Job artifact creation / status preservation | 2 |
| Proposal-first safe-mode flow | 1 |
| MR review loop | 1 |
| Deploy / board safe-mode | 2 |
| Dev acceptance / release flow | 2 |
| Real requirement regression | 2 |
| Bulk ready gate variants | 25 |
| Bulk missing PRD variants | 20 |
| Bulk missing acceptance variants | 20 |
| Bulk missing scope/component variants | 20 |
| Bulk MR state variants | 30 |
| Bulk release done variants | 15 |

## Issues Found During Expansion

The expanded validation found two real Orchestrator state bugs, both fixed before this matrix passed:

1. Early-stage jobs without MR were being incorrectly routed to DevX dev acceptance.
   - Fix: DevX/deploy/release gates now only activate after MR is approved.
2. `prd.ready=true` was treated as acceptance criteria being clear.
   - Fix: AI Ready now requires explicit acceptance evidence via `checks.has_acceptance=true` or `acceptance_count > 0`.

## Re-run

From this repository:

```bash
node scripts/verify-coding-fish.mjs
```

The script writes the latest machine-readable result to:

```text
references/last-validation-result.json
```

## Known Limits

- MR comments cannot be posted with SSH Git credentials alone.
- Code platform MR comment automation requires API, browser session, or dedicated CLI support.
- `fix ci`, `address review`, `rebase`, `stop`, and `resume` are command semantics in the skill; production implementations still need platform-specific API wiring.
- DevX write actions are intentionally safe-mode unless explicitly run with `--execute-writes`.
