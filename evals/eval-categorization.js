/**
 * Eval Suite: Email Categorization
 * 
 * Tests that the NIM-primary (Gemini-fallback) classification pipeline
 * correctly assigns categories to diverse email types.
 *
 * Metrics:
 * - Accuracy: % of emails correctly categorized
 * - Confusion matrix: which categories get mixed up
 * - Latency: avg time per classification
 */
import { CATEGORIZATION_FIXTURES } from './fixtures.js';
import { CATEGORIES } from '../backend/src/config/index.js';

const CATEGORY_ALIASES = {
  'newsletter': ['newsletter', 'newsletters'],
  'job_recruitment': ['job_recruitment', 'job', 'recruitment'],
  'finance': ['finance', 'financial', 'billing'],
  'notifications': ['notifications', 'notification'],
  'personal': ['personal'],
  'work_professional': ['work_professional', 'work', 'professional'],
  'uncategorized': ['uncategorized', 'other'],
};

function normalizeCategory(raw) {
  const lower = raw.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.includes(lower)) return canonical;
  }
  return 'uncategorized';
}

export async function runCategorizationEval(aiGenerate) {
  const results = [];
  let correct = 0;
  let total = CATEGORIZATION_FIXTURES.length;
  const confusionMatrix = {};

  console.log('\n━━━ CATEGORIZATION EVAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Testing ${total} emails across ${CATEGORIES.length} categories\n`);

  for (const fixture of CATEGORIZATION_FIXTURES) {
    const prompt = `Classify this email into exactly ONE of these categories. Respond with ONLY the category name, nothing else.

Categories:
- newsletter (subscription-based content, digests, tech news)
- job_recruitment (job applications, offers, rejections, interview requests)
- finance (invoices, receipts, bank alerts, payments, billing)
- notifications (system alerts, OTPs, platform updates, deployment alerts)
- personal (direct human-to-human personal communication)
- work_professional (project discussions, team communication, work meetings)
- uncategorized (does not fit any above)

Email:
Subject: ${fixture.subject}
From: ${fixture.from}
Preview: ${fixture.snippet}

Category:`;

    const start = Date.now();
    try {
      const raw = await aiGenerate('classify', { prompt, opts: { temperature: 0.0, maxTokens: 30 } });
      const latency = Date.now() - start;
      const predicted = normalizeCategory(raw);
      const expected = fixture.expectedCategory;
      const isCorrect = predicted === expected;

      if (isCorrect) correct++;

      // Build confusion matrix
      const key = `${expected} → ${predicted}`;
      confusionMatrix[key] = (confusionMatrix[key] || 0) + 1;

      const icon = isCorrect ? '✅' : '❌';
      console.log(`  ${icon} [${fixture.id}] "${fixture.subject}"`);
      console.log(`      Expected: ${expected} | Predicted: ${predicted} | ${latency}ms`);

      results.push({
        id: fixture.id,
        subject: fixture.subject,
        expected,
        predicted,
        correct: isCorrect,
        latency,
        rawOutput: raw.trim(),
      });
    } catch (err) {
      console.log(`  ⚠️  [${fixture.id}] ERROR: ${err.message}`);
      results.push({ id: fixture.id, error: err.message, correct: false });
    }
  }

  const accuracy = ((correct / total) * 100).toFixed(1);
  const avgLatency = results.filter(r => r.latency).reduce((s, r) => s + r.latency, 0) / results.filter(r => r.latency).length;

  console.log(`\n  ─── Results ───`);
  console.log(`  Accuracy: ${correct}/${total} (${accuracy}%)`);
  console.log(`  Avg Latency: ${Math.round(avgLatency)}ms`);

  // Show confusion for mistakes
  const mistakes = Object.entries(confusionMatrix).filter(([k]) => {
    const [exp, pred] = k.split(' → ');
    return exp !== pred;
  });
  if (mistakes.length > 0) {
    console.log(`\n  Confusion:`);
    for (const [k, v] of mistakes) {
      console.log(`    ${k}: ${v} occurrence(s)`);
    }
  }

  return {
    suite: 'categorization',
    total,
    correct,
    accuracy: parseFloat(accuracy),
    avgLatencyMs: Math.round(avgLatency),
    results,
    confusionMatrix,
    grade: accuracy >= 90 ? 'A' : accuracy >= 75 ? 'B' : accuracy >= 60 ? 'C' : 'F',
  };
}
