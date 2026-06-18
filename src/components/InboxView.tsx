import React, { useState } from 'react';
import { Email, EmailCategory } from '../types';
import { Search, ChevronDown, ChevronUp, CornerUpLeft, BookOpen, Star, RefreshCw, Sparkles, X, MailOpen, Mail } from 'lucide-react';

interface InboxViewProps {
  emails: Email[];
  setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  onComposeReply: (email: Email) => void;
}

export function getCategoryStyles(category: EmailCategory) {
  switch (category) {
    case 'Newsletter':
      return { dot: 'bg-purple-500', text: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
    case 'Finance':
      return { dot: 'bg-green-500', text: 'text-green-400 bg-green-500/10 border-green-500/20' };
    case 'Job':
      return { dot: 'bg-blue-500', text: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
    case 'Personal':
      return { dot: 'bg-orange-500', text: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
    case 'Work':
      return { dot: 'bg-gray-400', text: 'text-gray-300 bg-white/5 border-white/10' };
    case 'Notification':
      return { dot: 'bg-yellow-500', text: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' };
    default:
      return { dot: 'bg-gray-500', text: 'text-gray-400 bg-gray-500/10 border-gray-500/20' };
  }
}

export default function InboxView({ emails, setEmails, onComposeReply }: InboxViewProps) {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(emails[0] || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('All');

  // Multi-message thread toggles internally for custom summaries or reading states
  const filteredEmails = emails.filter((email) => {
    const matchesSearch = 
      email.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.snippet.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = activeCategoryFilter === 'All' || email.category === activeCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const selectEmail = async (email: Email) => {
    setSelectedEmail(email);
    // Mark as read
    if (!email.read) {
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
      );
    }

    // Auto-generate AI insights on-the-fly if missing
    if (!email.threadSummary) {
      try {
        const { getThread } = await import('../api');
        const enriched = await getThread(email.id);
        if (enriched?.threadSummary) {
          setSelectedEmail((prev) => prev?.id === email.id ? { ...prev, threadSummary: enriched.threadSummary, aiSummary: enriched.aiSummary } : prev);
          setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, threadSummary: enriched.threadSummary, aiSummary: enriched.aiSummary } : e));
        }
      } catch (err) {
        console.error('Failed to generate AI insight:', err);
      }
    }
  };

  const handleToggleReadStatus = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEmails((prev) =>
      prev.map((email) => (email.id === emailId ? { ...email, read: !email.read } : email))
    );
    if (selectedEmail?.id === emailId) {
      setSelectedEmail((prev) => prev ? { ...prev, read: !prev.read } : null);
    }
  };

  return (
    <div className="flex flex-1 h-screen overflow-hidden bg-[#0D0F12] text-gray-200">
      
      {/* 1. EMAILS DIRECTORY PANEL (LEFT LIST) */}
      <div 
        id="inbox-directory"
        className="flex flex-col flex-1 max-w-full md:max-w-[550px] lg:max-w-[620px] border-r border-[#252830] h-full"
      >
        {/* Header Search Utility and Category Shortcuts */}
        <div className="p-4 border-b border-[#252830] flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-sans font-semibold tracking-tight text-white flex items-center gap-2">
              Inbox
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#161920] border border-[#252830] font-mono text-[#22D3EE] font-medium">
                {emails.filter(e => !e.read).length} Unread
              </span>
            </h1>
            <div className="text-xs text-gray-400 font-mono">Platform v1.0.0</div>
          </div>
          
          {/* Custom Search bar */}
          <div className="relative" id="inbox-search-container">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="inbox-search-input"
              type="text"
              placeholder="Query emails, senders, AI transcripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-[#161920] border border-[#252830] rounded-md text-xs font-sans text-gray-200 placeholder-gray-500 focus:outline-hidden focus:border-[#6366F1] transition-colors"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex gap-1.5 overflow-x-auto pb-1" id="quick-category-tabbar">
            {['All', 'Job', 'Work', 'Newsletter', 'Finance', 'Personal', 'Notification'].map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategoryFilter(category)}
                className={`text-[11px] px-2.5 py-1 rounded-md cursor-pointer transition-colors shrink-0 ${
                  activeCategoryFilter === category
                    ? 'bg-[#6366F1] text-white border border-[#6366F1]'
                    : 'bg-[#161920]/40 text-gray-400 hover:text-gray-200 border border-transparent hover:bg-white/5'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Email Scrollable Queue */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#252830] bg-[#0E1115]" id="email-list-content">
          {filteredEmails.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-sans text-sm">
              No matching emails found in your primary logs.
            </div>
          ) : (
            filteredEmails.map((email) => {
              const styles = getCategoryStyles(email.category);
              const isSelected = selectedEmail?.id === email.id;

              return (
                <div
                  key={email.id}
                  id={`email-${email.id}`}
                  onClick={() => selectEmail(email)}
                  className={`p-4 transition-all duration-150 cursor-pointer flex flex-col gap-2 group relative border-l-2 select-none ${
                    isSelected 
                      ? 'bg-[#161920]/90 border-l-[#6366F1] shadow-inner' 
                      : email.read 
                        ? 'border-l-transparent bg-[#0D0F12] hover:bg-[#161920]/30'
                        : 'border-l-[#22D3EE] bg-[#161920]/20 hover:bg-[#161920]/40'
                  }`}
                >
                  {/* Row 1: Sender & Time */}
                  <div className="flex items-center justify-between w-full">
                    <span className="font-sans font-semibold text-xs tracking-tight text-white flex items-center gap-1.5">
                      {!email.read && <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]"></span>}
                      {email.sender}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">{email.time}</span>
                  </div>

                  {/* Row 2: Subject & Category Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className={`text-xs select-text leading-snug font-medium line-clamp-1 ${
                      email.read ? 'text-gray-300' : 'text-white font-semibold'
                    }`}>
                      {email.subject}
                    </h3>
                    
                    {/* Pill Category Badge */}
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-medium font-sans shrink-0 uppercase tracking-widest ${styles.text}`}>
                      <span className={`w-1 h-1 rounded-full ${styles.dot}`}></span>
                      {email.category}
                    </div>
                  </div>

                  {/* Snippet body */}
                  <p className="text-xs text-gray-400 line-clamp-1 leading-relaxed selection:bg-[#6366F1]/30">
                    {email.snippet}
                  </p>

                  {/* 1-Line AI Summary Banner */}
                  <div className="mt-1 bg-gradient-to-r from-[#161920] to-[#0D0F12] border border-[#252830] px-2.5 py-1.5 rounded-md flex items-start gap-1.5">
                    <Sparkles size={11} className="text-[#22D3EE] shrink-0 mt-0.5" />
                    <span className="text-[10px] text-gray-300 font-sans leading-normal select-text">
                      <strong className="text-[#22D3EE] font-medium font-mono uppercase tracking-widest text-[8px] mr-1">AI INSIGHT:</strong>
                      {email.aiSummary || <span className="text-gray-500 italic">Click to generate insight</span>}
                    </span>
                  </div>

                  {/* Action Quick Bar */}
                  <div className="invisible group-hover:visible absolute right-3 top-3 flex items-center gap-1 bg-[#161920] border border-[#252830] p-1 rounded-md shadow-lg transition-all">
                    <button
                      title="Toggle Read/Unread"
                      onClick={(e) => handleToggleReadStatus(email.id, e)}
                      className="p-1 hover:bg-[#252830] text-gray-300 rounded-sm cursor-pointer transition-colors"
                    >
                      {email.read ? <Mail size={12} /> : <MailOpen size={12} />}
                    </button>
                    <button
                      title="Reply with AI"
                      onClick={(e) => {
                        e.stopPropagation();
                        onComposeReply(email);
                      }}
                      className="text-[10px] hover:bg-[#252830] px-2 py-0.5 text-[#22D3EE] rounded-sm font-medium font-mono cursor-pointer flex items-center gap-1"
                    >
                      <CornerUpLeft size={10} /> Reply AI
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. CHRONOLOGICAL THREAD VIEWER PANEL (RIGHT PANEL) */}
      <div 
        id="email-thread-view"
        className="hidden md:flex flex-1 flex-col h-full bg-[#111319]"
      >
        {selectedEmail ? (
          <div className="flex flex-col h-full">
            {/* Header Subject and Navigation Actions */}
            <div className="p-4 border-b border-[#252830] bg-[#161920] flex items-center justify-between shrink-0">
              <div className="flex flex-col gap-1 max-w-[80%]">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-mono border font-semibold ${getCategoryStyles(selectedEmail.category).text}`}>
                    {selectedEmail.category}
                  </span>
                  <span className="text-[10px] font-mono text-gray-400">Total Thread: {selectedEmail.thread.length} messages</span>
                </div>
                <h2 className="text-sm font-sans font-bold text-white tracking-tight leading-snug select-text">
                  {selectedEmail.subject}
                </h2>
              </div>

              {/* Thread Action header tools */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onComposeReply(selectedEmail)}
                  className="bg-[#6366F1] hover:bg-[#6366F1]/80 text-white font-mono text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 select-none transition-colors cursor-pointer"
                >
                  <CornerUpLeft size={13} />
                  Reply with AI
                </button>
              </div>
            </div>

            {/* Content Segment */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              
              {/* COLLAPSIBLE THREAD SUMMARY CARD (AI-GENERATED) */}
              <div 
                id="thread-collapsible-summary"
                className="bg-[#161920] border-2 border-[#6366F1]/20 rounded-md shadow-2xl overflow-hidden shrink-0 transition-all duration-300"
              >
                {/* Header Summary Trigger */}
                <button
                  onClick={() => setSummaryExpanded(!summaryExpanded)}
                  className="w-full px-4 py-2 bg-[#161920] flex items-center justify-between text-[#22D3EE] font-mono text-[10px] font-bold tracking-wider hover:bg-[#252830]/30 transition-colors uppercase cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles size={12} className="text-[#22D3EE]" />
                    AI Thread Synthesis Summary
                  </span>
                  {summaryExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {summaryExpanded && (
                  <div className="p-4 border-t border-[#252830] text-xs font-sans text-gray-300 leading-relaxed bg-[#14161C]/50 select-text selection:bg-[#22D3EE]/30">
                    {selectedEmail.threadSummary ? (
                      selectedEmail.threadSummary
                    ) : (
                      <div className="flex items-center gap-2 text-gray-500">
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Generating AI insight...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TIMELINE THREAD CONNECTOR CHRONOLOGY */}
              <div className="relative flex flex-col gap-6 pl-4" id="thread-chronological-feed">
                {/* Vertical Connector Line */}
                <div 
                  className="absolute left-6 top-3 bottom-3 w-0.5 bg-[#252830] z-0" 
                  id="vertical-timeline-line"
                />

                {selectedEmail.thread.map((msg, index) => {
                  const isUser = msg.sender === 'You';
                  return (
                    <div 
                      key={msg.id} 
                      id={`msg-${msg.id}`}
                      className="relative z-10 flex flex-col gap-2"
                    >
                      {/* Timeline Dot Indicator */}
                      <span className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isUser 
                          ? 'bg-[#111319] border-[#6366F1]' 
                          : 'bg-[#22D3EE] border-[#111319]'
                      }`} />

                      {/* Msg Details Card */}
                      <div className="ml-8 bg-[#161920] border border-[#252830] rounded-md p-4 shadow-sm hover:border-[#6366F1]/30 transition-colors">
                        <div className="flex items-center justify-between border-b border-[#252830] pb-2 mb-2">
                          <div className="flex flex-col">
                            <span className="text-xs font-sans font-bold text-white leading-none">
                              {msg.sender}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400 mt-0.5">
                              {msg.senderEmail}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400">{msg.time}</span>
                        </div>
                        
                        {/* Body content message formatted */}
                        <div className="text-xs text-gray-300 font-sans whitespace-pre-line leading-relaxed select-text select-all-target selection:bg-[#6366F1]/40">
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500 font-sans">
            <BookOpen size={40} className="text-gray-600 mb-2" />
            <p className="text-sm">Select an email from the inbox list to read full thread history.</p>
          </div>
        )}
      </div>

    </div>
  );
}
