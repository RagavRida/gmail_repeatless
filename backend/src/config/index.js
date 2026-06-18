import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  // Google OAuth2
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3001}/api/auth/google/callback`,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  },

  // Gemini AI
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    chatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    embeddingDimensions: 768,
  },

  // NVIDIA NIM
  nim: {
    apiKey: process.env.NVIDIA_NIM_API_KEY,
    baseUrl: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-8b-instruct',
  },

  // Security
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',

  // Frontend
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};

// Category definitions shared across services
export const CATEGORIES = [
  'newsletter',
  'job_recruitment',
  'finance',
  'notifications',
  'personal',
  'work_professional',
  'uncategorized',
];

// Maps internal DB categories to frontend display names
export const CATEGORY_DISPLAY_MAP = {
  newsletter: 'Newsletter',
  job_recruitment: 'Job',
  finance: 'Finance',
  notifications: 'Notification',
  personal: 'Personal',
  work_professional: 'Work',
  uncategorized: 'Uncategorized',
};

// Reverse map: frontend display name → DB category
export const CATEGORY_DB_MAP = Object.fromEntries(
  Object.entries(CATEGORY_DISPLAY_MAP).map(([k, v]) => [v, k])
);

export function validateConfig() {
  const required = [
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabase.serviceRoleKey],
    ['GOOGLE_CLIENT_ID', config.google.clientId],
    ['GOOGLE_CLIENT_SECRET', config.google.clientSecret],
    ['GEMINI_API_KEY', config.gemini.apiKey],
    ['TOKEN_ENCRYPTION_KEY', config.tokenEncryptionKey],
  ];

  const missing = required.filter(([, val]) => !val).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}
