import { Email, ChatSession, NewsletterItem } from './types';

export const DUMMY_EMAILS: Email[] = [
  {
    id: 'email-1',
    sender: 'Stripe Careers',
    senderEmail: 'hr@stripe.com',
    subject: 'Update on your application - Senior Staff Product Designer',
    snippet: 'Thank you for your patience during our interview process. We have an update...',
    time: 'Jun 15, 2026',
    category: 'Job',
    aiSummary: 'Application for Senior Staff Product Designer was rejected after review, citing closer experience matches.',
    threadSummary: 'This thread details your application for Senior Staff Product Designer. After initial submission, the recruiter (hr@stripe.com) indicated review was in progress, followed by a final decision from the Design Hiring Manager stating they chose other candidates whose profiles matched more closely.',
    read: true,
    thread: [
      {
        id: 'msg-1-1',
        sender: 'Stripe Careers',
        senderEmail: 'hr@stripe.com',
        time: 'Jun 10, 2026, 10:15 AM',
        body: 'Hi Developer,\n\nThank you for applying to the Senior Staff Product Designer position at Stripe! We have received your portfolio and resume package.\n\nOur team is currently reviewing your materials, and we will update you on the next technical screening steps as soon as possible. Feel free to reply with any updated links.\n\nBest,\nStripe Talent Acquisition Team'
      },
      {
        id: 'msg-1-2',
        sender: 'You',
        senderEmail: 'user@gmail.com',
        time: 'Jun 10, 2026, 11:30 AM',
        body: 'Hi Stripe Team,\n\nThanks for the speedy confirmation! Let me know if you need any additional design specs, prototypes, or case studies from my previous systems work at Acme Corp.\n\nBest regards,\nDeveloper'
      },
      {
        id: 'msg-1-3',
        sender: 'Julie Vance (Design Recruiter)',
        senderEmail: 'stripe-design@stripe.com',
        time: 'Jun 15, 2026, 3:45 PM',
        body: 'Hi Developer,\n\nWe appreciate the opportunity to review your materials and learn more about your impressive background in designing AI-powered interactions.\n\nUnfortunately, our hiring team has decided not to move forward with your candidate profile at this time. Although your work is exceptionally high quality, we have opted to prioritize candidates who have deeper expertise in specialized high-frequency merchant checkout flows.\n\nWe will keep your resume on file for future design-leadership opportunities. Thank you again, and we wish you the best in your search.\n\nBest,\nJulie Vance'
      }
    ]
  },
  {
    id: 'email-2',
    sender: 'Supabase Billing',
    senderEmail: 'billing@supabase.io',
    subject: '[Urgent] API Overages & Q3 Scaling Plan - Supabase Support',
    snippet: 'Your developer project is currently exceeding the free tier plan limits by 240%...',
    time: 'Jun 16, 2026',
    category: 'Work',
    aiSummary: 'Project database-prod-x is exceeding free limits by 240%; granted a 72-hour grace period to upgrade to Pro.',
    threadSummary: 'Supabase Support warned of a database-prod-x overage (240% CPU/storage limit). You requested a delay due to Q3 marketing campaign end. Support Manager Antony granted a 72-hour grace period until Friday to upgrade to the Pro tier pay-as-you-go program before limits are hard-enforced.',
    read: false,
    thread: [
      {
        id: 'msg-2-1',
        sender: 'Supabase Billing Engine',
        senderEmail: 'billing@supabase.io',
        time: 'Jun 16, 2026, 8:00 AM',
        body: 'ALERT: Your database instance `database-prod-x` has exceeded free usage limits.\n\n- Free Database Size: 500MB max | Current: 1.2GB (240%)\n- Free Egress: 2GB max | Current: 4.8GB (240%)\n\nPlease upgrade to a Pro tier plan ($25/mo + usages) within 24 hours to avoid database consolidation or read-only lock constraints.'
      },
      {
        id: 'msg-2-2',
        sender: 'You',
        senderEmail: 'user@gmail.com',
        time: 'Jun 16, 2026, 9:15 AM',
        body: 'Hi Supabase Support,\n\nOur startup is in the middle of a major product launch that concludes on Thursday. Is it possible to request an temporary extension on the quota limit before we complete our upgrade? We plan to optimize tables and delete logs Friday morning.\n\nThank you!'
      },
      {
        id: 'msg-2-3',
        sender: 'Antony (Support Manager)',
        senderEmail: 'antony@supabase.io',
        time: 'Jun 16, 2026, 11:20 AM',
        body: 'Hi Developer,\n\nUnderstood. Launches are stressful and we certainly want to support you. I have added a manual whitelist override on project `database-prod-x` for an additional 72 hours.\n\nThis extension runs until Friday morning (Jun 19). Please ensure you have either downsized tables or upgraded to the Pro subscription by then so normal billing processes do not impact your live traffic.\n\nBest of luck with the launch!\n\nAntony'
      }
    ]
  },
  {
    id: 'email-3',
    sender: 'Import AI Newsletter',
    senderEmail: 'jack@importai.news',
    subject: "Import AI #354: Google's new visual model, OpenAI's Sora, and the limits of scaling",
    snippet: "Welcome to Import AI. This week: 1) Google releases Gemini 2.0 Flash reasoning... 2) OpenAI's Sora API is opening...",
    time: 'Jun 16, 2026',
    category: 'Newsletter',
    aiSummary: 'Covers Google Gemini 2.0 reasoning capabilities, OpenAI Sora API public rollouts, and multi-state attention analysis.',
    threadSummary: 'The weekly newsletter summary from Jack Clark covering Google Gemini updates, OpenAI developers expanding Sora API access for US-based enterprise clients, and research into Transformers executing complex logic trees.',
    read: true,
    thread: [
      {
        id: 'msg-3-1',
        sender: 'Jack Clark',
        senderEmail: 'jack@importai.news',
        time: 'Jun 16, 2026, 6:00 AM',
        body: 'Welcome to Import AI #354.\n\nIn this issue:\n- Google releases Gemini 2.0 Flash thinking capabilities highlighting robust, explicit multi-step plans before responding.\n- OpenAI rolls out the Sora Video Developer API to selected enterprise companies. Compute limits remain a hot debate as video models require massive cluster coordinates.\n- A Stanford paper explores inner transformer layers as multi-state trees, demonstrating how deep models calculate custom conditional routines.\n\nThanks for reading!'
      }
    ]
  },
  {
    id: 'email-4',
    sender: 'Stripe Merchant Fees',
    senderEmail: 'disputes@stripe.com',
    subject: 'Stripe Billing Dispute Alert: Chargeback ID ch_82134',
    snippet: 'A dispute has been opened by a cardholder of Chase Card Services for charge ID ch_82134 in the amount of $189.00...',
    time: 'Jun 14, 2026',
    category: 'Finance',
    aiSummary: 'Dispute opened for ch_82134 ($189.00) by Chase cardholder under "Unrecognized Transaction". Action required by Jun 25.',
    threadSummary: 'A dispute was initiated by a cardholder on Stripe for transaction ch_82134. Charge amount is $189.00. The claim class is "Unrecognized Transaction". You must upload shipping logs and system tokens to Stripe Disputes Dashboard before Jun 25 to protect your account standing.',
    read: false,
    thread: [
      {
        id: 'msg-4-1',
        sender: 'Stripe Disputes',
        senderEmail: 'disputes@stripe.com',
        time: 'Jun 14, 2026, 2:10 AM',
        body: 'A customer has disputed a charge of $189.00. Payment ID: ch_82134. Chase Card Services reported: Reason - Unrecognized.\n\nYou must provide proof of delivery, system access logs, or confirmation emails to dispute this. Deadline to submit evidence is June 25, 2026 at 11:59 PM UTC.'
      }
    ]
  },
  {
    id: 'email-5',
    sender: 'AWS Billing',
    senderEmail: 'billing@amazon.com',
    subject: 'AWS Invoice - May 2026 ($412.80)',
    snippet: 'Your invoice for Amazon Web Services is now ready. The balance due of $412.80 will be automatically charged...',
    time: 'Jun 14, 2026',
    category: 'Finance',
    aiSummary: 'AWS bill for May is $412.80, scheduled to be automatic charge on Mastercard ending in 8021.',
    threadSummary: 'AWS monthly notification specifying standard EC2 and S3 scale charges for May, totaling $412.80. Payment is scheduled for automatic draw from user primary payment credential on Jun 18, 2026.',
    read: true,
    thread: [
      {
        id: 'msg-5-1',
        sender: 'AWS Billing Engine',
        senderEmail: 'billing@amazon.com',
        time: 'Jun 14, 2026, 4:00 AM',
        body: 'Dear AWS Customer, your invoice for May 2026 is available.\n\nTotal Due: $412.80.\nAccount: 4892-1209-3312\n\n- Elastic Compute Cloud (EC2): $290.40\n- Simple Storage Service (S3): $90.20\n- Relational Database Service (RDS): $32.20\n\nThis will be automated to card Ending 8021 on Jun 18.'
      }
    ]
  },
  {
    id: 'email-6',
    sender: 'TLDR Web Dev',
    senderEmail: 'tldr@tldr.tech',
    subject: "TLDR Tech: Apple's M4 Ultra, NVIDIA's Blackwell timeline, and dev setups",
    snippet: 'Apple is finalizing the M4 Ultra platform, promising 42 cores of design efficiency. Blackwell has completed silicon tests...',
    time: 'Jun 15, 2026',
    category: 'Newsletter',
    aiSummary: 'NVIDIA completed Blackwell silicon tests; Apple testing high-core M4 chips for workstation launches.',
    threadSummary: 'Weekly tech roundup cover of high-performance developer setups, Silicon packaging thermal tests, and software integrations.',
    read: true,
    thread: [
      {
        id: 'msg-6-1',
        sender: 'Dan Ni (TLDR Tech)',
        senderEmail: 'tldr@tldr.tech',
        time: 'Jun 15, 2026, 5:30 AM',
        body: 'TLDR Tech Newsletter for Jun 15:\n- Apple silicon details emerge for M4 Ultra with rumored double unified bandwidth specs.\n- NVIDIA Blackwell thermal expansion tape-out issue solved with TSMC planning production expansion.\n- GitHub Copilot expands terminal completions with specialized Unix context filters.'
      }
    ]
  },
  {
    id: 'email-7',
    sender: 'Sarah Jenkins',
    senderEmail: 'sarah@homemail.com',
    subject: 'Re: Cabin trip next month?',
    snippet: 'Are people still free the first weekend of July? I need to finalize the rental deposit by Thursday afternoon...',
    time: 'Jun 13, 2026',
    category: 'Personal',
    aiSummary: 'Sarah needs confirmation for the July cabin rental deposit by Thursday. Dates: July 3-5.',
    threadSummary: 'Personal thread regarding a summer group cabin reservation. Sarah is asking everyone to lock in July 3-5 dates and cost division ($120/person) before she commits to the Airbnb host payment by June 20th.',
    read: false,
    thread: [
      {
        id: 'msg-7-1',
        sender: 'Sarah Jenkins',
        senderEmail: 'sarah@homemail.com',
        time: 'Jun 13, 2026, 7:15 PM',
        body: 'Hey guys! Super excited about the cabin trip. I found an awesome modern spot in Mendocino details: July 3-5 (3 days, 2 nights). Total is $840, split 7 ways is $120. Can we confirm our free slot by Thursday so I don\'t lose the lease slot?'
      }
    ]
  },
  {
    id: 'email-8',
    sender: 'Grammarly',
    senderEmail: 'happybirthday@grammarly.com',
    subject: 'Happy Birthday! 🎈',
    snippet: 'To celebrate our birthday together, here is a 40% discount on Grammarly Premium for the next 12 months...',
    time: 'Jun 12, 2026',
    category: 'Personal',
    aiSummary: 'Grammarly congratulates you and offers a 40% coupon code for premium subscription renewal.',
    threadSummary: 'Promo mail celebrating birthday with a specialized 40% discount voucher active until next week.',
    read: true,
    thread: [
      {
        id: 'msg-8-1',
        sender: 'Grammarly Team',
        senderEmail: 'happybirthday@grammarly.com',
        time: 'Jun 12, 2026, 9:00 AM',
        body: 'Warm birthday wishes from Grammarly! \n\nWe love supporting your writing journey. Use code BIRTHDAY40 at checkout to slash 40% off the standard Grammarly Pro pricing. Stay expressive!'
      }
    ]
  },
  {
    id: 'email-9',
    sender: 'GitHub Security',
    senderEmail: 'alerts@github.com',
    subject: 'GitHub Alert: Security vulnerability found in your package.json dependencies',
    snippet: 'Dependency high-severity warning: `axios` vulnerability (CVE-2026-1182) can cause remote crash...',
    time: 'Jun 16, 2026',
    category: 'Notification',
    aiSummary: 'Vulnerability (CVE-2026-1182) reported in Axios dependency. Recommends upgrade to v1.7.4+',
    threadSummary: 'Automated GitHub Dependabot advisory detailing a severe memory recursion bug in Axios. Affects package.json of your core production app. Fix is upgrading the package file lock reference.',
    read: false,
    thread: [
      {
        id: 'msg-9-1',
        sender: 'GitHub Dependabot',
        senderEmail: 'alerts@github.com',
        time: 'Jun 16, 2026, 12:45 AM',
        body: 'Dependabot Alert: \n\nAxios versions < 1.7.3 contain a vulnerable request loop handler (CVE-2026-1182). This can easily trigger high thread CPU spikes during server processing.\n\nRequired Action: Update package.json dependency to "axios": "^1.7.4" or deploy yarn-lock patch files immediately.'
      }
    ]
  },
  {
    id: 'email-10',
    sender: 'Vercel Deployment',
    senderEmail: 'deployments@vercel.com',
    subject: 'Vercel: Deployment failed for repository `ai-gmail-hub`',
    snippet: 'Production deployment failed in build task of `ai-gmail-hub` due to a typescript definition error...',
    time: 'Jun 15, 2026',
    category: 'Notification',
    aiSummary: 'Typescript type validation failed in `src/types.ts` line 12 during production deploy compilation.',
    threadSummary: 'Deploy cycle exception triggered because of a mismatching interface export statement. Reverts dashboard static assets to previous working state.',
    read: true,
    thread: [
      {
        id: 'msg-10-1',
        sender: 'Vercel System',
        senderEmail: 'deployments@vercel.com',
        time: 'Jun 15, 2026, 11:30 PM',
        body: 'Repository: `ai-gmail-hub` | Branch: main\nCommit: [fa8912] Add category integrations\nState: FAILED\n\nBuild Log Output:\nTypeScript error in /vercel/path/src/types.ts(12,15):\nType "Category" is defined but target implementation properties are missing. Check imports and rerun main build step.'
      }
    ]
  },
  {
    id: 'email-11',
    sender: 'Alex Rivera (Staff Eng)',
    senderEmail: 'alex@startupcorp.com',
    subject: 'Weekly Engineering Sync: Agenda & Action Items',
    snippet: 'Please view and edit the shared outline for tomorrow\'s meeting. Key topics: Database pricing upgrades...',
    time: 'Jun 16, 2026',
    category: 'Work',
    aiSummary: 'Alex shared the engineering sync agenda including Supabase upgrade discussion. Tomorrow’s draft is attached.',
    threadSummary: 'Regular work sync preparation. Focus areas involve resolving database quotas on Supabase, final checks for the Vercel deploy block, and scheduling developer time allocations.',
    read: true,
    thread: [
      {
        id: 'msg-11-1',
        sender: 'Alex Rivera',
        senderEmail: 'alex@startupcorp.com',
        time: 'Jun 16, 2026, 4:10 PM',
        body: 'Hey Team,\n\nFor tomorrow\'s 10:00 AM engineering sync, here are the major blocks:\n1. Infrastructure limits: We need to upgrade Supabase (Developer, please share the support grace period update!).\n2. Vercel typescript errors.\n3. Q3 project checklist.\n\nPlease comment on the Notion page before standup.\n\nBest,\nAlex'
      }
    ]
  },
  {
    id: 'email-12',
    sender: 'LinkedIn Intelligence',
    senderEmail: 'alerts@linkedin.com',
    subject: 'LinkedIn Jobs: 14 new Senior AI Engineer roles matching your search',
    snippet: 'Tesla, Anthropic, and Scale AI have posted jobs matching your profile. Easy Apply active on 4 posts...',
    time: 'Jun 11, 2026',
    category: 'Job',
    aiSummary: 'LinkedIn recommends 14 new positions matching Senior AI Engineer at Tesla, Anthropic, and Scale AI.',
    threadSummary: 'Automated LinkedIn recruitment feed highlighting hiring loops matching technical query targets.',
    read: true,
    thread: [
      {
        id: 'msg-12-1',
        sender: 'LinkedIn Recruitment',
        senderEmail: 'alerts@linkedin.com',
        time: 'Jun 11, 2026, 12:00 PM',
        body: 'Hi Developer,\n\nWe found 14 new roles that align with your search criteria for "Senior AI Engineer":\n\n- Anthropic (San Francisco - Hybrid): AI Alignment Engineer\n- Tesla (Palo Alto - Onsite): Autopilot Data Scientist\n- Scale AI (San Francisco - Onsite): Tech Lead, LLM Evaluation\n\nReview the details on LinkedIn and tap "Easy Apply" where applicable.'
      }
    ]
  }
];

