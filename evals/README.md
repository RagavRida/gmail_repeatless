# LLM Evaluation Suite

Three evaluation modes to assess AI quality at different depths.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Evaluation Pyramid                         │
│                                                              │
│                    ╱╲  Human Eval                            │
│                   ╱  ╲  Manual scoring with rubrics          │
│                  ╱    ╲  (highest quality, lowest scale)     │
│                 ╱──────╲                                     │
│                ╱ LLM-as ╲  Gemini judges AI outputs          │
│               ╱  Judge   ╲  against structured rubrics       │
│              ╱────────────╲  (nuanced, scalable)             │
│             ╱  Unit Tests  ╲  Keyword checks, structure      │
│            ╱________________╲  (fast, deterministic)         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
cd evals
npm install

# Set API keys in ../backend/.env first, then:

# Mode 1: Unit Tests (keyword/structure checks)
npm run eval                        # All suites
npm run eval:chat                   # Single suite

# Mode 2: LLM-as-Judge (Gemini evaluates against rubrics)
npm run eval:judge                  # All rubrics
npm run eval:judge:chat             # Single rubric

# Mode 3: Human Eval (generates scoring forms)
npm run eval:human                  # Generates .md form
```

## Evaluation Modes

### 1. Unit Tests (`--mode unit`)

Fast, deterministic checks that verify basic quality signals:

| Check Type | What It Tests |
|-----------|---------------|
| Keyword presence | Does the summary mention "240%"? |
| Hallucination absence | Does the answer NOT mention "Google rejected"? |
| Length bounds | Is the reply between 30-300 words? |
| Structure | Is the JSON output parseable? |
| Source citation | Does the response reference a sender? |

**Best for**: CI pipelines, regression detection, smoke testing.

### 2. LLM-as-Judge (`--mode judge`)

Uses Gemini as an impartial evaluator. Each output is scored 1-5 on multiple weighted criteria with written justification.

**Rubrics by feature:**

| Feature | Criteria | Weights |
|---------|----------|---------|
| **Categorization** | Accuracy | 100% |
| **Summarization** | Factual Accuracy (30%), Completeness (30%), Conciseness (20%), Coherence (20%) |
| **RAG Chat** | Grounding (35%), Source Attribution (20%), Relevance (20%), Synthesis (15%), Honesty (10%) |
| **Compose/Reply** | Tone Match (25%), Prompt Adherence (30%), Email Quality (25%), Thread Awareness (20%) |
| **Newsletter** | Extraction Quality (35%), Dedup Precision (35%), Dedup Recall (30%) |

**Why it works**: The judge prompt explicitly instructs Gemini to be critical and adversarial. It uses low temperature (0.1) and structured JSON output for consistency.

**Best for**: Deep quality assessment, comparing model versions, identifying nuanced issues.

### 3. Human Eval (`--mode human`)

Generates a Markdown evaluation form pre-populated with AI outputs. A human rater fills in scores and comments.

**Output**: `human-eval-form-YYYY-MM-DD.md`

The form includes:
- Each AI output rendered as a blockquote
- Per-criterion scoring tables (aligned with LLM-as-Judge rubrics)
- Overall verdict section with weighted scoring
- Space for hallucination incident reports

**Best for**: Final quality sign-off, assessor review, portfolio evidence.

## Test Fixtures

All test cases live in `fixtures.js` — 30+ scenarios covering:

- **12 categorization emails** across 6 categories
- **2 summarization tasks** (single email + thread)
- **4 RAG chat scenarios** including a "no context" honesty test
- **2 compose drafts** with different tones
- **1 reply draft** with thread context
- **1 newsletter dedup** with 2 newsletters and known duplicate stories

## Output Files

| File | Mode | Contents |
|------|------|----------|
| `eval-report.json` | unit | Scores, accuracy, latency per suite |
| `eval-report-judge.json` | judge | Per-criterion scores with justifications |
| `human-eval-form-*.md` | human | Pre-populated scoring form |

## Grading Scale

| Grade | Score | Meaning |
|-------|-------|---------|
| **A** | ≥85% | Production-ready quality |
| **B** | ≥70% | Good with minor issues |
| **C** | ≥55% | Acceptable but needs improvement |
| **F** | <55% or critical failures | Significant quality issues |

> **Critical failures** (hallucinations, honesty violations) automatically result in grade **F** for the RAG Chat Agent suite, regardless of other scores.
