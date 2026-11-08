import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { supervisionAgent } = await import('../src/agents/SupervisionAgent.js');
const { aiProviderRouter } = await import('../src/integrations/ai/router/AIProviderRouter.js');
const { mcpClient } = await import('../src/integrations/mcp/ParallelMCPClient.js');

const plan = { title: 'Heiress Returns', synopsis: 'A disowned heiress returns for revenge.', genre: 'Revenge' } as any;
(mcpClient as any).performComplianceDeepResearch = async () => { throw new Error('offline'); };

test('compliance: a failed audit is "unverified", never a passing score', async () => {
  (aiProviderRouter as any).generateText = async () => { throw new Error('model unavailable'); };
  const r = await supervisionAgent.verifyMasterPlanCompliance({ masterPlan: plan, country: 'VN' });
  assert.equal(r.verification_status, 'unverified');
  assert.equal(r.is_compliant, false);
  assert.equal(r.overall_score, 0);
  for (const d of Object.values(r.categories)) {
    assert.equal(d.status, 'Unverified');
    assert.equal(d.safe, false);
  }
  assert.ok(r.copyright_checks.every((c) => c.status !== 'Passed'));
  assert.match(r.market_research!.copyright_findings, /unavailable/);
});

test('compliance: categories the audit omitted are not marked Passed', async () => {
  (aiProviderRouter as any).generateText = async () =>
    JSON.stringify({ is_compliant: true, categories: { violence: { label: 'Violence / Gore', score: 90, status: 'Passed', safe: true } } });
  const r = await supervisionAgent.verifyMasterPlanCompliance({ masterPlan: plan, country: 'VN' });
  assert.equal(r.verification_status, 'partial');
  assert.equal(r.is_compliant, false, 'cannot be compliant with unaudited categories');
  assert.equal(r.categories.violence.status, 'Passed');
  assert.equal(r.categories.copyright_ip.status, 'Unverified');
  assert.equal(r.overall_score, 90, 'score from audited categories only');
});

test('compliance: a full audit passes through', async () => {
  const cat = (label: string) => ({ label, score: 96, status: 'Passed', safe: true });
  (aiProviderRouter as any).generateText = async () =>
    JSON.stringify({
      overall_score: 96, is_compliant: true,
      categories: { violence: cat('V'), adult_content: cat('A'), cultural_sensitivity: cat('C'), copyright_ip: cat('IP') },
      copyright_checks: [{ label: 'Script Origin & Plagiarism', status: 'Passed', safe: true }],
    });
  const r = await supervisionAgent.verifyMasterPlanCompliance({ masterPlan: plan, country: 'VN' });
  assert.equal(r.verification_status, 'verified');
  assert.equal(r.is_compliant, true);
  assert.equal(r.overall_score, 96);
});

test('copyright check: unavailable search or audio-only input is not "safe"', async () => {
  const audio = await mcpClient.checkCopyrightSafety('https://cdn/x.mp3', 'audio');
  assert.deepEqual([audio.verified, audio.safe], [false, false]);
  (mcpClient as any).executeParallelSearch = async () => { throw new Error('offline'); };
  (mcpClient as any).isConnected = true;
  const script = await mcpClient.checkCopyrightSafety('A disowned heiress returns to the family company for revenge.', 'script');
  assert.deepEqual([script.verified, script.safe], [false, false]);
});
