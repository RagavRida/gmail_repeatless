/**
 * LLM Guardrails Module
 * =====================
 * Multi-layer safety framework for all AI operations.
 *
 * Layers:
 * 1. INPUT GUARDRAILS   — Validate & sanitize user inputs before LLM
 * 2. OUTPUT GUARDRAILS  — Validate LLM responses before returning to user
 * 3. CONTENT SAFETY     — Detect harmful/toxic content
 * 4. PII PROTECTION     — Mask sensitive data from leaking
 * 5. GROUNDING CHECK    — Ensure responses are based on actual email context
 */
import { logger } from '../middleware/logger.js';

// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════

const MAX_INPUT_LENGTH = 2000;
const MAX_OUTPUT_LENGTH = 5000;

// Prompt injection patterns (case-insensitive)
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i,
  /forget\s+(all|everything|the|your)\s/i,  // "forget all of the things"
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+now\s+(a|an)\s+(?!email)/i,  // "you are now a hacker" but not "you are now an email assistant"
  /pretend\s+(to\s+be|you\s+are)\s/i,
  /system\s*:\s*/i,
  /\]\s*\[\s*system/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /bypass\s+(filter|safety|restriction|guardrail)/i,
  /override\s+(system|safety|your)\s/i,
  /act\s+as\s+(?!my\s+email|an?\s+email)/i,   // "act as root" but not "act as my email assistant"
  /reveal\s+(your|the|system)\s+(prompt|instruction)/i,
  /output\s+(your|the)\s+(system|initial)\s+prompt/i,
  /what\s+(are|is)\s+your\s+(system|initial)\s+(prompt|instruction)/i,
  /repeat\s+(your|the)\s+(system|initial)\s+(prompt|instruction)/i,
  /which\s+model\s+(is|are|was)\s+(used|being)/i,  // "which model is used to train you"
  /what\s+(LLM|model|AI)\s+(are\s+you|do\s+you\s+use|powers?\s+you)/i,
];

// Sensitive data patterns for PII detection
const PII_PATTERNS = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  password: /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi,
  api_key: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*\S+/gi,
  phone: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
};

// Topics the email assistant should NOT engage with
const OFF_TOPIC_PATTERNS = [
  /how\s+to\s+(hack|steal|break\s+into)/i,
  /write\s+(me\s+)?(a\s+)?(malware|virus|exploit|phishing)/i,
  /generate\s+(fake|forged)\s+(email|identity|document)/i,
  /help\s+me\s+(scam|fraud|deceive|impersonate)/i,
  /create\s+(a\s+)?deepfake/i,
];

// Hallucination/fabrication indicators in output
const HALLUCINATION_INDICATORS = [
  /as\s+an?\s+AI\s+(language\s+)?model/i,
  /I\s+don'?t\s+have\s+access\s+to\s+(the\s+)?internet/i,
  /I\s+cannot\s+browse/i,
  /my\s+training\s+data/i,
  /as\s+of\s+my\s+(last\s+)?knowledge\s+cutoff/i,
  /I\s+was\s+trained\s+on/i,
];

// ════════════════════════════════════════════════════════════════
// INPUT GUARDRAILS
// ════════════════════════════════════════════════════════════════

/**
 * Validate and sanitize user input before sending to any LLM.
 * @param {string} input - Raw user input
 * @param {'chat' | 'compose' | 'classify'} context - Which AI pipeline this is for
 * @returns {{ safe: boolean, sanitized: string, violations: string[] }}
 */
export function validateInput(input, context = 'chat') {
  const violations = [];

  // 1. Type and length check
  if (!input || typeof input !== 'string') {
    return { safe: false, sanitized: '', violations: ['EMPTY_INPUT'] };
  }

  let sanitized = input.trim();

  if (sanitized.length > MAX_INPUT_LENGTH) {
    sanitized = sanitized.substring(0, MAX_INPUT_LENGTH);
    violations.push('INPUT_TRUNCATED');
    logger.warn(`[Guardrails] Input truncated from ${input.length} to ${MAX_INPUT_LENGTH} chars`);
  }

  if (sanitized.length < 2) {
    return { safe: false, sanitized, violations: ['INPUT_TOO_SHORT'] };
  }

  // 2. Prompt injection detection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      violations.push('PROMPT_INJECTION_DETECTED');
      logger.warn(`[Guardrails] ⚠️ Prompt injection attempt detected: "${sanitized.substring(0, 100)}..."`);
      break; // One match is enough
    }
  }

  // 3. Off-topic / harmful request detection
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(sanitized)) {
      violations.push('OFF_TOPIC_HARMFUL');
      logger.warn(`[Guardrails] ⚠️ Off-topic/harmful request detected: "${sanitized.substring(0, 100)}..."`);
      break;
    }
  }

  // 4. PII in user input (warn but allow — user may be searching for their own data)
  if (context === 'compose') {
    // For compose, flag PII that might accidentally be sent in emails
    const piiFound = detectPII(sanitized);
    if (piiFound.length > 0) {
      violations.push(`PII_DETECTED:${piiFound.join(',')}`);
      logger.warn(`[Guardrails] PII detected in compose input: ${piiFound.join(', ')}`);
    }
  }

  // Determine if input is safe (block on injection and harmful, warn on PII)
  const blocked = violations.some(v =>
    v === 'PROMPT_INJECTION_DETECTED' || v === 'OFF_TOPIC_HARMFUL'
  );

  return { safe: !blocked, sanitized, violations };
}

