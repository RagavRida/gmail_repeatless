/**
 * Eval Suite: Compose & Reply
 * 
 * Tests that AI-generated drafts:
 * - Match the requested tone (Professional, Friendly, Concise)
 * - Contain expected content from the prompt
 * - Are within reasonable length bounds
 * - For replies: reference the thread context appropriately
 */
import { COMPOSE_FIXTURES, REPLY_FIXTURES } from './fixtures.js';

export async function runComposeEval(aiGenerate) {
  const allFixtures = [
    ...COMPOSE_FIXTURES.map(f => ({ ...f, type: 'compose' })),
    ...REPLY_FIXTURES.map(f => ({ ...f, type: 'reply' })),
  ];

  const results = [];
  let totalScore = 0;
  let totalTests = allFixtures.length;

  console.log('\n━━━ COMPOSE & REPLY EVAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Testing ${totalTests} draft generation tasks\n`);

  for (const fixture of allFixtures) {
    let prompt;

    if (fixture.type === 'reply') {
      const threadCtx = fixture.threadMessages.map((m, i) =>
        `--- Message ${i + 1} ---\nFrom: ${m.from_address}\nDate: ${m.internal_date}\n${m.body_text}`
      ).join('\n\n');

      prompt = `Draft a reply to the email thread below based on the user's instructions. The reply should be contextually appropriate given the full conversation history. Return ONLY the reply body.

Thread history (chronological):
${threadCtx}

User's instructions for the reply: ${fixture.prompt}
Desired tone: ${fixture.tone || 'Professional'}

Reply:`;
    } else {
      prompt = `Draft a professional email based on the user's instructions below. Return ONLY the email content.

User's instructions: ${fixture.prompt}
Desired tone: ${fixture.tone || 'Professional'}

Write the email body:`;
    }

    const start = Date.now();
    try {
      const draft = await aiGenerate('generate', { prompt, opts: { temperature: 0.5, maxTokens: 600 } });
      const latency = Date.now() - start;
      const lower = draft.toLowerCase();
      const wordCount = draft.split(/\s+/).length;

      let score = 0;
      let maxScore = 0;
      const checks = [];

      // 1. Contains expected content
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

      // 2. Doesn't contain inappropriate content for tone
      if (fixture.mustNotContain) {
        for (const keyword of fixture.mustNotContain) {
          maxScore++;
          if (!lower.includes(keyword.toLowerCase())) {
            score++;
            checks.push({ check: `No inappropriate: "${keyword}"`, pass: true });
          } else {
            checks.push({ check: `No inappropriate: "${keyword}"`, pass: false });
          }
        }
      }

      // 3. Length bounds
      if (fixture.minWords) {
        maxScore++;
        if (wordCount >= fixture.minWords) {
          score++;
          checks.push({ check: `Min words (≥${fixture.minWords}, got ${wordCount})`, pass: true });
        } else {
          checks.push({ check: `Min words (≥${fixture.minWords}, got ${wordCount})`, pass: false });
        }
      }
      if (fixture.maxWords) {
        maxScore++;
        if (wordCount <= fixture.maxWords) {
          score++;
          checks.push({ check: `Max words (≤${fixture.maxWords}, got ${wordCount})`, pass: true });
        } else {
          checks.push({ check: `Max words (≤${fixture.maxWords}, got ${wordCount})`, pass: false });
        }
      }

      // 4. Thread-context awareness for replies
      if (fixture.mustBeContextual && fixture.threadMessages) {
        maxScore++;
        // Check if reply references content from the original message
        const originalContent = fixture.threadMessages.map(m => m.body_text).join(' ').toLowerCase();
        const refersToContext = originalContent.split(/\s+/).filter(w => w.length > 5).some(word =>
          lower.includes(word)
        );
        if (refersToContext) {
          score++;
          checks.push({ check: 'Reply references thread context', pass: true });
        } else {
          checks.push({ check: 'Reply references thread context', pass: false });
        }
      }

      // 5. Non-empty
      maxScore++;
      if (draft.trim().length > 30) {
        score++;
        checks.push({ check: 'Substantive draft', pass: true });
      } else {
        checks.push({ check: 'Substantive draft', pass: false });
      }

      const pct = maxScore > 0 ? ((score / maxScore) * 100).toFixed(0) : 0;
      totalScore += score / maxScore;

      const icon = score === maxScore ? '✅' : score > maxScore / 2 ? '⚠️' : '❌';
      console.log(`  ${icon} [${fixture.id}] ${fixture.type.toUpperCase()}: "${fixture.prompt}" — ${score}/${maxScore} (${pct}%) ${latency}ms`);

      const failed = checks.filter(c => !c.pass);
      if (failed.length > 0) {
        for (const f of failed) {
          console.log(`      ↳ FAIL: ${f.check}`);
        }
      }

      results.push({
        id: fixture.id,
        type: fixture.type,
        prompt: fixture.prompt,
        score,
        maxScore,
        pct: parseFloat(pct),
        latency,
        wordCount,
        draft: draft.substring(0, 200),
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
    suite: 'compose_reply',
    total: totalTests,
    avgScore: parseFloat(avgScore),
    results,
    grade: avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 60 ? 'C' : 'F',
  };
}
