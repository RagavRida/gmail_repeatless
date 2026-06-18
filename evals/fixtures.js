/**
 * Test fixtures: realistic email data for LLM evaluation.
 * Based on the dummy data in the frontend but structured for eval assertions.
 */

export const CATEGORIZATION_FIXTURES = [
  {
    id: 'cat-1',
    subject: '[Urgent] API Overages & Q3 Scaling Plan',
    from: 'Antony <antony@supabase.io>',
    snippet: 'Your Supabase project "database-prod-x" has exceeded its free-tier CPU allocation by 240%. Storage is at 1.2 GB of 500 MB...',
    expectedCategory: 'work_professional',
    tags: ['billing', 'infrastructure'],
  },
  {
    id: 'cat-2',
    subject: 'Update on your application - Senior Staff Product Designer',
    from: 'Julie Vance <stripe-design@stripe.com>',
    snippet: 'Thank you for your interest in the Senior Staff Product Designer role at Stripe. After careful consideration...',
    expectedCategory: 'job_recruitment',
    tags: ['application', 'rejection'],
  },
  {
    id: 'cat-3',
    subject: 'Re: Cabin trip next month?',
    from: 'Sarah Jenkins <sarah@homemail.com>',
    snippet: 'Hey! Firmed up dates: July 3-5. Found a great listing in Mendocino. Would be ~$120/person if we can get 7 people...',
    expectedCategory: 'personal',
    tags: ['travel', 'plans'],
  },
  {
    id: 'cat-4',
    subject: 'Import AI #354: The Frontier of Autonomous Agents',
    from: 'Jack Clark <jack@importai.news>',
    snippet: 'This week: OpenAI Sora goes API-first. Anthropic ships tool use for Claude. Meta releases Llama 3.1...',
    expectedCategory: 'newsletter',
    tags: ['ai', 'tech-news'],
  },
  {
    id: 'cat-5',
    subject: 'AWS Invoice Available - May 2026',
    from: 'AWS Billing <billing@amazon.com>',
    snippet: 'Your total for May 2026 is $412.80. Services: EC2 $280.50, S3 $45.20, RDS $87.10...',
    expectedCategory: 'finance',
    tags: ['invoice', 'cloud'],
  },
  {
    id: 'cat-6',
    subject: 'Security Alert: Axios CVE-2026-1182',
    from: 'GitHub <noreply@github.com>',
    snippet: 'A critical vulnerability has been found in axios versions < 1.8.0. Your repository "api-gateway" is affected...',
    expectedCategory: 'notifications',
    tags: ['security', 'vulnerability'],
  },
  {
    id: 'cat-7',
    subject: "TLDR Tech: Apple's M4 Neural Engine, Google's Gemma 3",
    from: 'TLDR Web Dev <tldr@tldr.tech>',
    snippet: "Today's top stories: Apple announces M4 with 38-core Neural Engine, Google open-sources Gemma 3...",
    expectedCategory: 'newsletter',
    tags: ['tech-news', 'hardware'],
  },
  {
    id: 'cat-8',
    subject: 'Weekly Engineering Sprint Summary',
    from: 'Mira Kurosawa <mira@devteam.io>',
    snippet: 'Sprint 42 complete. 14 of 18 story points delivered. Blockers: API gateway latency, TypeScript migration...',
    expectedCategory: 'work_professional',
    tags: ['sprint', 'team'],
  },
  {
    id: 'cat-9',
    subject: 'Your OTP for login: 847291',
    from: 'no-reply@auth.service.com',
    snippet: 'Your one-time password is 847291. This code expires in 10 minutes. Do not share this code.',
    expectedCategory: 'notifications',
    tags: ['otp', 'auth'],
  },
  {
    id: 'cat-10',
    subject: 'Interview Invitation - AI Research Engineer at DeepMind',
    from: 'DeepMind Recruiting <careers@deepmind.com>',
    snippet: 'We were impressed by your background and would like to invite you for a technical interview...',
    expectedCategory: 'job_recruitment',
    tags: ['interview', 'invite'],
  },
  {
    id: 'cat-11',
    subject: 'Payment Received - Invoice #INV-2026-0542',
    from: 'Stripe Billing <billing@stripe.com>',
    snippet: 'Payment of $299.00 received for Invoice #INV-2026-0542. Thank you for your payment.',
    expectedCategory: 'finance',
    tags: ['payment', 'receipt'],
  },
  {
    id: 'cat-12',
    subject: 'Hey, are you free for coffee Saturday?',
    from: 'David Chen <david.chen@gmail.com>',
    snippet: 'Haven\'t caught up in ages! I\'ll be near your area Saturday afternoon. Want to grab coffee at Blue Bottle?',
    expectedCategory: 'personal',
    tags: ['social', 'meetup'],
  },
];

