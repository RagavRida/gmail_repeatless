#!/usr/bin/env node
/**
 * Gmail Repeatless — LLM Evaluation Runner
 *
 * Three evaluation modes:
 *   1. Unit Tests    — Keyword/structure checks (fast, deterministic)
 *   2. LLM-as-Judge  — Gemini evaluates AI outputs against rubrics (deep, nuanced)
 *   3. Human Eval    — Generates scoring forms for manual review
 *
 * Usage:
 *   node --env-file=../backend/.env run-evals.js                    # All unit tests
 *   node --env-file=../backend/.env run-evals.js --mode judge       # LLM-as-Judge
 *   node --env-file=../backend/.env run-evals.js --mode human       # Generate human eval forms
 *   node --env-file=../backend/.env run-evals.js --suite chat       # Single suite
 *   node --env-file=../backend/.env run-evals.js --mode judge --suite chat  # Judge one suite
 */
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Unit test suites
import { runCategorizationEval } from './eval-categorization.js';
import { runSummarizationEval } from './eval-summarization.js';
import { runChatEval } from './eval-chat.js';
import { runComposeEval } from './eval-compose.js';
import { runNewsletterEval } from './eval-newsletter.js';
import { runRouterEval } from './eval-router.js';

// LLM-as-Judge
import { runJudgedEval, RUBRICS } from './llm-judge.js';

// Human Eval
import { generateHumanEvalForms } from './human-eval.js';

// Fixtures
import {
  CATEGORIZATION_FIXTURES,
  SUMMARIZATION_FIXTURES,
  CHAT_RAG_FIXTURES,
  COMPOSE_FIXTURES,
  REPLY_FIXTURES,
} from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ================================================================
// CONFIG
// ================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const NIM_BASE_URL = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-8b-instruct';

// ================================================================
// INIT AI CLIENTS
// ================================================================

let gemini = null;
let nim = null;

function initClients() {
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not set. Copy backend/.env.example → backend/.env and set it.');
    process.exit(1);
  }

  gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  console.log(`✅ Gemini client initialized (${GEMINI_MODEL})`);

  if (NIM_API_KEY) {
    nim = new OpenAI({ apiKey: NIM_API_KEY, baseURL: NIM_BASE_URL });
    console.log(`✅ NIM client initialized (${NIM_MODEL})`);
  } else {
    console.warn('⚠️  NVIDIA_NIM_API_KEY not set — NIM evals will use Gemini as fallback');
  }
}

// ================================================================
// AI WRAPPERS
// ================================================================

async function aiGenerate(task, params) {
  const isClassify = task === 'classify';
  const primaryFn = isClassify && nim ? nimGenerate : geminiGenerate;
  const fallbackFn = isClassify ? geminiGenerate : (nim ? nimGenerate : geminiGenerate);

  try {
    return await primaryFn(params.prompt, params.opts);
  } catch (primaryErr) {
    console.warn(`  ⚠️  Primary failed, trying fallback: ${primaryErr.message}`);
    return await fallbackFn(params.prompt, params.opts);
  }
}

async function geminiGenerate(prompt, opts = {}) {
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  const requestOpts = { model: GEMINI_MODEL, contents };
  const config = {};

  if (opts.systemInstruction) config.systemInstruction = opts.systemInstruction;
  if (opts.temperature !== undefined) config.temperature = opts.temperature;
  if (opts.maxTokens) config.maxOutputTokens = opts.maxTokens;
  if (opts.responseMimeType) config.responseMimeType = opts.responseMimeType;
  if (Object.keys(config).length > 0) requestOpts.config = config;

  const response = await gemini.models.generateContent(requestOpts);
  return response.text || '';
}

