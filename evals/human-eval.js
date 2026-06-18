/**
 * Human Evaluation Framework
 *
 * Generates structured evaluation forms that a human rater can fill out.
 * Outputs a Markdown report with rating scales and space for comments.
 *
 * Workflow:
 * 1. AI generates outputs for each test case
 * 2. This script renders them into a Markdown eval form
 * 3. Human fills in scores + comments
 * 4. Results are saved as JSON for analysis
 *
 * Rating Scale (aligned with LLM-as-Judge for cross-comparison):
 *   1 = Unacceptable — factually wrong, harmful, or completely irrelevant
 *   2 = Poor — partially wrong, missing key information, or off-tone
 *   3 = Acceptable — gets the job done but mediocre quality
 *   4 = Good — correct, well-structured, minor nits only
 *   5 = Excellent — would send as-is, impressive quality
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CATEGORIZATION_FIXTURES,
  SUMMARIZATION_FIXTURES,
  CHAT_RAG_FIXTURES,
  COMPOSE_FIXTURES,
  REPLY_FIXTURES,
  NEWSLETTER_DEDUP_FIXTURES,
} from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generate human evaluation forms for each AI feature.
 * @param {Function} aiGenerate - AI generation function
 * @param {Function} aiEmbed - AI embedding function (for newsletter)
 */
