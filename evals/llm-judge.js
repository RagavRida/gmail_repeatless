/**
 * LLM-as-Judge Evaluation Framework
 *
 * Uses Gemini as an impartial judge to evaluate AI outputs against
 * structured rubrics. Each criterion is scored 1-5 with written justification.
 *
 * Why LLM-as-Judge:
 * - Keyword matching catches surface-level issues but misses quality/coherence
 * - A judge model can assess nuance: "Is this reply appropriately apologetic?"
 * - Produces explainable scores (justifications are auditable)
 * - Scales to hundreds of test cases without human bottleneck
 *
 * Safeguard: The judge uses a DIFFERENT system prompt and temperature than the
 * generation models, and explicitly instructs it to be critical and adversarial.
 */

// ================================================================
// RUBRIC DEFINITIONS
// ================================================================

export const RUBRICS = {
  categorization: {
    name: 'Email Categorization',
    criteria: [
      {
        id: 'accuracy',
        name: 'Classification Accuracy',
        description: 'Does the predicted category match the ground truth? Consider edge cases where multiple categories could apply.',
        weight: 1.0,
      },
    ],
  },

  summarization: {
    name: 'Email Summarization',
    criteria: [
      {
        id: 'factual_accuracy',
        name: 'Factual Accuracy',
        description: 'Does the summary contain ONLY facts present in the source email? Deduct heavily for any invented details, made-up numbers, or fabricated context.',
        weight: 0.3,
      },
      {
        id: 'completeness',
        name: 'Key Information Coverage',
        description: 'Does the summary capture the most important information: key action items, deadlines, decisions, or requests? Missing critical information should score low.',
        weight: 0.3,
      },
      {
        id: 'conciseness',
        name: 'Conciseness',
        description: 'Is the summary appropriately brief without being vague? It should not repeat the original email verbatim or include unnecessary filler.',
        weight: 0.2,
      },
      {
        id: 'coherence',
        name: 'Coherence & Readability',
        description: 'Is the summary well-structured, grammatically correct, and easy to understand at a glance?',
        weight: 0.2,
      },
    ],
  },

  chat_rag: {
    name: 'RAG Chat Agent',
    criteria: [
      {
        id: 'grounding',
        name: 'Grounding (No Hallucination)',
        description: 'Does the answer contain ONLY information present in the provided email context? Score 1 if any fabricated facts appear. This is the most critical criterion.',
        weight: 0.35,
      },
      {
        id: 'source_attribution',
        name: 'Source Attribution',
        description: 'Does the answer clearly cite which email, sender, or thread each fact came from? Vague references like "an email" score lower than specific "Antony from Supabase (Jun 16)".',
        weight: 0.2,
      },
      {
        id: 'relevance',
        name: 'Answer Relevance',
        description: 'Does the answer directly address the user\'s question? Tangential or generic responses score low.',
        weight: 0.2,
      },
      {
        id: 'synthesis',
        name: 'Cross-Email Synthesis',
        description: 'When multiple sources discuss the same topic, does the answer weave them into a coherent narrative rather than just listing each source separately?',
        weight: 0.15,
      },
      {
        id: 'honesty',
        name: 'Epistemic Honesty',
        description: 'When information is missing or ambiguous, does the agent explicitly say so? Score 1 if it fabricates answers for questions not covered by context.',
        weight: 0.1,
      },
    ],
  },

  compose: {
    name: 'Email Composition',
    criteria: [
      {
        id: 'tone_match',
        name: 'Tone Appropriateness',
        description: 'Does the draft match the requested tone (Professional, Friendly, Concise)? A professional email should not use slang; a friendly one should not be stiff.',
        weight: 0.25,
      },
      {
        id: 'prompt_adherence',
        name: 'Prompt Adherence',
        description: 'Does the draft address what the user asked for? If the prompt says "follow up about Q3 delay", the draft must discuss Q3 and the delay.',
        weight: 0.3,
      },
      {
        id: 'email_quality',
        name: 'Email Quality',
        description: 'Is this a well-structured, professional email that a real person would actually send? Consider greeting, body structure, sign-off, and overall polish.',
        weight: 0.25,
      },
      {
        id: 'thread_awareness',
        name: 'Thread Context Awareness (replies only)',
        description: 'For reply drafts: does the reply show understanding of the prior conversation? Does it reference specific points from earlier messages? Score N/A for new compositions.',
        weight: 0.2,
      },
    ],
  },

  newsletter: {
    name: 'Newsletter Deduplication',
    criteria: [
      {
        id: 'extraction_quality',
        name: 'Extraction Quality',
        description: 'Were distinct news items correctly extracted from the newsletter body? Each item should be a separate, meaningful story — not fragments or headers.',
        weight: 0.35,
      },
      {
        id: 'dedup_precision',
        name: 'Deduplication Precision',
        description: 'Were truly duplicate stories (same event from different sources) correctly identified as duplicates? False positives (unrelated stories marked as duplicates) score low.',
        weight: 0.35,
      },
      {
        id: 'dedup_recall',
        name: 'Deduplication Recall',
        description: 'Were all actual duplicates found? Missing duplicates (same story from two newsletters treated as separate) score low.',
        weight: 0.3,
      },
    ],
  },
};

