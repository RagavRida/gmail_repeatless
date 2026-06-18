/**
 * Eval Suite: Newsletter Deduplication
 * 
 * Tests that the system can:
 * - Extract distinct news items from newsletter bodies
 * - Identify that the same story appears in multiple newsletters
 * - Keep unique stories as separate items
 */
import { NEWSLETTER_DEDUP_FIXTURES } from './fixtures.js';

export async function runNewsletterEval(aiGenerate, aiEmbed) {
  const results = [];
  let totalScore = 0;
  let totalTests = NEWSLETTER_DEDUP_FIXTURES.length;

  console.log('\n━━━ NEWSLETTER DEDUP EVAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Testing ${totalTests} deduplication scenarios\n`);

  for (const fixture of NEWSLETTER_DEDUP_FIXTURES) {
    let score = 0;
    let maxScore = 0;
    const checks = [];

    try {
      // Step 1: Extract news items from each newsletter
      const allItems = [];
      for (const newsletter of fixture.newsletters) {
        const extractPrompt = `Extract distinct news items from this newsletter email. For each item, provide a JSON array with objects containing:
- "title": short headline
- "summary": 1-2 sentence summary

Return ONLY a valid JSON array. If there are no distinct news items, return [].

Newsletter:
Subject: ${newsletter.subject}
From: ${newsletter.from}
Body:
${newsletter.body}

JSON:`;

        const raw = await aiGenerate('generate', { prompt: extractPrompt, opts: { temperature: 0.1, maxTokens: 800 } });
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
          const items = JSON.parse(cleaned);
          if (Array.isArray(items)) {
            allItems.push(...items.map(item => ({
              ...item,
              source: newsletter.from,
            })));
          }
        } catch {
          console.log(`    ⚠️  Failed to parse extraction for: ${newsletter.subject}`);
        }
      }

      console.log(`  📰 Extracted ${allItems.length} total items from ${fixture.newsletters.length} newsletters`);

      // Check: extracted a reasonable number of items
      maxScore++;
      if (allItems.length >= 4) {
        score++;
        checks.push({ check: `Extracted ≥4 items (got ${allItems.length})`, pass: true });
      } else {
        checks.push({ check: `Extracted ≥4 items (got ${allItems.length})`, pass: false });
      }

      // Step 2: Embed and compute similarity matrix
      if (allItems.length >= 2 && aiEmbed) {
        const embeddings = [];
        for (const item of allItems) {
          const emb = await aiEmbed(`${item.title} ${item.summary}`);
          embeddings.push(emb);
        }

        // Find duplicate pairs (cosine similarity > 0.8)
        const duplicatePairs = [];
        const THRESHOLD = 0.8;

        for (let i = 0; i < embeddings.length; i++) {
          for (let j = i + 1; j < embeddings.length; j++) {
            const sim = cosineSimilarity(embeddings[i], embeddings[j]);
            if (sim >= THRESHOLD) {
              duplicatePairs.push({
                item1: allItems[i].title,
                item2: allItems[j].title,
                similarity: sim.toFixed(3),
                crossSource: allItems[i].source !== allItems[j].source,
              });
            }
          }
        }

        console.log(`  🔗 Found ${duplicatePairs.length} duplicate pairs (similarity ≥ ${THRESHOLD})`);
        for (const pair of duplicatePairs) {
          const tag = pair.crossSource ? '🔄 cross-source' : '📎 same-source';
          console.log(`      ${tag}: "${pair.item1}" ↔ "${pair.item2}" (${pair.similarity})`);
        }

        // Check: detected expected duplicate pairs
        for (const [term1, term2] of fixture.expectedDuplicatePairs) {
          maxScore++;
          const found = duplicatePairs.some(p =>
            (p.item1.toLowerCase().includes(term1.toLowerCase()) && p.item2.toLowerCase().includes(term2.toLowerCase())) ||
            (p.item1.toLowerCase().includes(term2.toLowerCase()) && p.item2.toLowerCase().includes(term1.toLowerCase()))
          );
          if (found) {
            score++;
            checks.push({ check: `Detected duplicate: "${term1}" ↔ "${term2}"`, pass: true });
          } else {
            checks.push({ check: `Detected duplicate: "${term1}" ↔ "${term2}"`, pass: false });
          }
        }

        // Check: unique stories remain separate
        if (fixture.expectedUniqueStories) {
          for (const unique of fixture.expectedUniqueStories) {
            maxScore++;
            const itemExists = allItems.some(it => it.title.toLowerCase().includes(unique.toLowerCase()));
            if (itemExists) {
              score++;
              checks.push({ check: `Unique story preserved: "${unique}"`, pass: true });
            } else {
              checks.push({ check: `Unique story preserved: "${unique}"`, pass: false });
            }
          }
        }
      } else {
        console.log('  ⚠️  Skipping embedding-based dedup (no items or no embed function)');
      }

      const pct = maxScore > 0 ? ((score / maxScore) * 100).toFixed(0) : 0;
      totalScore += maxScore > 0 ? score / maxScore : 0;

      const icon = score === maxScore ? '✅' : score > maxScore / 2 ? '⚠️' : '❌';
      console.log(`\n  ${icon} [${fixture.id}] Score: ${score}/${maxScore} (${pct}%)`);

      const failed = checks.filter(c => !c.pass);
      if (failed.length > 0) {
        for (const f of failed) {
          console.log(`      ↳ FAIL: ${f.check}`);
        }
      }

      results.push({
        id: fixture.id,
        score,
        maxScore,
        pct: parseFloat(pct),
        itemsExtracted: allItems.length,
        checks,
      });
    } catch (err) {
      console.log(`  ⚠️  [${fixture.id}] ERROR: ${err.message}`);
      results.push({ id: fixture.id, error: err.message });
    }
  }

  const avgScore = totalTests > 0 ? ((totalScore / totalTests) * 100).toFixed(1) : '0';

  console.log(`\n  ─── Results ───`);
  console.log(`  Average Score: ${avgScore}%`);

  return {
    suite: 'newsletter_dedup',
    total: totalTests,
    avgScore: parseFloat(avgScore),
    results,
    grade: avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 60 ? 'C' : 'F',
  };
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
