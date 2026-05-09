# Validation Matrix

Last verified: 2026-05-09

Workspace:

```text
/Users/bytedance/Code/codingdmeo
```

## Verified

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

## Known Limits

- MR comments cannot be posted with SSH Git credentials alone.
- Code platform MR comment automation requires API, browser session, or dedicated CLI support.
- `fix ci`, `address review`, `rebase`, `stop`, and `resume` are command semantics in the skill; production implementations still need platform-specific API wiring.
- DevX write actions are intentionally safe-mode unless explicitly run with `--execute-writes`.