export const DUMMY_CHAT_HISTORY: ChatSession[] = [
  {
    id: 'chat-1',
    title: 'Job applications & Stripe feedback',
    messages: [
      {
        id: 'c1-m1',
        role: 'user',
        content: 'Summarize my current job applications and what our status is.',
        time: 'Jun 16, 2026, 10:15 AM'
      },
      {
        id: 'c1-m2',
        role: 'assistant',
        content: `Based on your emails, you have one active application status:

• **Stripe**: Unfortunately, corporate decided not to move forward with your profile for the **Senior Staff Product Designer** role. They sent a formal notification on Jun 15, citing that their current roadmap prioritizes deep specialization in high-frequency merchant checkout flows, though they praised your AI systems experience.

• **Recruitment Alerts**: You also received recommendations for **14 new Senior AI Engineer roles** at Tesla, Anthropic, and Scale AI via LinkedIn match queues. 

Would you like me to find additional AI designer roles or draft a professional follow-up response to the Stripe recruiting manager?`,
        time: 'Jun 16, 2026, 10:16 AM',
        citations: [
          {
            sender: 'Julie Vance (Design Recruiter)',
            senderEmail: 'stripe-design@stripe.com',
            subject: 'Update on your application - Senior Staff Product Designer',
            time: 'Jun 15'
          },
          {
            sender: 'LinkedIn Intelligence',
            senderEmail: 'alerts@linkedin.com',
            subject: 'LinkedIn Jobs: 14 new Senior AI Engineer roles matching your search',
            time: 'Jun 11'
          }
        ]
      }
    ]
  },
  {
    id: 'chat-2',
    title: 'Infrastructure overages & AWS costs',
    messages: [
      {
        id: 'c2-m1',
        role: 'user',
        content: 'Do I have any urgent server operations or billing issues I need to resolve today?',
        time: 'Jun 16, 2026, 11:35 AM'
      },
      {
        id: 'c2-m2',
        role: 'assistant',
        content: `Yes, you have two highly urgent items connected to your scaling infrastructure:

1. **Supabase Storage quota exceedance**: Your project \`database-prod-x\` is running **240% over free tier capacity**. Antony (Support Manager) granted a temporary **72-hour grace period** ending **Friday (Jun 19)** morning to upgrade to the pay-as-you-go Pro plan ($25/mo) before any limits are strictly put in place. 
2. **AWS May Invoice ($412.80)**: EC2 host charges ($290.40) and S3 storage bills ($90.20) are due, scheduled for auto-charge on Jun 18 from Mastercard #8021.

I suggest reviewing the Supabase table logs first or upgrading to the Pro plan immediately. Would you like me to draft an update regarding these limits for your weekly core sync tomorrow?`,
        time: 'Jun 16, 2026, 11:36 AM',
        citations: [
          {
            sender: 'Antony (Support Manager)',
            senderEmail: 'antony@supabase.io',
            subject: '[Urgent] API Overages & Q3 Scaling Plan - Supabase Support',
            time: 'Jun 16'
          },
          {
            sender: 'AWS Billing',
            senderEmail: 'billing@amazon.com',
            subject: 'AWS Invoice - May 2026 ($412.80)',
            time: 'Jun 14'
          }
        ]
      }
    ]
  },
  {
    id: 'chat-3',
    title: 'Sora video news analysis',
    messages: [
      {
        id: 'c3-m1',
        role: 'user',
        content: "Synthesize knowledge across newsletters about OpenAI's Sora and video generation.",
        time: 'Jun 16, 2026, 2:10 PM'
      },
      {
        id: 'c3-m2',
        role: 'assistant',
        content: `According to recent articles from your tech subscriptions, here is a synthesis of the landscape for generative video models:

• **Sora Developer API Rollouts**: OpenAI has released its Sora API to specialized enterprise clients in the US. This aims to let studios generate rich, consistent B-rolls, although discussions continue around high compute footprints.
• **Competing Architecture**: Newsletters note that rival products like Runway Gen-3 and Luma Dream Machine have pushed prompt quality and temporal coherence to excellent benchmarks, offering intense competition to OpenAI.
• **Silicon Hardware Limits**: TSMC and NVIDIA Blackwell chip shipments scheduled for late Q4 are viewed as critical bottlenecks that will decide whether high-fidelity video processing costs will scale down.

Would you like safe pricing information or a comparison outline between the current API specs of video models?`,
        time: 'Jun 16, 2026, 2:11 PM',
        citations: [
          {
            sender: 'Import AI Newsletter',
            senderEmail: 'jack@importai.news',
            subject: "Import AI #354: Google's new visual model, OpenAI's Sora, and the limits of scaling",
            time: 'Jun 16'
          },
          {
            sender: 'TLDR Web Dev',
            senderEmail: 'tldr@tldr.tech',
            subject: "TLDR Tech: Apple's M4 Ultra, NVIDIA's Blackwell timeline, and dev setups",
            time: 'Jun 15'
          }
        ]
      }
    ]
  },
  {
    id: 'chat-4',
    title: 'Sarah cabin trip dates',
    messages: [
      {
        id: 'c4-m1',
        role: 'user',
        content: "Who is following up on next month's cabin trip?",
        time: 'Jun 16, 2026, 3:00 PM'
      },
      {
        id: 'c4-m2',
        role: 'assistant',
        content: `Your friend **Sarah Jenkins** is coordinating the trip in an email thread from Jun 13. 

Here are the key aspects of her proposal:
• **Dates**: July 3-5 (3 days, 2 nights).
• **Location**: A modern spot she found in Mendocino.
• **Budget**: Total cost is $840 ($120 split among 7 friends).
• **Deadline**: She needs confirmation by **this Thursday** so she can make the reservation deposit.

Currently, no confirmations are registered in the thread. Let me know if you would like me to draft a quick reply to Sarah confirming your interest and verifying split payments on Venmo!`,
        time: 'Jun 16, 2026, 3:01 PM',
        citations: [
          {
            sender: 'Sarah Jenkins',
            senderEmail: 'sarah@homemail.com',
            subject: 'Re: Cabin trip next month?',
            time: 'Jun 13'
          }
        ]
      }
    ]
  }
];