export async function generateHumanEvalForms(aiGenerate, aiEmbed) {
  const timestamp = new Date().toISOString().split('T')[0];
  let markdown = '';

  markdown += `# Human Evaluation — Gmail Repeatless AI Features\n\n`;
  markdown += `**Date**: ${timestamp}\n`;
  markdown += `**Evaluator**: _______________\n\n`;
  markdown += `**Rating Scale**: 1 = Unacceptable | 2 = Poor | 3 = Acceptable | 4 = Good | 5 = Excellent\n\n`;
  markdown += `---\n\n`;

  // ============================================================
  // SECTION 1: CATEGORIZATION
  // ============================================================
  markdown += `## 1. Email Categorization\n\n`;
  markdown += `Rate whether the AI correctly classified each email.\n\n`;
  markdown += `| # | Subject | Expected | AI Predicted | Correct? | Score (1-5) | Notes |\n`;
  markdown += `|---|---------|----------|-------------|----------|-------------|-------|\n`;

  for (let i = 0; i < Math.min(CATEGORIZATION_FIXTURES.length, 6); i++) {
    const f = CATEGORIZATION_FIXTURES[i];
    try {
      const prompt = `Classify this email into exactly ONE category. Respond with ONLY the category name.\nCategories: newsletter, job_recruitment, finance, notifications, personal, work_professional, uncategorized\n\nSubject: ${f.subject}\nFrom: ${f.from}\nPreview: ${f.snippet}\n\nCategory:`;
      const predicted = await aiGenerate('classify', { prompt, opts: { temperature: 0.0, maxTokens: 30 } });
      markdown += `| ${i + 1} | ${f.subject.substring(0, 40)}... | ${f.expectedCategory} | ${predicted.trim()} | ☐ Yes ☐ No | ___ | |\n`;
    } catch (err) {
      markdown += `| ${i + 1} | ${f.subject.substring(0, 40)}... | ${f.expectedCategory} | ERROR | ☐ Yes ☐ No | ___ | ${err.message} |\n`;
    }
  }

  markdown += `\n**Categorization Overall Score**: ___ / 5\n`;
  markdown += `**Comments**: \n\n---\n\n`;

  // ============================================================
  // SECTION 2: SUMMARIZATION
  // ============================================================
  markdown += `## 2. Email Summarization\n\n`;

  for (const f of SUMMARIZATION_FIXTURES) {
    try {
      let prompt;
      if (f.isThread) {
        const msgs = f.messages.map((m, i) => `From: ${m.from}\nDate: ${m.date}\n${m.body}`).join('\n\n');
        prompt = `Summarize this email thread in 2-4 sentences:\n\nThread: ${f.subject}\n${msgs}\n\nSummary:`;
      } else {
        prompt = `Summarize this email in 1-2 sentences:\n\nSubject: ${f.subject}\nFrom: ${f.from}\nBody: ${f.body}\n\nSummary:`;
      }
      const summary = await aiGenerate('generate', { prompt, opts: { temperature: 0.2, maxTokens: 200 } });

      markdown += `### ${f.isThread ? 'Thread' : 'Email'}: "${f.subject}"\n\n`;
      markdown += `**AI Summary**:\n> ${summary.replace(/\n/g, '\n> ')}\n\n`;
      markdown += `| Criterion | Score (1-5) | Notes |\n`;
      markdown += `|-----------|-------------|-------|\n`;
      markdown += `| Factual Accuracy (no invented facts) | ___ | |\n`;
      markdown += `| Key Info Coverage (captures important points) | ___ | |\n`;
      markdown += `| Conciseness (brief but not vague) | ___ | |\n`;
      markdown += `| Readability (well-written, clear) | ___ | |\n\n`;
    } catch (err) {
      markdown += `### "${f.subject}" — ERROR: ${err.message}\n\n`;
    }
  }

  markdown += `**Summarization Overall Score**: ___ / 5\n`;
  markdown += `**Comments**: \n\n---\n\n`;

  // ============================================================
  // SECTION 3: RAG CHAT AGENT (most critical)
  // ============================================================
  markdown += `## 3. RAG Chat Agent ⭐ (Most Critical)\n\n`;
  markdown += `The chat agent is the centerpiece feature. Evaluate whether it:\n`;
  markdown += `- Answers from provided email context ONLY\n`;
  markdown += `- Cites its sources\n`;
  markdown += `- Does NOT hallucinate\n`;
  markdown += `- Admits when info is missing\n\n`;

  for (const f of CHAT_RAG_FIXTURES) {
    const contextBlocks = f.contextEmails.map((e, i) =>
      `[Source ${i + 1}] ${e.subject} | From: ${e.from} | ${e.date}\n${e.body}`
    ).join('\n\n');

    const prompt = `You are an AI email assistant. Answer using ONLY the email context below. Cite sources. If info is missing, say so.

Context:
${contextBlocks || '(No relevant emails found)'}

Question: ${f.question}

Answer:`;

    try {
      const answer = await aiGenerate('generate', {
        prompt,
        opts: {
          systemInstruction: 'Answer exclusively from the user\'s emails. Always cite sources. Never hallucinate.',
          temperature: 0.3, maxTokens: 800,
        },
      });

      markdown += `### Question: "${f.question}"\n\n`;
      if (f.contextEmails.length > 0) {
        markdown += `**Context provided**: ${f.contextEmails.map(e => `"${e.subject}"`).join(', ')}\n\n`;
      } else {
        markdown += `**Context provided**: *(none — agent should admit this)*\n\n`;
      }
      markdown += `**AI Answer**:\n> ${answer.replace(/\n/g, '\n> ')}\n\n`;
      markdown += `| Criterion | Score (1-5) | Notes |\n`;
      markdown += `|-----------|-------------|-------|\n`;
      markdown += `| Grounding (only uses provided context) | ___ | |\n`;
      markdown += `| Source Attribution (cites specific emails/senders) | ___ | |\n`;
      markdown += `| Relevance (directly answers the question) | ___ | |\n`;
      markdown += `| Hallucination Check (any fabricated facts?) | ___ | |\n`;
      if (f.shouldAdmitNoInfo) {
        markdown += `| Honesty (admits info is not available) | ___ | |\n`;
      }
      markdown += `\n`;
    } catch (err) {
      markdown += `### "${f.question}" — ERROR: ${err.message}\n\n`;
    }
  }

  markdown += `**Chat Agent Overall Score**: ___ / 5\n`;
  markdown += `**Hallucinations detected?**: ☐ Yes ☐ No  (If yes, list them below)\n`;
  markdown += `**Comments**: \n\n---\n\n`;

  // ============================================================
  // SECTION 4: COMPOSE & REPLY
  // ============================================================
  markdown += `## 4. Compose & Reply\n\n`;

  for (const f of COMPOSE_FIXTURES) {
    try {
      const prompt = `Draft a professional email based on the user's instructions. Return ONLY the email body.\n\nInstructions: ${f.prompt}\nTone: ${f.tone}\n\nEmail:`;
      const draft = await aiGenerate('generate', { prompt, opts: { temperature: 0.5, maxTokens: 600 } });

      markdown += `### Compose: "${f.prompt}" (Tone: ${f.tone})\n\n`;
      markdown += `**AI Draft**:\n> ${draft.replace(/\n/g, '\n> ')}\n\n`;
      markdown += `| Criterion | Score (1-5) | Notes |\n`;
      markdown += `|-----------|-------------|-------|\n`;
      markdown += `| Tone Match (matches ${f.tone}) | ___ | |\n`;
      markdown += `| Prompt Adherence (addresses the request) | ___ | |\n`;
      markdown += `| Email Quality (would you send this?) | ___ | |\n\n`;
    } catch (err) {
      markdown += `### Compose: "${f.prompt}" — ERROR: ${err.message}\n\n`;
    }
  }

  for (const f of REPLY_FIXTURES) {
    const threadCtx = f.threadMessages.map(m => `From: ${m.from_address}\n${m.body_text}`).join('\n\n');
    try {
      const prompt = `Draft a reply to this email thread. Use full thread context.\n\nThread:\n${threadCtx}\n\nReply instructions: ${f.prompt}\nTone: ${f.tone}\n\nReply:`;
      const reply = await aiGenerate('generate', { prompt, opts: { temperature: 0.5, maxTokens: 600 } });

      markdown += `### Reply: "${f.prompt}" (Tone: ${f.tone})\n\n`;
      markdown += `**Thread context**: ${f.threadMessages[0].from_address} → "${f.threadMessages[0].body_text.substring(0, 80)}..."\n\n`;
      markdown += `**AI Reply**:\n> ${reply.replace(/\n/g, '\n> ')}\n\n`;
      markdown += `| Criterion | Score (1-5) | Notes |\n`;
      markdown += `|-----------|-------------|-------|\n`;
      markdown += `| Tone Match | ___ | |\n`;
      markdown += `| Thread-Context Awareness (references prior messages) | ___ | |\n`;
      markdown += `| Email Quality | ___ | |\n\n`;
    } catch (err) {
      markdown += `### Reply: "${f.prompt}" — ERROR: ${err.message}\n\n`;
    }
  }

  markdown += `**Compose/Reply Overall Score**: ___ / 5\n`;
  markdown += `**Comments**: \n\n---\n\n`;

  // ============================================================
  // SECTION 5: OVERALL VERDICT
  // ============================================================
  markdown += `## Overall Human Evaluation\n\n`;
  markdown += `| Feature | Score (1-5) | Weight | Weighted |\n`;
  markdown += `|---------|-------------|--------|----------|\n`;
  markdown += `| Categorization | ___ | 15% | |\n`;
  markdown += `| Summarization | ___ | 20% | |\n`;
  markdown += `| RAG Chat Agent | ___ | 30% | |\n`;
  markdown += `| Compose/Reply | ___ | 20% | |\n`;
  markdown += `| Newsletter Dedup | ___ | 15% | |\n`;
  markdown += `| **Overall** | | **100%** | **___** |\n\n`;
  markdown += `### Final Grade\n`;
  markdown += `☐ A (4.0-5.0) — Production-ready quality\n`;
  markdown += `☐ B (3.0-3.9) — Good with minor issues\n`;
  markdown += `☐ C (2.0-2.9) — Acceptable but needs work\n`;
  markdown += `☐ F (<2.0) — Significant quality issues\n\n`;
  markdown += `### Key Strengths\n1. \n2. \n3. \n\n`;
  markdown += `### Key Issues\n1. \n2. \n3. \n\n`;
  markdown += `### Hallucination Incidents\n*(List any cases where the AI fabricated information)*\n\n`;

  // Save
  const outputPath = path.join(__dirname, `human-eval-form-${timestamp}.md`);
  fs.writeFileSync(outputPath, markdown);
  console.log(`\n📋 Human eval form saved to: ${outputPath}`);
  return outputPath;
}
