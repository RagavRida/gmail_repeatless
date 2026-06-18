/**
 * Eval Suite: Email Summarization
 * 
 * Tests that Gemini produces summaries which are:
 * - Concise (within sentence count bounds)
 * - Factual (contains expected key facts from the source)
 * - Non-hallucinating (doesn't add information not in the email)
 * - Thread-aware (for thread summaries, captures the arc)
 */
import { SUMMARIZATION_FIXTURES } from './fixtures.js';

export async function runSummarizationEval(aiGenerate) {
  const results = [];
  let totalScore = 0;
  let totalTests = SUMMARIZATION_FIXTURES.length;

  console.log('\n━━━ SUMMARIZATION EVAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Testing ${totalTests} summarization tasks\n`);

  for (const fixture of SUMMARIZATION_FIXTURES) {
    let prompt;

    if (fixture.isThread) {
      const msgs = fixture.messages.map((m, i) =>
        `--- Message ${i + 1} ---\nFrom: ${m.from}\nDate: ${m.date}\n${m.body}`
      ).join('\n\n');

      prompt = `Summarize the following email thread as a coherent narrative. Cover the key events, decisions, and current status. Be concise (2-4 sentences).

Thread Subject: ${fixture.subject}
Messages (chronological order):
${msgs}

Thread Summary:`;
    } else {
      prompt = `Summarize the following email in 1-2 concise sentences. Focus on the key action items, decisions, or information conveyed. Do not add information not present in the email.

Subject: ${fixture.subject}
From: ${fixture.from}
Body:
${fixture.body}

Summary:`;
    }

    const start = Date.now();
    try {
      const summary = await aiGenerate('generate', { prompt, opts: { temperature: 0.2, maxTokens: 200 } });
      const latency = Date.now() - start;
      const lower = summary.toLowerCase();

      // Score criteria
      let score = 0;
      let maxScore = 0;
      const checks = [];

      // 1. Contains expected key facts
      if (fixture.mustContain) {
        for (const keyword of fixture.mustContain) {
          maxScore++;
          if (lower.includes(keyword.toLowerCase())) {
            score++;
            checks.push({ check: `Contains "${keyword}"`, pass: true });
          } else {
            checks.push({ check: `Contains "${keyword}"`, pass: false });
          }
        }
      }

      // 2. Doesn't contain hallucinated content
      if (fixture.mustNotContain) {
        for (const keyword of fixture.mustNotContain) {
          maxScore++;
          if (!lower.includes(keyword.toLowerCase())) {
            score++;
            checks.push({ check: `No hallucination: "${keyword}"`, pass: true });
          } else {
            checks.push({ check: `No hallucination: "${keyword}"`, pass: false });
          }
        }
      }

      // 3. Conciseness — check sentence count
      if (fixture.maxSentences) {
        maxScore++;
        const sentenceCount = summary.split(/[.!?]+/).filter(s => s.trim().length > 5).length;
        const concise = sentenceCount <= fixture.maxSentences;
        if (concise) score++;
        checks.push({ check: `Concise (≤${fixture.maxSentences} sentences, got ${sentenceCount})`, pass: concise });
      }

      // 4. Non-empty
      maxScore++;
      if (summary.trim().length > 20) {
        score++;
        checks.push({ check: 'Non-trivial output', pass: true });
      } else {
        checks.push({ check: 'Non-trivial output', pass: false });
      }

      const pct = maxScore > 0 ? ((score / maxScore) * 100).toFixed(0) : 0;
      totalScore += score / maxScore;

      const icon = score === maxScore ? '✅' : score > maxScore / 2 ? '⚠️' : '❌';
      console.log(`  ${icon} [${fixture.id}] "${fixture.subject}" — ${score}/${maxScore} (${pct}%) ${latency}ms`);

      const failed = checks.filter(c => !c.pass);
      if (failed.length > 0) {
        for (const f of failed) {
          console.log(`      ↳ FAIL: ${f.check}`);
        }
      }

      results.push({
        id: fixture.id,
        subject: fixture.subject,
        score,
        maxScore,
        pct: parseFloat(pct),
        latency,
        summary: summary.substring(0, 200),
        checks,
      });
    } catch (err) {
      console.log(`  ⚠️  [${fixture.id}] ERROR: ${err.message}`);
      results.push({ id: fixture.id, error: err.message });
    }
  }

  const avgScore = ((totalScore / totalTests) * 100).toFixed(1);

  console.log(`\n  ─── Results ───`);
  console.log(`  Average Score: ${avgScore}%`);

  return {
    suite: 'summarization',
    total: totalTests,
    avgScore: parseFloat(avgScore),
    results,
    grade: avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 60 ? 'C' : 'F',
  };
}