export const DUMMY_NEWSLETTERS: NewsletterItem[] = [
  {
    id: 'news-1',
    headline: 'NVIDIA Blackwell chips entering mass production despite packaging redesign challenges',
    summary: 'NVIDIA has finalized a silicon-layer tape-out redesign to resolve thermal expansion issues, with TSMC ramping production to ship hundreds of thousands of Blackwell units in Q4.',
    sources: ['TLDR Tech', 'The Batch', 'Import AI'],
    deduplicatedCount: 3,
    isDeduplicated: true,
    category: 'Hardware'
  },
  {
    id: 'news-2',
    headline: 'Apple introduces LLM-powered assistant with local 3B model for macOS Sequoia',
    summary: "Apple's local-first on-device AI leverages heavy weight-quantizations, running low-latency email summaries, spelling checks, and priority alerts without sending personal data to the cloud.",
    sources: ['TLDR Tech', 'Import AI'],
    deduplicatedCount: 2,
    isDeduplicated: true,
    category: 'Consumer Tech'
  },
  {
    id: 'news-3',
    headline: 'Transformers are multi-state decision paths: New study details inside layers',
    summary: 'A landmark paper from Stanford analyses self-attention patterns, showing how deep transformer routing acts as structured decision forests evaluating complex syntactic conditions.',
    sources: ['The Batch'],
    deduplicatedCount: 1,
    isDeduplicated: false,
    category: 'Research'
  },
  {
    id: 'news-4',
    headline: 'Sora API goes public to US-based enterprise clients',
    summary: 'OpenAI has opened programmatic APIs for Sora to select large developers, enabling automatic generation and integration of consistent B-rolls into media production engines.',
    sources: ['Import AI'],
    deduplicatedCount: 1,
    isDeduplicated: false,
    category: 'Video Gen'
  },
  {
    id: 'news-5',
    headline: 'Claude 4 rumored to drop in late July with enhanced planning logic',
    summary: 'Reports indicate Anthropic is testing updated models trained on explicit tree-of-thought routing structures, designed for direct control over complex terminal bash tasks and system environments.',
    sources: ['TLDR Tech'],
    deduplicatedCount: 1,
    isDeduplicated: false,
    category: 'LLMs'
  }
];