async function nimGenerate(prompt, opts = {}) {
  if (!nim) throw new Error('NIM client not initialized');
  const messages = [];
  if (opts.systemInstruction || opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemInstruction || opts.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await nim.chat.completions.create({
    model: NIM_MODEL, messages,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 256,
  });
  return response.choices?.[0]?.message?.content?.trim() || '';
}

async function aiEmbed(text) {
  const response = await gemini.models.embedContent({
    model: GEMINI_EMBEDDING_MODEL,
    contents: [{ parts: [{ text }] }],
    config: { outputDimensionality: 768 },
  });
  return response.embeddings?.[0]?.values;
}

// ================================================================
// BUILD JUDGE TEST CASES (transform fixtures → judge format)
// ================================================================

function buildJudgeTestCases(rubricKey) {
  switch (rubricKey) {
    case 'categorization':
      return CATEGORIZATION_FIXTURES.slice(0, 6).map(f => ({
        id: f.id,
        task: 'classify',
        input: `Subject: ${f.subject}\nFrom: ${f.from}\nPreview: ${f.snippet}\n\nExpected category: ${f.expectedCategory}`,
        prompt: `Classify this email into exactly ONE category. Respond with ONLY the category name.\nCategories: newsletter, job_recruitment, finance, notifications, personal, work_professional, uncategorized\n\nSubject: ${f.subject}\nFrom: ${f.from}\nPreview: ${f.snippet}\n\nCategory:`,
        opts: { temperature: 0.0, maxTokens: 30 },
      }));

    case 'summarization':
      return SUMMARIZATION_FIXTURES.map(f => {
        let prompt, input;
        if (f.isThread) {
          const msgs = f.messages.map((m, i) => `From: ${m.from}\nDate: ${m.date}\n${m.body}`).join('\n\n');
          prompt = `Summarize this email thread in 2-4 sentences:\n\nThread: ${f.subject}\n${msgs}\n\nSummary:`;
          input = `Thread: "${f.subject}"\n${msgs}`;
        } else {
          prompt = `Summarize this email in 1-2 sentences:\n\nSubject: ${f.subject}\nFrom: ${f.from}\nBody: ${f.body}\n\nSummary:`;
          input = `Subject: "${f.subject}"\nFrom: ${f.from}\nBody: ${f.body}`;
        }
        return { id: f.id, task: 'generate', input, prompt, opts: { temperature: 0.2, maxTokens: 200 } };
      });

    case 'chat_rag':
      return CHAT_RAG_FIXTURES.map(f => {
        const contextBlocks = f.contextEmails.map((e, i) =>
          `[Source ${i + 1}] ${e.subject} | From: ${e.from} | ${e.date}\n${e.body}`
        ).join('\n\n');

        return {
          id: f.id,
          task: 'generate',
          input: `Question: "${f.question}"\n\nContext emails:\n${contextBlocks || '(none provided)'}${f.shouldAdmitNoInfo ? '\n\n⚠️ The agent should admit it has no relevant information.' : ''}`,
          prompt: `You are an AI email assistant. Answer using ONLY the email context below. Cite sources. If info is missing, say so.\n\nContext:\n${contextBlocks || '(No relevant emails found)'}\n\nQuestion: ${f.question}\n\nAnswer:`,
          opts: {
            systemInstruction: 'Answer exclusively from the user\'s emails. Always cite sources. Never hallucinate.',
            temperature: 0.3, maxTokens: 800,
          },
        };
      });

    case 'compose':
      return [
        ...COMPOSE_FIXTURES.map(f => ({
          id: f.id,
          task: 'generate',
          input: `Prompt: "${f.prompt}"\nTone: ${f.tone}`,
          prompt: `Draft a professional email based on the user's instructions. Return ONLY the email body.\n\nInstructions: ${f.prompt}\nTone: ${f.tone}\n\nEmail:`,
          opts: { temperature: 0.5, maxTokens: 600 },
        })),
        ...REPLY_FIXTURES.map(f => {
          const threadCtx = f.threadMessages.map(m => `From: ${m.from_address}\n${m.body_text}`).join('\n\n');
          return {
            id: f.id,
            task: 'generate',
            input: `Reply prompt: "${f.prompt}"\nTone: ${f.tone}\nThread context:\n${threadCtx}`,
            prompt: `Draft a reply to this email thread. Use full thread context.\n\nThread:\n${threadCtx}\n\nReply instructions: ${f.prompt}\nTone: ${f.tone}\n\nReply:`,
            opts: { temperature: 0.5, maxTokens: 600 },
          };
        }),
      ];

    default:
      return [];
  }
}

// ================================================================
// MAIN
// ================================================================

async function main() {
  const args = process.argv.slice(2);
  const suiteFilter = args.includes('--suite') ? args[args.indexOf('--suite') + 1] : null;
  const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'unit';

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Gmail Repeatless — LLM Evaluation Suite                 ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Mode: ${mode.toUpperCase().padEnd(12)} │ Suite: ${(suiteFilter || 'ALL').padEnd(20)}  ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  initClients();

  const totalStart = Date.now();
  let allResults = {};

  // ─── MODE: UNIT TESTS ───────────────────────────────
  if (mode === 'unit') {
    const suites = {
      router: () => runRouterEval(geminiGenerate, nim ? nimGenerate : geminiGenerate),
      categorization: () => runCategorizationEval(aiGenerate),
      summarization: () => runSummarizationEval(aiGenerate),
      chat: () => runChatEval(aiGenerate),
      compose: () => runComposeEval(aiGenerate),
      newsletter: () => runNewsletterEval(aiGenerate, aiEmbed),
    };

    const suitesToRun = suiteFilter ? { [suiteFilter]: suites[suiteFilter] } : suites;

    for (const [name, runFn] of Object.entries(suitesToRun)) {
      if (!runFn) { console.error(`Unknown suite: ${name}`); continue; }
      try { allResults[name] = await runFn(); }
      catch (err) { allResults[name] = { suite: name, error: err.message, grade: 'ERROR' }; }
    }
  }

  // ─── MODE: LLM-AS-JUDGE ────────────────────────────
  else if (mode === 'judge') {
    const rubricKeys = suiteFilter ? [suiteFilter] : Object.keys(RUBRICS);

    for (const rubricKey of rubricKeys) {
      if (!RUBRICS[rubricKey]) {
        console.error(`Unknown rubric: ${rubricKey}. Available: ${Object.keys(RUBRICS).join(', ')}`);
        continue;
      }
      const testCases = buildJudgeTestCases(rubricKey);
      if (testCases.length === 0) {
        console.log(`⚠️  No test cases for rubric: ${rubricKey}`);
        continue;
      }

      try {
        allResults[rubricKey] = await runJudgedEval(geminiGenerate, aiGenerate, rubricKey, testCases);
      } catch (err) {
        console.error(`Suite "${rubricKey}" crashed: ${err.message}`);
        allResults[rubricKey] = { suite: rubricKey, error: err.message, grade: 'ERROR' };
      }
    }
  }

  // ─── MODE: HUMAN EVAL ──────────────────────────────
  else if (mode === 'human') {
    const formPath = await generateHumanEvalForms(aiGenerate, aiEmbed);
    console.log(`\n✅ Human eval form generated. Open it, review each AI output, and fill in scores.`);
    allResults.human = { formPath, grade: 'PENDING_REVIEW' };
  }

  else {
    console.error(`Unknown mode: ${mode}. Use: unit, judge, or human`);
    process.exit(1);
  }

  const totalTime = ((Date.now() - totalStart) / 1000).toFixed(1);

  // ================================================================
  // REPORT CARD
  // ================================================================

  if (mode !== 'human') {
    console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
    console.log(`║                 REPORT CARD (${mode.toUpperCase()})                           ║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');

    const grades = [];
    for (const [name, result] of Object.entries(allResults)) {
      const grade = result.grade || 'N/A';
      const score = result.avgScore !== undefined ? `${result.avgScore}${mode === 'judge' ? '/5.0' : '%'}` :
                    result.accuracy !== undefined ? `${result.accuracy}%` :
                    result.pct !== undefined ? `${result.pct}%` : '—';
      const extras = [];
      if (result.criticalFails) extras.push(`${result.criticalFails} critical`);
      if (result.criticalIssues) extras.push(`${result.criticalIssues} issues`);
      const extraStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';

      console.log(`║  ${grade.padEnd(5)} │ ${name.padEnd(20)} │ ${score.padEnd(10)} ${extraStr}`);
      grades.push(grade);
    }

    console.log('╠══════════════════════════════════════════════════════════════╣');

    const gradeValues = { A: 4, B: 3, C: 2, F: 0, ERROR: -1, 'N/A': -1 };
    const validGrades = grades.filter(g => gradeValues[g] >= 0);
    const avgGrade = validGrades.length > 0
      ? validGrades.reduce((s, g) => s + gradeValues[g], 0) / validGrades.length : 0;
    const overallGrade = avgGrade >= 3.5 ? 'A' : avgGrade >= 2.5 ? 'B' : avgGrade >= 1.5 ? 'C' : 'F';

    console.log(`║  OVERALL: ${overallGrade}  │ Time: ${totalTime}s │ Mode: ${mode.toUpperCase().padEnd(5)} │ Suites: ${Object.keys(allResults).length}  ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      mode,
      models: { gemini: GEMINI_MODEL, nim: NIM_MODEL, nimAvailable: !!nim },
      totalTimeSeconds: parseFloat(totalTime),
      overallGrade,
      suites: allResults,
    };

    const reportName = mode === 'judge' ? 'eval-report-judge.json' : 'eval-report.json';
    const reportPath = path.join(__dirname, reportName);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved to: ${reportPath}\n`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