// ================================================================
// JUDGE PROMPT BUILDER
// ================================================================

function buildJudgePrompt(rubric, testCase, aiOutput) {
  const criteriaBlock = rubric.criteria.map((c, i) =>
    `${i + 1}. **${c.name}** (weight: ${(c.weight * 100).toFixed(0)}%)\n   ${c.description}`
  ).join('\n\n');

  return `You are an expert AI evaluator performing a rigorous quality assessment. Be critical and honest — do NOT inflate scores. Award 5 only for truly excellent outputs.

## Task
Evaluate the following AI output against the rubric criteria below. For each criterion, provide:
- A score from 1-5 (1=terrible, 2=poor, 3=acceptable, 4=good, 5=excellent)
- A brief justification (1-2 sentences explaining the score)

## Rubric: ${rubric.name}

${criteriaBlock}

## Test Input
${testCase.input}

## AI Output Being Evaluated
${aiOutput}

## Your Evaluation
Respond with a valid JSON object in this exact format:
{
  "scores": {
${rubric.criteria.map(c => `    "${c.id}": { "score": <1-5>, "justification": "<reason>" }`).join(',\n')}
  },
  "overall_comment": "<one sentence summary of the output quality>",
  "critical_issues": ["<list any hallucinations, factual errors, or safety issues — empty array if none>"]
}

JSON:`;
}

// ================================================================
// JUDGE EXECUTION
// ================================================================

/**
 * Run LLM-as-Judge on a single test case.
 * @param {Function} judgeGenerate - The LLM generation function for the judge
 * @param {string} rubricKey - Key into RUBRICS
 * @param {object} testCase - { id, input, ... }
 * @param {string} aiOutput - The AI output to evaluate
 * @returns {object} Structured evaluation with scores and justifications
 */
export async function judgeOutput(judgeGenerate, rubricKey, testCase, aiOutput) {
  const rubric = RUBRICS[rubricKey];
  if (!rubric) throw new Error(`Unknown rubric: ${rubricKey}`);

  const prompt = buildJudgePrompt(rubric, testCase, aiOutput);

  const raw = await judgeGenerate(prompt, {
    temperature: 0.1, // Low temperature for consistent evaluation
    maxTokens: 800,
    responseMimeType: 'application/json',
  });

  // Parse judge response
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const evaluation = JSON.parse(cleaned);

  // Compute weighted score
  let weightedSum = 0;
  let totalWeight = 0;

  for (const criterion of rubric.criteria) {
    const score = evaluation.scores?.[criterion.id]?.score;
    if (score !== undefined) {
      weightedSum += score * criterion.weight;
      totalWeight += criterion.weight;
    }
  }

  const weightedScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
  const normalizedScore = ((weightedScore / 5) * 100).toFixed(1);

  return {
    rubric: rubricKey,
    testId: testCase.id,
    scores: evaluation.scores,
    weightedScore: parseFloat(weightedScore.toFixed(2)),
    normalizedPct: parseFloat(normalizedScore),
    overallComment: evaluation.overall_comment,
    criticalIssues: evaluation.critical_issues || [],
    hasCriticalIssues: (evaluation.critical_issues || []).length > 0,
  };
}

