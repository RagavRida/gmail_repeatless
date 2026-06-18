export type EmailCategory = 'Newsletter' | 'Finance' | 'Job' | 'Personal' | 'Work' | 'Notification';

export interface EmailMessage {
  id: string;
  sender: string;
  senderEmail: string;
  time: string;
  body: string;
  bodyHtml?: string | null;
}

export interface Email {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  time: string;
  category: EmailCategory;
  aiSummary: string | null;
  threadSummary: string | null;
  thread: EmailMessage[];
  read: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  citations?: {
    sender: string;
    senderEmail: string;
    subject: string;
    time: string;
  }[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
}

export interface NewsletterItem {
  id: string;
  headline: string;
  summary: string;
  sources: string[]; // e.g. ["TLDR", "The Batch"]
  deduplicatedCount: number; // e.g. 3
  isDeduplicated: boolean;
  category: string;
}