export const SUMMARIZATION_FIXTURES = [
  {
    id: 'sum-1',
    subject: '[Urgent] API Overages & Q3 Scaling Plan',
    from: 'Antony <antony@supabase.io>',
    body: `Hi there,

Your Supabase project "database-prod-x" has exceeded its free-tier CPU allocation by 240%. Your storage is at 1.2 GB of the 500 MB limit.

We've applied a temporary grace period until Friday (June 19) to give you time to either:
1. Clean up unused data and optimize queries
2. Upgrade to the Pro plan ($25/month)

After Friday, if no action is taken, we will need to throttle your API responses. Your current monthly API call volume is 2.1M requests.

I'd recommend reviewing your database log tables — they're typically the biggest storage consumers. The Pro plan includes 8 GB storage and dedicated CPU.

Best regards,
Antony
Supabase Support`,
    mustContain: ['240%', 'friday', 'pro plan'],
    mustNotContain: ['happy', 'congratulations'],
    maxSentences: 4,
  },
  {
    id: 'sum-thread-1',
    subject: 'Re: Cabin trip next month?',
    isThread: true,
    messages: [
      {
        from: 'Sarah Jenkins',
        date: '2026-06-10',
        body: 'Hey everyone! Who\'s down for a summer cabin trip? I was thinking first weekend of July.'
      },
      {
        from: 'Mike Rodriguez',
        date: '2026-06-11',
        body: 'I\'m in! July 3-5 works for me. Any location preferences?'
      },
      {
        from: 'Sarah Jenkins',
        date: '2026-06-13',
        body: 'Great! Firmed up dates: July 3-5. Found a great listing in Mendocino. Would be ~$120/person if we can get 7 people. Need confirmations by Thursday to lock in the booking!'
      },
    ],
    mustContain: ['july 3-5', 'mendocino', '$120', 'thursday'],
    maxSentences: 5,
  },
];

export const CHAT_RAG_FIXTURES = [
  {
    id: 'rag-1',
    question: 'What are my Supabase overages?',
    contextEmails: [
      {
        subject: '[Urgent] API Overages & Q3 Scaling Plan',
        from: 'Antony <antony@supabase.io>',
        body: 'Your Supabase project "database-prod-x" has exceeded its free-tier CPU allocation by 240%. Storage is at 1.2 GB of 500 MB. Grace period until Friday.',
        date: '2026-06-16',
      },
    ],
    mustContain: ['240%', 'cpu', 'storage'],
    mustNotHallucinate: ['$500 bill', 'account suspended', 'data deleted'],
    mustCiteSources: true,
  },
  {
    id: 'rag-2',
    question: 'Which companies rejected my job application?',
    contextEmails: [
      {
        subject: 'Update on your application - Senior Staff Product Designer',
        from: 'Julie Vance <stripe-design@stripe.com>',
        body: 'After careful consideration, we have decided to move forward with other candidates whose experience more closely aligns with our current checkout flow focus.',
        date: '2026-06-15',
      },
    ],
    mustContain: ['stripe'],
    mustNotHallucinate: ['google rejected', 'apple rejected', 'three companies'],
    mustCiteSources: true,
  },
  {
    id: 'rag-3',
    question: 'What is the schedule of my cabin trip?',
    contextEmails: [
      {
        subject: 'Re: Cabin trip next month?',
        from: 'Sarah Jenkins <sarah@homemail.com>',
        body: 'Firmed up dates: July 3-5. Found a great listing in Mendocino. Would be ~$120/person if we can get 7 people. Need confirmations by Thursday.',
        date: '2026-06-13',
      },
    ],
    mustContain: ['july 3-5', 'mendocino'],
    mustNotHallucinate: ['august', 'lake tahoe', '$500'],
    mustCiteSources: true,
  },
  {
    id: 'rag-no-context',
    question: 'What are the latest updates about quantum computing?',
    contextEmails: [],
    shouldAdmitNoInfo: true,
    mustNotHallucinate: ['IBM announced', 'Google achieved', 'latest research shows'],
  },
];

