---
name: coding-fish
description: Use this skill when orchestrating Meego-first AI coding work inspired by OpenClaw Clownfish and Codex Symphony: convert a Meego work item into a curated job/cluster, run AI Ready gates, manage proposal-first agent execution, route code review to MR, route status/proof to Meego, handle CI/review/rebase/stop/resume control commands, and produce an auditable Proof Packet.
---

# Coding Fish

Coding Fish is a Meego-first AI coding orchestration workflow. It is inspired by Clownfish's curated issue/PR cluster model, but adapted for enterprise product development across Meego, MR, DevX, CI, and release trains.

## Core Rule

Do not let the agent scan the backlog and choose work autonomously.

Always start from an explicit curated input:

- Meego work item ID
- PRD link or field
- target repo
- base branch
- feature branch
- human trigger or approval

## Platform Boundaries

| Platform | Owns | Do not use it for |
| --- | --- | --- |
| Meego | requirement, PRD readiness, workflow status, Proof link | line-level code review |
| MR | diff, inline comments, request changes, approval, CI surface | requirement state machine |
| DevX | sandbox, dev task, dev deploy, boarding/release execution | PRD readiness decision |
| Orchestrator | state reconciliation, job/gate, agent dispatch, Proof | bypassing human gates |
| Coding Agent | scoped code changes, CI fixes, review fixes | choosing unrelated work |

## Standard Workflow

1. Query Meego todo.
2. Read PRD.
3. Prepare job / cluster.
4. Run AI Ready gate.
5. If missing information, stop with `NEEDS_HUMAN_*`.
6. If ready, start proposal-first coding.
7. Create or update Draft MR.
8. Route code review to MR.
9. Address review comments only after explicit MR feedback.
10. Trigger DevX dev deploy only after MR approval.
11. Record dev acceptance.
12. Run release review.
13. Board to release train only after release review.
14. Update Proof Packet.

## Local Orchestrator Commands

Run from the orchestrator workspace, usually:

```bash
cd /Users/bytedance/Code/codingdmeo
```

Core commands:

```bash
node orchestrator/index.js todo --mine --json
node orchestrator/index.js prd --meego <meego_id> --json
node orchestrator/index.js prepare-job --meego <meego_id> --cluster meego-<meego_id> --repo <group/repo> --base master --branch feat/demo-xxx
node orchestrator/index.js ai-ready-check --meego <meego_id> --json
node orchestrator/index.js next-actions --meego <meego_id>
node orchestrator/index.js reconcile --meego <meego_id> --json
node orchestrator/index.js proof --meego <meego_id> --print
```

Proposal run:

```bash
node orchestrator/index.js run-clownfish-flow \
  --meego <meego_id> \
  --branch feat/demo-xxx \
  --version <version> \
  --repo <group/repo> \
  --base master
```

Write actions require explicit confirmation and usually `--execute-writes`.

## Slash Command Semantics

If the user asks for slash commands, map them to the orchestrator behavior:

| Command | Meaning | Underlying action |
| --- | --- | --- |
| `/clownfish status` | Show current state, MR, Proof, next action | `reconcile` + `next-actions` |
| `/clownfish explain` | Explain why it is blocked and who acts next | Proof + reconciliation |
| `/clownfish start` | Create job and run AI Ready gate | `prepare-job` + `ai-ready-check` |
| `/clownfish fix ci` | Inspect CI failure, patch, push, update Proof | CI logs + agent fix |
| `/clownfish address review` | Address unresolved MR comments | MR comments + `review-fix` |
| `/clownfish rebase` | Rebase on base branch, resolve conflicts, validate | Git rebase + tests |
| `/clownfish stop` | Mark run stopped and prevent writes | state update |
| `/clownfish resume` | Resume after human approval | gate check + next action |

If slash command infrastructure does not exist yet, use CLI commands and report the equivalent slash command behavior.

## AI Ready Gate

Before coding, check:

- PRD exists and is readable.
- Acceptance criteria are testable.
- Repo, base branch, and target branch are clear.
- Scope and affected component are clear.
- Human has triggered or approved AI development.
- Risk and rollback can be summarized.

If any item is missing, stop and produce one of:

```text
NEEDS_HUMAN_PRD
NEEDS_HUMAN_ACCEPTANCE
NEEDS_HUMAN_SCOPE
NEEDS_HUMAN_COMPONENT
NEEDS_HUMAN_TRIGGER
NEEDS_HUMAN_REVIEW
NEEDS_HUMAN_DEPLOY
NEEDS_HUMAN_RELEASE
```

## MR Review Rules

Code review belongs in MR, not Meego.

Meego should contain only:

- current status
- MR link
- next action
- Proof link
- short summary

MR should contain:

- review comments
- request changes
- approval
- CI status
- discussion threads

If MR comment API is not available, clearly say that SSH Git access is enough for push/fetch but not enough for writing MR comments.

## Proof Packet

Every run should maintain Proof Packet with:

- Meego ID, title, link
- PRD link and ready result
- job/cluster
- AI Ready gate result
- repo, base, branch, commits
- MR link and review cycles
- CI/test results
- DevX deployment
- dev acceptance
- release review
- boarding status
- risk and rollback
- next action

## Safety

- Never skip human gates.
- Never treat `NEEDS_HUMAN_*` as failure.
- Never default to the first todo if the requested Meego ID is not found.
- Never claim MR comments were posted unless they were actually posted in MR.
- Never use Meego comments as a substitute for MR review.
- Never run real write actions without explicit confirmation.

