#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const skillRoot = path.resolve(new URL('..', import.meta.url).pathname);
const repoRoot = process.env.CODING_FISH_ORCHESTRATOR_ROOT || '/Users/bytedance/Code/codingdmeo';
const orchestrator = path.join(repoRoot, 'orchestrator/index.js');
const runsDir = path.join(repoRoot, '.runs');

const cases = [];
const failures = [];

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd || repoRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  if (!opts.allowFailure && res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with ${res.status}\n${res.stdout}\n${res.stderr}`);
  }
  return res;
}

function nodeCmd(args, opts = {}) {
  return sh('node', [orchestrator, ...args], opts);
}

function runCase(name, fn) {
  cases.push(name);
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function jsonFrom(res) {
  return JSON.parse(res.stdout);
}

function resetRun(id, state = {}) {
  const dir = path.join(runsDir, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

function readState(id) {
  return JSON.parse(readFileSync(path.join(runsDir, id, 'state.json'), 'utf8'));
}

function baseState(id, extra = {}) {
  const state = {
    issue: { id },
    prd: { ready: true, checks: { has_acceptance: true }, acceptance_count: 1 },
    repo: { repo: 'infcp/devx-web', base_branch: 'master', branch: `feat/${id}` },
    job: { cluster_id: id, job_file: 'artifacts/job.md', proposal_first: true },
    ai_ready_gate: { ready: true, decision: 'ai_ready', missing: [] },
    ai_start: { requested_at: '2026-05-09T00:00:00.000Z' },
    ...extra
  };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete state[key];
  }
  return state;
}

function expectAction(id, expected) {
  const out = jsonFrom(nodeCmd(['next-actions', '--meego', id, '--json']));
  const actual = `${out.actions[0].owner}:${out.actions[0].action}`;
  assert(actual === expected, `expected ${expected}, got ${actual}`);
}

function expectGate(id, ready, status, missing = []) {
  const out = jsonFrom(nodeCmd(['ai-ready-check', '--meego', id, '--json']));
  assert(out.ready === ready, `expected ready=${ready}, got ${out.ready}`);
  assert(out.status === status, `expected status=${status}, got ${out.status}`);
  for (const item of missing) assert(out.missing.includes(item), `missing ${item} not present in ${out.missing.join(',')}`);
}

runCase('skill metadata frontmatter exists', () => {
  const skill = readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  assert(skill.startsWith('---\nname: coding-fish\n'), 'missing coding-fish frontmatter');
  assert(skill.includes('description:'), 'missing description');
});

runCase('validation reference exists', () => {
  assert(existsSync(path.join(skillRoot, 'references/validation.md')), 'validation reference missing');
});

runCase('orchestrator syntax', () => {
  assert(sh('node', ['--check', orchestrator]).status === 0, 'node --check failed');
});

runCase('wrong Meego id does not fallback', () => {
  const res = nodeCmd(['prd', '--meego', 'coding-fish-missing-id', '--json'], { allowFailure: true });
  assert(res.status !== 0, 'wrong id unexpectedly succeeded');
  assert(res.stderr.includes('was not found'), 'missing expected not found message');
});

for (const [name, state, expected] of [
  ['no job -> prepare-job', { issue: { id: 'vf-no-job' } }, 'orchestrator:prepare-job'],
  ['needs human prd -> human gate', { issue: { id: 'vf-needs' }, job: { cluster_id: 'vf-needs' }, ai_ready_gate: { ready: false, missing: ['PRD'] }, status: 'NEEDS_HUMAN_PRD' }, 'human:补齐 gate 缺口'],
  ['job no gate -> ai-ready-check', { issue: { id: 'vf-no-gate' }, job: { cluster_id: 'vf-no-gate' } }, 'orchestrator:ai-ready-check'],
  ['ready no ai start -> ai-start', baseState('vf-no-start', { ai_start: undefined, mr: undefined, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'human:ai-start'],
  ['ready no generate -> generate', baseState('vf-no-generate', { devx_generate: undefined, branch: undefined, dev_task: undefined, mr: undefined, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'orchestrator:generate'],
  ['no branch -> create-branch', baseState('vf-no-branch', { devx_generate: { status: 'planned' }, branch: undefined, dev_task: undefined, mr: undefined, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'orchestrator:create-branch'],
  ['no dev task -> create-task', baseState('vf-no-task', { devx_generate: { status: 'planned' }, branch: { status: 'planned' }, dev_task: undefined, mr: undefined, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'orchestrator:create-task'],
  ['no mr -> create-draft-mr', baseState('vf-no-mr', { devx_generate: { status: 'planned' }, branch: { status: 'planned' }, dev_task: { status: 'planned' }, mr: undefined, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'orchestrator:create-draft-mr'],
  ['open draft -> MR review', baseState('vf-open-mr', { mr: { status: 'open_draft' }, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'human:MR review'],
  ['review requested -> MR review', baseState('vf-review-again', { mr: { status: 'review_requested_again' }, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'human:MR review'],
  ['changes requested -> MR review', baseState('vf-changes', { mr: { status: 'changes_requested' }, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'human:MR review'],
  ['unknown mr state -> wait approval', baseState('vf-wait-mr', { mr: { status: 'pipeline_running' }, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'human:等待 MR approval'],
  ['approved no deploy -> deploy', baseState('vf-approved', { mr: { status: 'approved' }, deploy: undefined, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'orchestrator:deploy'],
  ['deploy no acceptance -> DevX dev 验收', baseState('vf-deploy', { mr: { status: 'approved' }, deploy: { status: 'planned' }, dev_acceptance: undefined, release_review: undefined, release: undefined }), 'human:DevX dev 验收'],
  ['dev rejected -> review-fix', baseState('vf-dev-rejected', { mr: { status: 'approved' }, deploy: { status: 'planned' }, dev_acceptance: { status: 'rejected' }, release_review: undefined, release: undefined }), 'coding-agent:review-fix'],
  ['dev accepted no release review -> release-review', baseState('vf-dev-accepted', { mr: { status: 'approved' }, deploy: { status: 'planned' }, dev_acceptance: { status: 'accepted' }, release_review: undefined, release: undefined }), 'human:release-review'],
  ['release reviewed no board -> board', baseState('vf-release-reviewed', { mr: { status: 'approved' }, deploy: { status: 'planned' }, dev_acceptance: { status: 'accepted' }, release_review: { status: 'approved_for_boarding' }, release: undefined }), 'orchestrator:board'],
  ['release exists -> done', baseState('vf-done', { mr: { status: 'approved' }, deploy: { status: 'planned' }, dev_acceptance: { status: 'accepted' }, release_review: { status: 'approved_for_boarding' }, release: { status: 'planned' } }), 'orchestrator:done']
]) {
  runCase(`next action: ${name}`, () => {
    resetRun(name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), state);
    expectAction(name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), expected);
  });
}

for (const [name, state, ready, status, missing] of [
  ['gate ready all present', baseState('vg-ready'), true, 'AI_READY', []],
  ['gate missing job', { issue: { id: 'vg-no-job' }, prd: { ready: true, checks: { has_acceptance: true } }, repo: { repo: 'r', base_branch: 'master', branch: 'b' } }, false, 'NEEDS_HUMAN_JOB', ['JOB']],
  ['gate missing prd', { issue: { id: 'vg-no-prd' }, job: { cluster_id: 'vg-no-prd', job_file: 'artifacts/job.md' }, repo: { repo: 'r', base_branch: 'master', branch: 'b' } }, false, 'NEEDS_HUMAN_PRD', ['PRD']],
  ['gate missing acceptance', { issue: { id: 'vg-no-accept' }, job: { cluster_id: 'vg-no-accept', job_file: 'artifacts/job.md' }, prd: { ready: true }, repo: { repo: 'r', base_branch: 'master', branch: 'b' } }, false, 'NEEDS_HUMAN_ACCEPTANCE', ['ACCEPTANCE']],
  ['gate missing scope', { issue: { id: 'vg-no-scope' }, job: { cluster_id: 'vg-no-scope', job_file: 'artifacts/job.md' }, prd: { ready: true, checks: { has_acceptance: true } }, repo: { repo: 'r' } }, false, 'NEEDS_HUMAN_SCOPE', ['SCOPE']],
  ['gate preserves advanced status', baseState('vg-preserve', { status: 'MR_REVIEW_FIX_READY', mr: { status: 'review_requested_again' } }), true, 'MR_REVIEW_FIX_READY', []]
]) {
  runCase(`ai ready gate: ${name}`, () => {
    const id = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    resetRun(id, state);
    expectGate(id, ready, status, missing);
  });
}

runCase('prepare-job writes job artifacts', () => {
  const id = 'vf-prepare-job';
  resetRun(id, { issue: { id }, prd: { ready: true }, status: 'PRD_READY' });
  nodeCmd(['prepare-job', '--meego', id, '--repo', 'infcp/devx-web', '--base', 'master', '--branch', 'feat/vf-prepare-job', '--cluster', id]);
  assert(existsSync(path.join(runsDir, id, 'artifacts/job.md')), 'job.md missing');
  assert(existsSync(path.join(runsDir, id, 'artifacts/job.json')), 'job.json missing');
});

runCase('prepare-job preserves advanced status', () => {
  const id = 'vf-prepare-preserve';
  resetRun(id, { issue: { id }, prd: { ready: true }, status: 'MR_REVIEW_FIX_READY', mr: { status: 'review_requested_again' } });
  nodeCmd(['prepare-job', '--meego', id, '--repo', 'infcp/devx-web', '--base', 'master', '--branch', 'feat/vf-prepare-preserve']);
  assert(readState(id).status === 'MR_REVIEW_FIX_READY', 'advanced status was overwritten');
});

runCase('proposal flow safe-mode creates execute=false plans', () => {
  const id = 'vf-proposal-flow';
  rmSync(path.join(runsDir, id), { recursive: true, force: true });
  nodeCmd(['run-clownfish-flow', '--meego', id, '--doc', 'https://bytedance.larkoffice.com/docx/J3DGdhPeKoX8rTx9bbQcYe2Mnog', '--branch', 'feat/vf-proposal-flow', '--version', '2026.05.09-verify', '--repo', 'infcp/devx-web', '--base', 'master']);
  for (const file of ['generate.plan.json', 'create-branch.plan.json', 'create-task.plan.json']) {
    const plan = JSON.parse(readFileSync(path.join(runsDir, id, 'artifacts', file), 'utf8'));
    assert(plan.execute === false, `${file} should be safe-mode`);
  }
  expectAction(id, 'human:MR review');
});

runCase('review request/fix/approve updates proof', () => {
  const id = 'vf-review-loop';
  resetRun(id, baseState(id, { mr: { status: 'open_draft', url: 'https://example.invalid/mr/1', review_cycles: [] } }));
  nodeCmd(['review-request-changes', '--meego', id, '--reviewer', 'reviewer', '--comment', 'fix tests']);
  nodeCmd(['review-fix', '--meego', id, '--note', 'tests fixed']);
  nodeCmd(['review-approve', '--meego', id, '--reviewer', 'reviewer']);
  nodeCmd(['proof', '--meego', id]);
  const proof = readFileSync(path.join(runsDir, id, 'proof.md'), 'utf8');
  assert(proof.includes('Round 1'), 'proof missing round 1');
  assert(proof.includes('Round 2'), 'proof missing round 2');
  expectAction(id, 'orchestrator:deploy');
});

runCase('deploy command is safe by default', () => {
  const id = 'vf-deploy-safe';
  resetRun(id, baseState(id, { mr: { status: 'approved' } }));
  nodeCmd(['deploy', '--meego', id, '--branch', 'feat/vf-deploy-safe']);
  const plan = JSON.parse(readFileSync(path.join(runsDir, id, 'artifacts/deploy.plan.json'), 'utf8'));
  assert(plan.execute === false, 'deploy should be safe-mode');
});

runCase('board command is safe by default', () => {
  const id = 'vf-board-safe';
  resetRun(id, baseState(id, { mr: { status: 'approved' }, deploy: { status: 'planned' }, dev_acceptance: { status: 'accepted' }, release_review: { status: 'approved_for_boarding' } }));
  nodeCmd(['board', '--meego', id, '--version', '2026.05.09-verify']);
  const plan = JSON.parse(readFileSync(path.join(runsDir, id, 'artifacts/board.plan.json'), 'utf8'));
  assert(plan.execute === false, 'board should be safe-mode');
});

runCase('reject dev returns to coding', () => {
  const id = 'vf-reject-dev';
  resetRun(id, baseState(id, { mr: { status: 'approved' }, deploy: { status: 'planned' } }));
  nodeCmd(['reject-dev', '--meego', id, '--reason', 'bad empty state']);
  assert(readState(id).status === 'DEV_REJECTED_RETURN_TO_CODING', 'reject status mismatch');
  expectAction(id, 'coding-agent:review-fix');
});

runCase('accept dev then release review then board reaches done', () => {
  const id = 'vf-release-flow';
  resetRun(id, baseState(id, { mr: { status: 'approved' }, deploy: { status: 'planned' } }));
  nodeCmd(['accept-dev', '--meego', id, '--note', 'ok']);
  expectAction(id, 'human:release-review');
  nodeCmd(['release-review', '--meego', id, '--version', '2026.05.09-verify', '--reviewer', 'release-owner']);
  expectAction(id, 'orchestrator:board');
  nodeCmd(['board', '--meego', id, '--version', '2026.05.09-verify']);
  expectAction(id, 'orchestrator:done');
});

runCase('real requirement remains MR review', () => {
  expectAction('7283953615', 'human:MR review');
});

runCase('real proof includes next action', () => {
  const res = nodeCmd(['proof', '--meego', '7283953615', '--print']);
  assert(res.stdout.includes('Next Action: human:MR review'), 'real proof next action mismatch');
});

for (let i = 0; i < 25; i++) {
  runCase(`bulk gate ready variant ${i + 1}`, () => {
    const id = `bulk-ready-${i + 1}`;
    resetRun(id, baseState(id, {
      prd: {
        ready: true,
        checks: i % 2 === 0 ? { has_acceptance: true } : {},
        acceptance_count: i % 2 === 0 ? 0 : 1,
        risk_level: i % 3 === 0 ? 'medium' : 'low'
      },
      repo: {
        repo: i % 2 === 0 ? 'infcp/devx-web' : 'infcp/pm-workbench',
        base_branch: i % 3 === 0 ? 'main' : 'master',
        branch: `feat/bulk-ready-${i + 1}`
      }
    }));
    expectGate(id, true, 'AI_READY', []);
  });
}

for (let i = 0; i < 20; i++) {
  runCase(`bulk gate missing prd variant ${i + 1}`, () => {
    const id = `bulk-missing-prd-${i + 1}`;
    resetRun(id, {
      issue: { id },
      job: { cluster_id: id, job_file: 'artifacts/job.md' },
      repo: { repo: 'infcp/devx-web', base_branch: 'master', branch: `feat/${id}` }
    });
    expectGate(id, false, 'NEEDS_HUMAN_PRD', ['PRD']);
  });
}

for (let i = 0; i < 20; i++) {
  runCase(`bulk gate missing acceptance variant ${i + 1}`, () => {
    const id = `bulk-missing-accept-${i + 1}`;
    resetRun(id, {
      issue: { id },
      job: { cluster_id: id, job_file: 'artifacts/job.md' },
      prd: { ready: true, checks: {}, acceptance_count: 0 },
      repo: { repo: 'infcp/devx-web', base_branch: 'master', branch: `feat/${id}` }
    });
    expectGate(id, false, 'NEEDS_HUMAN_ACCEPTANCE', ['ACCEPTANCE']);
  });
}

for (let i = 0; i < 20; i++) {
  runCase(`bulk gate missing scope variant ${i + 1}`, () => {
    const id = `bulk-missing-scope-${i + 1}`;
    const repo = i % 3 === 0
      ? { repo: 'infcp/devx-web', base_branch: 'master' }
      : i % 3 === 1
        ? { repo: 'infcp/devx-web', branch: `feat/${id}` }
        : { base_branch: 'master', branch: `feat/${id}` };
    resetRun(id, {
      issue: { id },
      job: { cluster_id: id, job_file: 'artifacts/job.md' },
      prd: { ready: true, checks: { has_acceptance: true }, acceptance_count: 1 },
      repo
    });
    const out = jsonFrom(nodeCmd(['ai-ready-check', '--meego', id, '--json']));
    assert(out.ready === false, `expected not ready, got ${out.ready}`);
    assert(out.missing.includes('SCOPE') || out.missing.includes('COMPONENT'), `expected scope/component missing, got ${out.missing.join(',')}`);
  });
}

const mrStates = [
  ['open_draft', 'human:MR review'],
  ['review_requested_again', 'human:MR review'],
  ['changes_requested', 'human:MR review'],
  ['pipeline_running', 'human:等待 MR approval'],
  ['ci_failed', 'human:等待 MR approval'],
  ['merged', 'human:等待 MR approval']
];

for (let i = 0; i < 30; i++) {
  runCase(`bulk mr state variant ${i + 1}`, () => {
    const [mrStatus, expected] = mrStates[i % mrStates.length];
    const id = `bulk-mr-${i + 1}`;
    resetRun(id, baseState(id, {
      mr: { status: mrStatus, url: `https://example.invalid/mr/${i + 1}` },
      deploy: undefined,
      dev_acceptance: undefined,
      release_review: undefined,
      release: undefined
    }));
    expectAction(id, expected);
  });
}

for (let i = 0; i < 15; i++) {
  runCase(`bulk release done variant ${i + 1}`, () => {
    const id = `bulk-release-${i + 1}`;
    resetRun(id, baseState(id, {
      mr: { status: 'approved' },
      deploy: { status: i % 2 === 0 ? 'planned' : 'started' },
      dev_acceptance: { status: 'accepted' },
      release_review: { status: 'approved_for_boarding' },
      release: { status: i % 2 === 0 ? 'planned' : 'started', version: `2026.05.${String(i + 1).padStart(2, '0')}` }
    }));
    expectAction(id, 'orchestrator:done');
  });
}

const report = {
  total: cases.length,
  passed: cases.length - failures.length,
  failed: failures.length,
  failures
};

const outDir = path.join(skillRoot, 'references');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'last-validation-result.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