export const COMPOSE_FIXTURES = [
  {
    id: 'compose-1',
    prompt: 'Write a follow-up to the product team about the Q3 launch delay',
    tone: 'Professional',
    mustContain: ['q3', 'launch', 'delay'],
    mustNotContain: ['yo', 'dude', 'lol'],
    minWords: 30,
    maxWords: 300,
  },
  {
    id: 'compose-2',
    prompt: 'Ask my friend if they want to grab lunch this weekend',
    tone: 'Friendly',
    mustContain: ['lunch', 'weekend'],
    mustNotContain: ['sincerely', 'regarding', 'per our discussion'],
    minWords: 15,
    maxWords: 150,
  },
];

export const REPLY_FIXTURES = [
  {
    id: 'reply-1',
    prompt: 'Ask Antony to clarify the billing grace period and upgrade instructions',
    tone: 'Professional',
    threadMessages: [
      {
        from_address: 'Antony <antony@supabase.io>',
        internal_date: '2026-06-16',
        body_text: 'Your Supabase project has exceeded its free-tier CPU allocation by 240%. Storage is at 1.2 GB. Grace period until Friday. Recommend upgrading to Pro plan.',
      },
    ],
    mustContain: ['grace period', 'upgrade'],
    mustBeContextual: true, // Reply should reference the original message content
  },
];

export const NEWSLETTER_DEDUP_FIXTURES = [
  {
    id: 'dedup-1',
    newsletters: [
      {
        subject: 'Import AI #354: The Frontier of Autonomous Agents',
        from: 'Jack Clark <jack@importai.news>',
        body: `This week's highlights:

1. OpenAI Sora API Access Rolling Out
OpenAI is beginning to roll out programmatic API access for Sora, its video generation model. Enterprise customers get first access, with broader availability expected Q3.

2. Anthropic Ships Tool Use for Claude
Claude can now use external tools and APIs natively, competing directly with GPT-4's function calling capabilities.

3. Meta Releases Llama 3.1 405B
Meta's largest open model yet, with 405B parameters, shows competitive performance on reasoning benchmarks.`,
      },
      {
        subject: "TLDR Tech: OpenAI Sora Goes API, Apple M4 Details",
        from: 'TLDR <tldr@tldr.tech>',
        body: `Top Stories:

OpenAI Sora Video API Now Available for Enterprise
OpenAI announced enterprise API access for Sora. The video generation model can now be integrated into applications programmatically.

Apple M4 Neural Engine Details Revealed
Apple's M4 chip includes a 38-core Neural Engine capable of 38 TOPS. Designed for on-device AI inference.

Meta Open-Sources Llama 3.1
Meta released Llama 3.1 in three sizes (8B, 70B, 405B). The 405B model competes with proprietary models on benchmarks.`,
      },
    ],
    expectedDuplicatePairs: [
      ['OpenAI Sora', 'OpenAI Sora'],
      ['Llama 3.1', 'Llama 3.1'],
    ],
    expectedUniqueStories: ['Apple M4', 'Anthropic', 'Claude'],
  },
];
