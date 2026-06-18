/**
 * Eval Suite: RAG Chat Agent
 * 
 * Tests the most critical AI feature — the chat agent must:
 * - Answer from provided context ONLY (grounding)
 * - Cite sources correctly (attribution)
 * - NOT hallucinate facts not in the context
 * - Admit when information isn't available (honesty)
 * - Synthesize across multiple sources (cross-email reasoning)
 */
import { CHAT_RAG_FIXTURES } from './fixtures.js';

export async function runChatEval(aiGenerate) {
  const results = [];
  let totalScore = 0;
  let totalTests = CHAT_RAG_FIXTURES.length;

  console.log('\n━━━ RAG CHAT AGENT EVAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Testing ${totalTests} chat scenarios\n`);

  for (const fixture of CHAT_RAG_FIXTURES) {
    // Build context blocks (simulating what hybrid retrieval would return)
    const contextBlocks = fixture.contextEmails.map((e, i) => `
[Source ${i + 1}]
Thread: ${e.subject}
From: ${e.from}
Date: ${e.date}
Content: ${e.body}
---`).join('\n');

    const prompt = `You are an AI email assistant. Answer the user's question using ONLY the email context provided below. Follow these rules strictly:

1. ONLY use information from the provided email context blocks. Do NOT make up or infer information not present.
2. CITE your sources: for each fact, state which email/thread/sender it came from.
3. If multiple emails discuss the same topic, synthesize across all of them and present a coherent, unified answer.
4. If the answer is NOT in the provided context, say so clearly — do NOT guess or hallucinate.
5. Be concise but thorough. Use bullet points for lists.

Email context blocks:
${contextBlocks || '(No relevant emails found in your inbox)'}

User's question: ${fixture.question}

Answer:`;

    const start = Date.now();
    try {
      const answer = await aiGenerate('generate', {
        prompt,
        opts: {
          systemInstruction: 'You are an AI email assistant. Answer questions exclusively from the user\'s emails. Always cite sources. Never hallucinate.',
          temperature: 0.3,
          maxTokens: 800,
        },
      });
      const latency = Date.now() - start;
      const lower = answer.toLowerCase();

      let score = 0;
      let maxScore = 0;
      const checks = [];

      // 1. Contains expected key facts from context
      if (fixture.mustContain) {
        for (const keyword of fixture.mustContain) {
          maxScore++;
          if (lower.includes(keyword.toLowerCase())) {
            score++;
            checks.push({ check: `Contains grounded fact: "${keyword}"`, pass: true });
          } else {
            checks.push({ check: `Contains grounded fact: "${keyword}"`, pass: false });
          }
        }
      }

      // 2. Does NOT hallucinate
      if (fixture.mustNotHallucinate) {
        for (const hallucination of fixture.mustNotHallucinate) {
          maxScore++;
          if (!lower.includes(hallucination.toLowerCase())) {
            score++;
            checks.push({ check: `No hallucination: "${hallucination}"`, pass: true });
          } else {
            checks.push({ check: `No hallucination: "${hallucination}"`, pass: false, severity: 'CRITICAL' });
          }
        }
      }

      // 3. Cites sources when expected
      if (fixture.mustCiteSources) {
        maxScore++;
        const citePatterns = [
          /source/i, /from\s+(the\s+)?email/i, /according\s+to/i,
          /\bfrom\b.*\b(antony|julie|sarah|jack|mira|tldr)\b/i,
          /\bemail\b/i, /\bthread\b/i, /\bsender\b/i,
        ];
        const cites = citePatterns.some(p => p.test(answer));
        if (cites) {
          score++;
          checks.push({ check: 'Source attribution present', pass: true });
        } else {
          checks.push({ check: 'Source attribution present', pass: false });
        }
      }

      // 4. Admits when info is missing (no-context test)
      if (fixture.shouldAdmitNoInfo) {
        maxScore++;
        const admitPatterns = [
          /not (found|present|available|contain)/i,
          /no (relevant|matching|related) (email|information|data)/i,
          /don't have (information|data|emails)/i,
          /couldn't find/i,
          /no email/i,
          /not in (your|the) (inbox|email|knowledge)/i,
        ];
        const admits = admitPatterns.some(p => p.test(answer));
        if (admits) {
          score++;
          checks.push({ check: 'Admits missing information', pass: true });
        } else {
          checks.push({ check: 'Admits missing information', pass: false, severity: 'CRITICAL' });
        }
      }

      // 5. Non-empty and substantive
      maxScore++;
      if (answer.trim().length > 30) {
        score++;
        checks.push({ check: 'Substantive answer', pass: true });
      } else {
        checks.push({ check: 'Substantive answer', pass: false });
      }

      const pct = maxScore > 0 ? ((score / maxScore) * 100).toFixed(0) : 0;
      totalScore += score / maxScore;

      const hasCriticalFail = checks.some(c => !c.pass && c.severity === 'CRITICAL');
      const icon = hasCriticalFail ? '🚨' : score === maxScore ? '✅' : score > maxScore / 2 ? '⚠️' : '❌';

      console.log(`  ${icon} [${fixture.id}] "${fixture.question}" — ${score}/${maxScore} (${pct}%) ${latency}ms`);

      const failed = checks.filter(c => !c.pass);
      if (failed.length > 0) {
        for (const f of failed) {
          const tag = f.severity === 'CRITICAL' ? '🚨 CRITICAL' : 'FAIL';
          console.log(`      ↳ ${tag}: ${f.check}`);
        }
      }

      results.push({
        id: fixture.id,
        question: fixture.question,
        score,
        maxScore,
        pct: parseFloat(pct),
        latency,
        answer: answer.substring(0, 300),
        checks,
        hasCriticalFail,
      });
    } catch (err) {
      console.log(`  ⚠️  [${fixture.id}] ERROR: ${err.message}`);
      results.push({ id: fixture.id, error: err.message });
    }
  }

  const avgScore = ((totalScore / totalTests) * 100).toFixed(1);
  const criticalFails = results.filter(r => r.hasCriticalFail).length;

  console.log(`\n  ─── Results ───`);
  console.log(`  Average Score: ${avgScore}%`);
  console.log(`  Critical Failures (hallucination/honesty): ${criticalFails}`);

  return {
    suite: 'chat_rag',
    total: totalTests,
    avgScore: parseFloat(avgScore),
    criticalFails,
    results,
    grade: criticalFails > 0 ? 'F' : avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 60 ? 'C' : 'F',
  };
}