/**
 * Run full LLM-as-Judge evaluation across all test cases for a rubric.
 */
export async function runJudgedEval(judgeGenerate, aiGenerate, rubricKey, testCases) {
  const rubric = RUBRICS[rubricKey];
  const results = [];

  console.log(`\n━━━ LLM-AS-JUDGE: ${rubric.name.toUpperCase()} ━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Judge: Gemini (adversarial mode) | ${testCases.length} test cases\n`);
  console.log(`  Criteria:`);
  for (const c of rubric.criteria) {
    console.log(`    • ${c.name} (${(c.weight * 100).toFixed(0)}%)`);
  }
  console.log('');

  for (const testCase of testCases) {
    try {
      // Step 1: Generate the AI output being evaluated
      const aiOutput = await aiGenerate(testCase.task || 'generate', {
        prompt: testCase.prompt,
        opts: testCase.opts || { temperature: 0.3, maxTokens: 600 },
      });

      // Step 2: Have the judge evaluate it
      const evaluation = await judgeOutput(judgeGenerate, rubricKey, testCase, aiOutput);
      results.push(evaluation);

      // Display
      const icon = evaluation.hasCriticalIssues ? '🚨' :
                   evaluation.weightedScore >= 4 ? '✅' :
                   evaluation.weightedScore >= 3 ? '⚠️' : '❌';

      console.log(`  ${icon} [${testCase.id}] Score: ${evaluation.weightedScore}/5.0 (${evaluation.normalizedPct}%)`);
      console.log(`     "${evaluation.overallComment}"`);

      // Show individual criterion scores
      for (const [criterionId, data] of Object.entries(evaluation.scores || {})) {
        const criterion = rubric.criteria.find(c => c.id === criterionId);
        const scoreBar = '█'.repeat(data.score) + '░'.repeat(5 - data.score);
        console.log(`     ${scoreBar} ${data.score}/5 ${criterion?.name || criterionId}`);
        if (data.score <= 2) {
          console.log(`          ↳ ${data.justification}`);
        }
      }

      if (evaluation.criticalIssues.length > 0) {
        console.log(`     🚨 Critical: ${evaluation.criticalIssues.join('; ')}`);
      }
      console.log('');

    } catch (err) {
      console.log(`  ⚠️  [${testCase.id}] ERROR: ${err.message}\n`);
      results.push({ testId: testCase.id, error: err.message });
    }
  }

  // Aggregate
  const validResults = results.filter(r => r.weightedScore !== undefined);
  const avgScore = validResults.length > 0
    ? (validResults.reduce((s, r) => s + r.weightedScore, 0) / validResults.length).toFixed(2)
    : 0;
  const avgPct = validResults.length > 0
    ? (validResults.reduce((s, r) => s + r.normalizedPct, 0) / validResults.length).toFixed(1)
    : 0;
  const criticalCount = results.filter(r => r.hasCriticalIssues).length;

  console.log(`  ─── Judge Verdict ───`);
  console.log(`  Average: ${avgScore}/5.0 (${avgPct}%)`);
  console.log(`  Critical Issues: ${criticalCount}/${results.length}`);
  console.log(`  Grade: ${getGrade(parseFloat(avgPct), criticalCount)}`);

  return {
    suite: `judge_${rubricKey}`,
    rubric: rubricKey,
    total: testCases.length,
    avgScore: parseFloat(avgScore),
    avgPct: parseFloat(avgPct),
    criticalIssues: criticalCount,
    results,
    grade: getGrade(parseFloat(avgPct), criticalCount),
  };
}

function getGrade(pct, criticals) {
  if (criticals > 0) return 'F';
  if (pct >= 85) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 55) return 'C';
  return 'F';
}
