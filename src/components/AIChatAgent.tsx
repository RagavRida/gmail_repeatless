import React, { useState } from 'react';
import { ChatSession, ChatMessage } from '../types';
import { DUMMY_CHAT_HISTORY } from '../dummyData';
import { MessageSquare, Send, Sparkles, AlertCircle, Quote, Plus, ArrowRight, User } from 'lucide-react';
import * as api from '../api';

interface AIChatAgentProps {
  chatSessions: ChatSession[];
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  isAuthenticated?: boolean;
}

export default function AIChatAgent({ chatSessions, setChatSessions, isAuthenticated }: AIChatAgentProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(chatSessions[0]?.id || '');
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const activeSession = chatSessions.find((s) => s.id === selectedSessionId) || chatSessions[0];

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isGenerating) return;

    if (!textToSend) {
      setInputText('');
    }

    // Prepare new user message
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `m-user-${Date.now()}`,
      role: 'user',
      content: text,
      time: `Today, ${currentTime}`
    };

    // Add user message to active session
    let sessionToUpdate = activeSession;
    setChatSessions((prev) =>
      prev.map((session) => {
        if (session.id === sessionToUpdate.id) {
          return {
            ...session,
            messages: [...session.messages, userMsg]
          };
        }
        return session;
      })
    );

    setIsGenerating(true);

    try {
      // Try real API if authenticated
      if (isAuthenticated) {
        const result = await api.sendChatMessage(sessionToUpdate.id, text);

        const aiMsg: ChatMessage = {
          id: `m-ai-${Date.now()}`,
          role: 'assistant',
          content: result.content,
          time: result.time || `Today, ${currentTime}`,
          citations: result.citations || []
        };

        setChatSessions((prev) =>
          prev.map((session) => {
            if (session.id === sessionToUpdate.id) {
              return { ...session, messages: [...session.messages, aiMsg] };
            }
            return session;
          })
        );
      } else {
        // Fallback: simulated response for demo mode
        await new Promise(resolve => setTimeout(resolve, 1200));
        const aiMsg = generateDemoResponse(text, currentTime);
        setChatSessions((prev) =>
          prev.map((session) => {
            if (session.id === sessionToUpdate.id) {
              return { ...session, messages: [...session.messages, aiMsg] };
            }
            return session;
          })
        );
      }
    } catch (err) {
      // On API error, show error message
      const errorMsg: ChatMessage = {
        id: `m-err-${Date.now()}`,
        role: 'assistant',
        content: `I encountered an error processing your request. Please try again.\n\nError: ${(err as Error).message}`,
        time: `Today, ${currentTime}`,
      };
      setChatSessions((prev) =>
        prev.map((session) => {
          if (session.id === sessionToUpdate.id) {
            return { ...session, messages: [...session.messages, errorMsg] };
          }
          return session;
        })
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const createNewChat = async () => {
    try {
      if (isAuthenticated) {
        const result = await api.createConversation();
        const newSession: ChatSession = {
          id: result.id,
          title: result.title || 'New Investigation',
          messages: result.messages || [{
            id: `msg-welcome-${Date.now()}`,
            role: 'assistant',
            content: 'Hello! I am your local email intelligence agent. Ask me to synthesize, audit, draft, or correlate facts across your newsletters and work threads.',
            time: 'Just now'
          }]
        };
        setChatSessions((prev) => [newSession, ...prev]);
        setSelectedSessionId(newSession.id);
        return;
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }

    // Fallback: local-only session
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: 'New Investigation',
      messages: [
        {
          id: `msg-welcome-${Date.now()}`,
          role: 'assistant',
          content: 'Hello! I am your local email intelligence agent. Ask me to synthesize, audit, draft, or correlate facts across your newsletters and work threads.',
          time: 'Just now'
        }
      ]
    };
    setChatSessions((prev) => [newSession, ...prev]);
    setSelectedSessionId(newId);
  };

  return (
    <div className="flex flex-1 h-screen overflow-hidden bg-[#0D0F12]">
      {/* LEFT COLUMN: CONVERSATION HISTORY & ACTION LIST */}
      <div 
        id="chat-history-sidebar"
        className="w-[260px] lg:w-[290px] border-r border-[#252830] bg-[#111319] flex flex-col h-full shrink-0 select-none"
      >
        <div className="p-4 border-b border-[#252830] flex flex-col gap-3 shrink-0">
          <button
            id="btn-create-new-chat"
            onClick={createNewChat}
            className="w-full bg-[#6366F1] hover:bg-[#6366F1]/90 text-white font-mono text-xs font-semibold py-2 px-3 rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Plus size={14} /> New Query Session
          </button>
        </div>

        {/* Scrollable list of custom chats */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1" id="chat-session-list">
          <h4 className="text-[10px] text-gray-500 font-mono uppercase tracking-widest px-2.5 py-2">
            Intelligence Queries
          </h4>
          {chatSessions.map((session) => {
            const isActive = session.id === activeSession.id;
            return (
              <button
                key={session.id}
                id={`session-item-${session.id}`}
                onClick={() => setSelectedSessionId(session.id)}
                className={`w-full p-2.5 rounded-md flex items-start gap-2.5 text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#161920] border border-[#252830] text-white font-medium'
                    : 'text-gray-400 hover:bg-[#161920]/40 hover:text-gray-200'
                }`}
              >
                <MessageSquare size={13} className="text-[#22D3EE] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate font-sans">{session.title}</p>
                  <p className="text-[9px] font-mono text-gray-500 mt-1 truncate">
                    {session.messages.length} interactions
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: ACTIVE CHAT SHELL */}
      <div className="flex-1 flex flex-col h-full bg-[#0D0F12]" id="chat-active-pane">
        {/* Core Header */}
        <div className="h-[60px] border-b border-[#252830] bg-[#161920]/60 flex items-center px-6 justify-between shrink-0 select-none">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-[#22D3EE] animate-pulse' : 'bg-gray-500'}`}></span>
            <h3 className="text-xs font-mono font-semibold text-white tracking-wider uppercase">
              Agent Thread Core
            </h3>
          </div>
          <span className={`text-[9px] px-2 py-0.5 border rounded-md font-mono ${
            isAuthenticated 
              ? 'bg-[#22D3EE]/10 border-[#22D3EE]/30 text-[#22D3EE]' 
              : 'bg-[#252830] border-gray-600 text-gray-400'
          }`}>
            {isAuthenticated ? 'RAG Agent Connected' : 'Demo Mode — Connect Gmail for Live'}
          </span>
        </div>

        {/* Chat Stream scroll container */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6" id="chat-messages-container">
          {activeSession.messages.map((msg, index) => {
            const isAI = msg.role === 'assistant';
            return (
              <div
                key={msg.id}
                id={`chat-msg-${msg.id}`}
                className={`flex gap-4 max-w-[85%] lg:max-w-[75%] font-sans select-text ${
                  isAI ? 'self-start' : 'self-end flex-row-reverse'
                }`}
              >
                {/* Profile Icon / Sparkle */}
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border select-none ${
                    isAI
                      ? 'bg-[#161920] border-[#22D3EE]/30 text-[#22D3EE]'
                      : 'bg-[#6366F1]/10 border-[#6366F1]/20 text-[#6366F1]'
                  }`}
                >
                  {isAI ? <Sparkles size={14} /> : <User size={14} />}
                </div>

                {/* Msg Core Card */}
                <div
                  className={`rounded-md p-4 text-xs leading-relaxed transition-all duration-300 relative ${
                    isAI
                      ? 'bg-[#161920] border border-[#252830] text-gray-200 ai-pulse-bar'
                      : 'bg-[#6366F1] text-white font-medium'
                  }`}
                >
                  <p className="whitespace-pre-line selection:bg-[#22D3EE]/30">{msg.content}</p>

                  {/* CITATIONS DISPLAY FOR AGENT COGNITIVE RESPONSES */}
                  {isAI && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#252830] flex flex-col gap-1.5" id={`citations-${msg.id}`}>
                      <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block font-bold">
                        Cognitive Source Citations:
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {msg.citations.map((cite, cIdx) => (
                          <div
                            key={cIdx}
                            className="bg-[#252830]/60 border border-gray-700/60 rounded-md px-2 py-1 flex items-center gap-1.5 text-[9px] text-gray-300 font-mono hover:border-[#22D3EE]/40 transition-colors select-none"
                            title={`Subject: ${cite.subject}`}
                          >
                            <Quote size={8} className="text-[#22D3EE]" />
                            <span className="font-sans font-semibold">{cite.sender}</span>
                            <span className="text-gray-500">·</span>
                            <span>{cite.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamp */}
                  <span className={`text-[8px] font-mono mt-2 block text-right ${isAI ? 'text-gray-500' : 'text-indigo-200'}`}>
                    {msg.time}
                  </span>
                </div>
              </div>
            );
          })}

          {/* GENERATIVE DELAY PLACEHOLDER */}
          {isGenerating && (
            <div className="flex gap-4 max-w-[80%] self-start animate-pulse" id="chat-generating-feedback">
              <div className="w-8 h-8 rounded-md bg-[#161920] border border-[#22D3EE]/30 text-[#22D3EE] flex items-center justify-center">
                <Sparkles size={14} className="animate-spin text-[#22D3EE]" />
              </div>
              <div className="bg-[#161920] border border-[#252830] rounded-md p-4 text-xs leading-relaxed text-gray-400 font-sans">
                <p className="flex items-center gap-2 font-mono text-[10px]">
                  <span>{isAuthenticated ? 'Querying email knowledge base...' : 'Scanning email index and validating credentials...'}</span>
                </p>
                <div className="flex gap-1 mt-2">
                  <span className="w-1.5 h-1.5 bg-[#22D3EE] rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-[#22D3EE] rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-[#22D3EE] rounded-full animate-bounce delay-200"></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM PROMPT INPUT CONSOLE BAR */}
        <div className="p-4 border-t border-[#252830] bg-[#111319] shrink-0" id="chat-input-toolbar">
          {/* Quick Click Assistive Prompts */}
          <div className="flex gap-2 overflow-x-auto pb-2 select-none" id="chat-assists-tray">
            {[
              { text: 'Analyze Supabase billing limit', q: 'Summarize my Supabase overages' },
              { text: 'Check Stripe recruiter letter', q: 'What is my Stripe application status?' },
              { text: 'Synthesize Sora knowledge', q: 'What do newsletters say about OpenAI Sora video model?' },
              { text: 'Any trip updates?', q: 'What is the schedule and budget of my cabin trip?' }
            ].map((assist, index) => (
              <button
                key={index}
                onClick={() => handleSendMessage(assist.q)}
                className="bg-[#161920] hover:bg-[#252830] text-[#22D3EE] hover:text-[#22D3EE]/80 px-2.5 py-1 rounded-md text-[10px] font-sans border border-[#252830] hover:border-[#22D3EE]/20 transition-all shrink-0 cursor-pointer"
              >
                {assist.text}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              id="chat-primary-input"
              type="text"
              placeholder="Ask about your emails..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              className="flex-1 bg-[#161920] border border-[#252830] rounded-md px-4 py-2 text-xs font-sans text-gray-200 focus:outline-hidden focus:border-[#22D3EE] placeholder-gray-500"
            />
            <button
              id="btn-chat-send"
              disabled={isGenerating || !inputText.trim()}
              onClick={() => handleSendMessage()}
              className={`w-10 h-10 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                isGenerating || !inputText.trim()
                  ? 'bg-[#161920] text-gray-600 border border-[#252830]'
                  : 'bg-[#22D3EE]/20 text-[#22D3EE] hover:bg-[#22D3EE] hover:text-[#0D0F12] border border-[#22D3EE]/30'
              }`}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Demo mode response generator (used when not authenticated)
function generateDemoResponse(text: string, currentTime: string): ChatMessage {
  let aiContent = '';
  let aiCitations: ChatMessage['citations'] = [];

  const lower = text.toLowerCase();
  if (lower.includes('supabase') || lower.includes('overage') || lower.includes('bill')) {
    aiContent = `I did a diagnostic query across your billing files. Your Supabase project **database-prod-x** is exceeding limits in multiple sectors:\n\n- **CPU cycle metrics**: 240% above limit\n- **Database Space**: 1.2GB currently occupied\n\nAntony from support granted you until **Friday morning** (Jun 19) to finalize the pay-as-you-go Pro subscription before database operations are consolidated. Additionally, your **AWS bill of $412.80** is scheduled for auto-charge on Jun 18.`;
    aiCitations = [
      { sender: 'Antony (Support)', senderEmail: 'antony@supabase.io', subject: '[Urgent] API Overages & Q3 Scaling Plan', time: 'Jun 16' },
      { sender: 'AWS Billing', senderEmail: 'billing@amazon.com', subject: 'AWS Invoice - May 2026', time: 'Jun 14' }
    ];
  } else if (lower.includes('stripe') || lower.includes('job') || lower.includes('apply')) {
    aiContent = `Analyzing recruiter channels: Julie Vance (stripe-design@stripe.com) sent a formal update on June 15 regarding the **Senior Staff Product Designer** role. They have filled the pipeline and decided not to move forward, suggesting they are prioritizing profiles with merchant checkout experience.\n\nHowever, you have **14 new matching matches on LinkedIn** (at Anthropic, Tesla, Scale AI) looking for AI talent.`;
    aiCitations = [
      { sender: 'Julie Vance', senderEmail: 'stripe-design@stripe.com', subject: 'Update on your application - Senior Staff Product Designer', time: 'Jun 15' }
    ];
  } else if (lower.includes('news') || lower.includes('newsletter') || lower.includes('sora')) {
    aiContent = `In Import AI #354, Jack Clark notes that OpenAI Sora API programmatic access is rolling out to enterprise entities. However, heavy compute concerns are keeping it restricted to high-resource developers.\n\nTLDR Tech reports Apple's on-device CoreML and M4 silicon integrations are driving low-latency local execution formats, minimizing server dependency.`;
    aiCitations = [
      { sender: 'Jack Clark', senderEmail: 'jack@importai.news', subject: 'Import AI #354', time: 'Jun 16' },
      { sender: 'TLDR Web Dev', senderEmail: 'tldr@tldr.tech', subject: "TLDR Tech: Apple's M4", time: 'Jun 15' }
    ];
  } else if (lower.includes('cabin') || lower.includes('sarah') || lower.includes('trip')) {
    aiContent = `Sarah Jenkins sent a reminder on June 13 regarding the **Mendocino Cabin Trip**. \n\n- **Timeline**: July 3-5\n- **Target expense**: $120 each (based on 7 splits)\n- **Veto warning**: She needs confirmation by **Thursday** to finalize the rental lock in.\n\nNo other confirmations correspond to the email thread yet.`;
    aiCitations = [
      { sender: 'Sarah Jenkins', senderEmail: 'sarah@homemail.com', subject: 'Re: Cabin trip next month?', time: 'Jun 13' }
    ];
  } else {
    aiContent = `I searched your inbox archive in real-time but couldn't locate specific conversations matching that query. Based on your current 12 loaded emails, here are the dominant contexts:\n\n1. **Supabase Billing Threat** (Work category)\n2. **Stripe Application Rejection** (Job category)\n3. **Mendocino Summer Reservation** from Sarah (Personal category)\n4. **Vulnerable Axios CVE-2026-1182 Warning** (Notification category)\n\nPlease refine your question (e.g. "Draft a reply to Sarah" or "Describe Supabase overages").`;
    aiCitations = [
      { sender: 'System Indexer', senderEmail: 'ai-engine@platform.internal', subject: 'All Inbox vector indexes updated', time: 'Just now' }
    ];
  }

  return {
    id: `m-ai-${Date.now()}`,
    role: 'assistant',
    content: aiContent,
    time: `Today, ${currentTime}`,
    citations: aiCitations
  };
}