// ════════════════════════════════════════════════════════════════
// OUTPUT GUARDRAILS
// ════════════════════════════════════════════════════════════════

/**
 * Validate LLM output before returning to user.
 * @param {string} output - Raw LLM response
 * @param {'chat' | 'compose' | 'classify' | 'summarize'} context
 * @param {object} opts - { contextBlocks?: Array } for grounding check
 * @returns {{ safe: boolean, filtered: string, violations: string[] }}
 */
export function validateOutput(output, context = 'chat', opts = {}) {
  const violations = [];

  if (!output || typeof output !== 'string') {
    return { safe: false, filtered: '', violations: ['EMPTY_OUTPUT'] };
  }

  let filtered = output.trim();

  // 1. Length check
  if (filtered.length > MAX_OUTPUT_LENGTH) {
    filtered = filtered.substring(0, MAX_OUTPUT_LENGTH) + '\n\n[Response truncated for safety]';
    violations.push('OUTPUT_TRUNCATED');
  }

  // 2. PII leakage detection — mask sensitive data in outputs
  const piiFound = detectPII(filtered);
  if (piiFound.length > 0) {
    filtered = maskPII(filtered);
    violations.push(`PII_MASKED:${piiFound.join(',')}`);
    logger.warn(`[Guardrails] PII masked in output: ${piiFound.join(', ')}`);
  }

  // 3. Hallucination indicators (model breaking character)
  for (const pattern of HALLUCINATION_INDICATORS) {
    if (pattern.test(filtered)) {
      violations.push('HALLUCINATION_INDICATOR');
      logger.warn(`[Guardrails] Model hallucination indicator detected in output`);
      break;
    }
  }

  // 4. Category validation (for classification outputs)
  if (context === 'classify') {
    const validCategories = [
      'newsletter', 'job_recruitment', 'finance',
      'notifications', 'personal', 'work_professional', 'uncategorized',
    ];
    const normalized = filtered.toLowerCase().trim();
    if (!validCategories.includes(normalized)) {
      violations.push('INVALID_CATEGORY');
      // Don't block — the normalizeCategory function handles this downstream
    }
  }

  // 5. Grounding check for chat responses
  if (context === 'chat' && opts.contextBlocks) {
    const groundingResult = checkGrounding(filtered, opts.contextBlocks);
    if (!groundingResult.grounded) {
      violations.push('POTENTIALLY_UNGROUNDED');
      logger.warn(`[Guardrails] Response may not be fully grounded in email context`);
    }
  }

  return { safe: true, filtered, violations }; // Output guardrails warn but rarely block
}

// ════════════════════════════════════════════════════════════════
// COMPOSE GUARDRAILS
// ════════════════════════════════════════════════════════════════

/**
 * Additional guardrails for AI-composed emails before they're sent.
 * @param {string} body - The email body to validate
 * @param {string} subject - The email subject
 * @returns {{ safe: boolean, violations: string[], warnings: string[] }}
 */
export function validateComposedEmail(body, subject) {
  const violations = [];
  const warnings = [];

  const combined = `${subject || ''} ${body || ''}`;

  // 1. Check for impersonation attempts
  const impersonationPatterns = [
    /this\s+is\s+(the\s+)?(CEO|president|director|manager)\s+of/i,
    /on\s+behalf\s+of\s+(?!myself)/i,
    /I\s+am\s+(?:your|the)\s+(boss|manager|supervisor)/i,
  ];
  for (const pattern of impersonationPatterns) {
    if (pattern.test(combined)) {
      warnings.push('POTENTIAL_IMPERSONATION');
      break;
    }
  }

  // 2. Check for social engineering language
  const socialEngPatterns = [
    /send\s+(?:me\s+)?(?:your\s+)?(?:password|credentials|social\s+security)/i,
    /wire\s+transfer|western\s+union|gift\s+card/i,
    /urgent.*(?:bank|account|password|verify)/i,
    /click\s+(?:this|here|the)\s+link\s+(?:to\s+)?(?:verify|confirm|update)/i,
  ];
  for (const pattern of socialEngPatterns) {
    if (pattern.test(combined)) {
      violations.push('SOCIAL_ENGINEERING');
      break;
    }
  }

  // 3. PII in outgoing email
  const piiFound = detectPII(combined);
  if (piiFound.length > 0) {
    warnings.push(`PII_IN_EMAIL:${piiFound.join(',')}`);
  }

  return {
    safe: violations.length === 0,
    violations,
    warnings,
  };
}

// ════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════

/**
 * Detect PII types present in text.
 * @returns {string[]} Array of PII type names found
 */
function detectPII(text) {
  const found = [];
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    if (pattern.test(text)) {
      found.push(type);
    }
    // Reset regex lastIndex (global flag)
    pattern.lastIndex = 0;
  }
  return found;
}

/**
 * Mask PII in text, replacing sensitive values with [REDACTED].
 */
function maskPII(text) {
  let masked = text;
  masked = masked.replace(PII_PATTERNS.ssn, '[SSN-REDACTED]');
  masked = masked.replace(PII_PATTERNS.credit_card, '[CARD-REDACTED]');
  masked = masked.replace(PII_PATTERNS.password, 'password: [REDACTED]');
  masked = masked.replace(PII_PATTERNS.api_key, 'api_key: [REDACTED]');
  // Don't mask phone numbers — they're common in email signatures
  return masked;
}

/**
 * Basic grounding check: verify the response references content from the context blocks.
 * Uses term overlap as a lightweight proxy for true grounding.
 */
function checkGrounding(response, contextBlocks) {
  if (!contextBlocks || contextBlocks.length === 0) {
    return { grounded: true }; // No context = nothing to ground against
  }

  // Extract key terms from context
  const contextText = contextBlocks
    .map(c => `${c.subject || ''} ${c.from_address || ''} ${(c.body_text || c.snippet || '').substring(0, 500)}`)
    .join(' ')
    .toLowerCase();

  // Extract meaningful words from response (>4 chars, not common words)
  const commonWords = new Set([
    'about', 'after', 'based', 'before', 'being', 'could', 'email', 'emails',
    'found', 'their', 'there', 'these', 'those', 'which', 'would', 'yours',
    'appears', 'contains', 'following', 'information', 'message', 'mentioned',
    'received', 'regarding', 'related', 'subject', 'thread', 'your',
  ]);

  const responseWords = response.toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 4 && !commonWords.has(w));

  if (responseWords.length === 0) return { grounded: true };

  // Check what fraction of response terms appear in context
  const grounded = responseWords.filter(w => contextText.includes(w));
  const ratio = grounded.length / responseWords.length;

  return {
    grounded: ratio > 0.15, // At least 15% of response terms should come from context
    ratio,
    totalTerms: responseWords.length,
    groundedTerms: grounded.length,
  };
}

/**
 * Get a safe refusal message for blocked inputs.
 */
export function getRefusalMessage(violations) {
  if (violations.includes('PROMPT_INJECTION_DETECTED')) {
    return "I'm designed to help you with your emails. I can search, summarize, categorize, or compose emails. Could you rephrase your request?";
  }
  if (violations.includes('OFF_TOPIC_HARMFUL')) {
    return "I'm an email assistant and can only help with email-related tasks like searching, summarizing, categorizing, or composing emails. How can I help you with your inbox?";
  }
  if (violations.includes('EMPTY_INPUT') || violations.includes('INPUT_TOO_SHORT')) {
    return "Please provide a bit more detail so I can help you. For example, try asking about specific emails, senders, or topics.";
  }
  return "I wasn't able to process that request. Could you try rephrasing it?";
}

// ════════════════════════════════════════════════════════════════
// AUDIT LOG
// ════════════════════════════════════════════════════════════════

/**
 * Log guardrail activity for auditing.
 */
export function logGuardrailEvent(event, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  logger.info(`[Guardrails] ${event}: ${JSON.stringify(details)}`);
  return entry;
}
