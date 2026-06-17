import React, { useState, useEffect } from 'react';
import { Email } from '../types';
import { Sparkles, Loader2, Send, Trash, Paperclip, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react';

interface ComposeViewProps {
  emails: Email[];
  replyContextEmail: Email | null;
  clearReplyContext: () => void;
}

export default function ComposeView({ emails, replyContextEmail, clearReplyContext }: ComposeViewProps) {
  const [activeTab, setActiveTab] = useState<'new' | 'reply'>('new');
  
  // New Email fields
  const [newRecipient, setNewRecipient] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newDraft, setNewDraft] = useState('');
  const [isGeneratingNew, setIsGeneratingNew] = useState(false);
  const [newTone, setNewTone] = useState('Professional');

  // Reply fields
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [replyPrompt, setReplyPrompt] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [replyTone, setReplyTone] = useState('Friendly');
  const [parentContextExpanded, setParentContextExpanded] = useState(true);

  // Status Alerts
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // If redirected with reply email context
  useEffect(() => {
    if (replyContextEmail) {
      setActiveTab('reply');
      setSelectedParentId(replyContextEmail.id);
      
      // Auto-set prompt suggestions depending on context
      if (replyContextEmail.category === 'Personal') {
        setReplyPrompt('Confirm cabin dates and say I will Venmo the $120 budget tonight');
      } else if (replyContextEmail.category === 'Work') {
        setReplyPrompt('Ask Antony to clarify the billing grace period timeline and upgrade instructions');
      } else {
        setReplyPrompt('Draft a professional response thanking them and asking for interview timeline updates');
      }
    } else if (emails.length > 0 && !selectedParentId) {
      setSelectedParentId(emails[0].id);
    }
  }, [replyContextEmail, emails]);

  const selectedParentEmail = emails.find((e) => e.id === selectedParentId) || emails[0];

  const triggerNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleGenerateNewDraft = () => {
    if (!newPrompt.trim()) return;
    setIsGeneratingNew(true);
    setNewDraft('');

    setTimeout(() => {
      let draftText = '';
      const recipientName = newRecipient.split('@')[0] || 'Team';
      const capitalizedName = recipientName.charAt(0).toUpperCase() + recipientName.slice(1);

      if (newPrompt.toLowerCase().includes('job') || newPrompt.toLowerCase().includes('resume') || newPrompt.toLowerCase().includes('stripe')) {
        draftText = `Subject: Staff Systems Consultant Opportunity & Feedback Query\n\nDear Julie,\n\nThank you for sharing the product roadmap update regarding Stripe's focus on high-frequency checkout design systems. I appreciate the talent acquisition review cycle.\n\nSince my background matches your next-phase planning benchmarks for programmatic user agents, I would love to schedule a brief 10-minute touchpoint later this quarter to learn about specialized roles.\n\nRespectfully,\nDeveloper`;
      } else if (newTone === 'Concise') {
        draftText = `Subject: Quick Follow-up - Project Status\n\nHi ${capitalizedName},\n\nJust writing to check on the latest deployment pipeline logs. Can you review if the TypeScript build issues on main have been sorted out? Let me know.\n\nThanks,\nDeveloper`;
      } else if (newTone === 'Friendly') {
        draftText = `Subject: Catching up on design specs!\n\nHi ${capitalizedName},\n\nHope your week is off to a wonderful start! \n\nI was reviewing the beautiful design frames for our custom workspace integration. I'd love to chat and hear if you have any feedback or ideas to iterate on. Let me know what your afternoon looks like!\n\nBest,\nDeveloper`;
      } else {
        draftText = `Dear ${capitalizedName},\n\nI hope this email finds you well.\n\nI am reaching out regarding the open items on our infrastructure project. Specifically, we should schedule a timeline to review our database capacities and look into securing our production pipeline.\n\nPlease let me know your availability for a synchronous sync this week.\n\nSincerely,\nDeveloper`;
      }

      setNewDraft(draftText);
      setIsGeneratingNew(false);
      triggerNotification('AI Email Draft generated successfully!');
    }, 1500);
  };

  const handleGenerateReplyDraft = () => {
    if (!replyPrompt.trim() || !selectedParentEmail) return;
    setIsGeneratingReply(true);
    setReplyDraft('');

    setTimeout(() => {
      let draftText = '';
      const senderName = selectedParentEmail.sender;

      if (selectedParentEmail.category === 'Work') {
        draftText = `Hi ${senderName},\n\nThanks for coordinating the weekly engineering sprint. \n\nRegarding the Supabase billing overages on our project, Antony has granted us a manual grace period whitelist until Friday. I am currently reviewing the storage usage to clean up old database log tables before we execute the Pro plan subscription migration.\n\nLet's discuss during the standup tomorrow.\n\nRegards,\nDeveloper`;
      } else if (selectedParentEmail.category === 'Personal') {
        draftText = `Hey ${senderName},\n\nCount me in for the cabin trip! Truly look forward to Mendocino. July 3-5 works perfectly on my side.\n\nI am sending you my $120 share of the reservation cost via Venmo right now. Thanks so much for putting this together and reserving the listing!\n\nBest,\nDeveloper`;
      } else if (selectedParentEmail.category === 'Job') {
        draftText = `Dear Julie Vance,\n\nThank you for your response and for the detailed context regarding your hiring directions. While I am naturally disappointed to hear you are prioritizing other checkout flow roles, I deeply appreciate the portfolio feedback.\n\nI will focus on integrating merchant checkout scaling tests into my next prototypes. Let\'s stay in contact as team roles evolve.\n\nSincerely,\nDeveloper`;
      } else {
        draftText = `Hi ${senderName},\n\nThank you for the update. I have reviewed the details you outlined and am proceeding with the recommended steps shortly. Let me know if any other dependencies arise.\n\nBest,\nDeveloper`;
      }

      setReplyDraft(draftText);
      setIsGeneratingReply(false);
      triggerNotification('AI Reply Draft synthesised successfully!');
    }, 1500);
  };

  const handleSendSimulation = (type: 'new' | 'reply') => {
    const to = type === 'new' ? newRecipient : selectedParentEmail?.senderEmail;
    triggerNotification(`Simulated sending email to ${to || 'recipient'} - added to outbox!`, 'success');
    
    // Reset states
    if (type === 'new') {
      setNewRecipient('');
      setNewSubject('');
      setNewPrompt('');
      setNewDraft('');
    } else {
      setReplyPrompt('');
      setReplyDraft('');
      clearReplyContext();
    }
  };

  const handleDiscardSimulation = (type: 'new' | 'reply') => {
    if (type === 'new') {
      setNewRecipient('');
      setNewSubject('');
      setNewPrompt('');
      setNewDraft('');
    } else {
      setReplyPrompt('');
      setReplyDraft('');
      clearReplyContext();
    }
    triggerNotification('Draft discarded.', 'info');
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0D0F12] p-6 text-gray-200">
      
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full gap-4">
        
        {/* Navigation & Tab Setup */}
        <div className="flex items-center justify-between border-b border-[#252830] pb-2 shrink-0 select-none">
          <div className="flex gap-2">
            <button
              id="tab-compose-new"
              onClick={() => setActiveTab('new')}
              className={`px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeTab === 'new'
                  ? 'border-[#6366F1] text-[#6366F1]'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              New Email Draft
            </button>
            <button
              id="tab-compose-reply"
              onClick={() => setActiveTab('reply')}
              className={`px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeTab === 'reply'
                  ? 'border-[#6366F1] text-[#6366F1]'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              AI Reply Generator
            </button>
          </div>
          
          <div className="text-[10px] text-gray-500 font-mono">
            Copilot Core Enabled
          </div>
        </div>

        {/* Floating Notification Toast */}
        {notification && (
          <div 
            id="compose-notification"
            className={`px-4 py-2.5 rounded-md border text-xs font-sans flex items-center gap-2 select-none self-end scale-100 transition-transform ${
              notification.type === 'success' 
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-[#161920] border-[#252830] text-gray-400'
            }`}
          >
            <Sparkles size={13} className="text-[#22D3EE]" />
            {notification.message}
          </div>
        )}

        {/* SCROLLABLE INTERACTIVE FORMS CORES */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
          
          {/* TAB 1: NEW EMAIL DRAFTER */}
          {activeTab === 'new' && (
            <div className="flex flex-col gap-4" id="form-new-email">
              
              {/* Input Card Container */}
              <div className="bg-[#161920] border border-[#252830] rounded-md p-5 flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2 border-b border-[#252830] select-none">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-gray-400 uppercase">Recipient Address</label>
                    <input
                      id="compose-recipient"
                      type="text"
                      placeholder="e.g. recruit@stripe.com"
                      value={newRecipient}
                      onChange={(e) => setNewRecipient(e.target.value)}
                      className="bg-[#0D0F12] border border-[#252830] rounded-md px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-hidden focus:border-[#6366F1]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-gray-400 uppercase">Subject Line</label>
                    <input
                      id="compose-subject"
                      type="text"
                      placeholder="e.g. Design Sync & Proposal"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="bg-[#0D0F12] border border-[#252830] rounded-md px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-hidden focus:border-[#6366F1]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between select-none">
                    <label className="text-[10px] font-mono text-[#22D3EE] font-bold uppercase flex items-center gap-1">
                      <Sparkles size={11} />
                      AI Drafting Instructions
                    </label>
                    <div className="flex gap-2">
                      {['Professional', 'Friendly', 'Concise'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setNewTone(t)}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-full border cursor-pointer ${
                            newTone === t
                              ? 'bg-[#22D3EE]/10 border-[#22D3EE]/30 text-[#22D3EE]'
                              : 'bg-transparent border-[#252830] text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    id="compose-prompt"
                    rows={3}
                    placeholder="Describe what you want to write. e.g. 'Draft a professional follow-up on my application asking for updates and thanking Julie for her time.'"
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    className="bg-[#0D0F12] border border-[#252830] rounded-md p-3 text-xs text-gray-200 placeholder-gray-600 font-sans focus:outline-hidden focus:border-[#6366F1] resize-none"
                  />
                </div>

                <button
                  id="btn-generate-new-draft"
                  disabled={isGeneratingNew || !newPrompt.trim()}
                  onClick={handleGenerateNewDraft}
                  className={`w-full py-2.5 rounded-md font-mono text-xs font-semibold flex items-center justify-center gap-2 select-none cursor-pointer transition-all ${
                    isGeneratingNew || !newPrompt.trim()
                      ? 'bg-[#0D0F12] text-gray-600 border border-[#252830]'
                      : 'bg-[#6366F1] hover:bg-[#6366F1]/90 text-white border border-[#6366F1]'
                  }`}
                >
                  {isGeneratingNew ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-[#22D3EE]" />
                      Generating draft (1.5s delay simulation)...
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      Generate Draft with AI
                    </>
                  )}
                </button>
              </div>

              {/* Editable drafted card box */}
              {(isGeneratingNew || newDraft) && (
                <div 
                  id="drafted-email-card"
                  className="bg-[#161920] border-2 border-[#6366F1]/30 rounded-md p-5 flex flex-col gap-4 animate-fade-in relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#6366F1]"></div>
                  
                  <div className="flex items-center justify-between border-b border-[#252830] pb-2 select-none">
                    <span className="text-[10px] font-mono text-[#22D3EE] font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={12} className="animate-pulse" />
                      AI Draft Composed (Editable)
                    </span>
                    <button 
                      onClick={() => setNewDraft(newDraft)} 
                      className="text-[9px] font-mono text-gray-400 hover:text-white flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <RefreshCw size={10} /> Regen
                    </button>
                  </div>

                  {isGeneratingNew ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 select-none">
                      <Loader2 size={24} className="animate-spin text-[#22D3EE]" />
                      <span className="text-xs font-mono text-gray-500">Formulating appropriate email response...</span>
                    </div>
                  ) : (
                    <textarea
                      id="compose-draft-textarea"
                      rows={8}
                      value={newDraft}
                      onChange={(e) => setNewDraft(e.target.value)}
                      className="w-full bg-transparent border-0 resize-none focus:ring-0 focus:outline-hidden text-xs text-gray-200 leading-relaxed font-sans select-text select-all-target selection:bg-[#6366F1]/40"
                    />
                  )}

                  <div className="flex justify-between select-none">
                    <button
                      id="btn-discard-new"
                      onClick={() => handleDiscardSimulation('new')}
                      className="border border-[#252830] hover:bg-white/5 px-4 py-2 rounded-md font-mono text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
                    >
                      Discard Draft
                    </button>
                    <button
                      id="btn-send-new"
                      onClick={() => handleSendSimulation('new')}
                      className="bg-[#6366F1] hover:bg-[#6366F1]/90 text-white px-4 py-2 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Send size={12} /> Send Email
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REPLY GENERATOR */}
          {activeTab === 'reply' && (
            <div className="flex flex-col gap-4" id="form-reply-email">
              
              {/* Parent context selector and collapsing panel */}
              <div className="bg-[#161920] border border-[#252830] rounded-md p-5 flex flex-col gap-3">
                <div className="flex flex-col gap-1 border-b border-[#252830] pb-3 select-none">
                  <label className="text-[10px] font-mono text-gray-400 uppercase">Select Thread to Reply To</label>
                  <select
                    id="reply-parent-selector"
                    value={selectedParentId}
                    onChange={(e) => setSelectedParentId(e.target.value)}
                    className="bg-[#0D0F12] border border-[#252830] rounded-md px-3 py-2 text-xs text-gray-200 focus:outline-hidden focus:border-[#6366F1]"
                  >
                    {emails.map((e) => (
                      <option key={e.id} value={e.id}>
                        [{e.category}] {e.sender} — {e.subject}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Collapsed Parent Thread Context Display */}
                {selectedParentEmail && (
                  <div className="bg-[#0D0F12] border border-[#252830] rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setParentContextExpanded(!parentContextExpanded)}
                      className="w-full px-3 py-1.5 bg-[#161920]/40 flex items-center justify-between text-[10px] font-mono text-gray-400 hover:text-white transition-colors cursor-pointer select-none"
                    >
                      <span>CONVERSATION HISTORY TO REPLY</span>
                      {parentContextExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    
                    {parentContextExpanded && (
                      <div className="p-3 flex flex-col gap-2.5 max-h-[140px] overflow-y-auto">
                        {selectedParentEmail.thread.slice(-1).map((msg) => (
                          <div key={msg.id} className="text-[11px] leading-relaxed">
                            <div className="flex justify-between items-center text-gray-500 font-mono text-[9px] mb-1 select-none">
                              <span>From: {msg.sender} ({msg.senderEmail})</span>
                              <span>{msg.time}</span>
                            </div>
                            <p className="text-gray-400 italic bg-[#161920]/20 p-2 rounded-md border border-[#252830]/80 select-text font-sans">
                              "{msg.body.length > 140 ? `${msg.body.substring(0, 140)}...` : msg.body}"
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Reply prompt and configuration */}
                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex items-center justify-between select-none">
                    <label className="text-[10px] font-mono text-[#22D3EE] font-bold uppercase flex items-center gap-1">
                      <Sparkles size={11} />
                      AI Reply Prompt
                    </label>
                    <div className="flex gap-2">
                      {['Friendly', 'Professional', 'Concise'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setReplyTone(t)}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-full border cursor-pointer ${
                            replyTone === t
                              ? 'bg-[#22D3EE]/10 border-[#22D3EE]/30 text-[#22D3EE]'
                              : 'bg-transparent border-[#252830] text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    id="reply-prompt-textarea"
                    rows={3}
                    placeholder="Describe your intent for the response. e.g. 'Say I\'m interested and Venmo the rental split right away...'"
                    value={replyPrompt}
                    onChange={(e) => setReplyPrompt(e.target.value)}
                    className="bg-[#0D0F12] border border-[#252830] rounded-md p-3 text-xs text-gray-200 placeholder-gray-600 font-sans focus:outline-hidden focus:border-[#6366F1] resize-none"
                  />
                </div>

                <button
                  id="btn-generate-reply-draft"
                  disabled={isGeneratingReply || !replyPrompt.trim()}
                  onClick={handleGenerateReplyDraft}
                  className={`w-full py-2.5 rounded-md font-mono text-xs font-semibold flex items-center justify-center gap-2 select-none cursor-pointer transition-all ${
                    isGeneratingReply || !replyPrompt.trim()
                      ? 'bg-[#0D0F12] text-gray-600 border border-[#252830]'
                      : 'bg-[#6366F1] hover:bg-[#6366F1]/90 text-white border border-[#6366F1]'
                  }`}
                >
                  {isGeneratingReply ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-[#22D3EE]" />
                      Formulating response (1.5s delay simulation)...
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      Synthesise AI Reply Draft
                    </>
                  )}
                </button>
              </div>

              {/* Editable Reply Box */}
              {(isGeneratingReply || replyDraft) && (
                <div 
                  id="drafted-reply-card"
                  className="bg-[#161920] border-2 border-[#6366F1]/30 rounded-md p-5 flex flex-col gap-4 animate-fade-in relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#6366F1]"></div>
                  
                  <div className="flex items-center justify-between border-b border-[#252830] pb-2 select-none">
                    <span className="text-[10px] font-mono text-[#22D3EE] font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={12} className="animate-pulse" />
                      AI Reply Active Draft
                    </span>
                    <button 
                      onClick={() => setReplyDraft(replyDraft)} 
                      className="text-[9px] font-mono text-gray-400 hover:text-white flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <RefreshCw size={10} /> Regen
                    </button>
                  </div>

                  {isGeneratingReply ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 select-none">
                      <Loader2 size={24} className="animate-spin text-[#22D3EE]" />
                      <span className="text-xs font-mono text-gray-500">Drafting personalized response from context...</span>
                    </div>
                  ) : (
                    <textarea
                      id="reply-draft-textarea"
                      rows={8}
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      className="w-full bg-transparent border-0 resize-none focus:ring-0 focus:outline-hidden text-xs text-gray-200 leading-relaxed font-sans select-text select-all-target selection:bg-[#6366F1]/40"
                    />
                  )}

                  <div className="flex justify-between select-none">
                    <button
                      id="btn-discard-reply"
                      onClick={() => handleDiscardSimulation('reply')}
                      className="border border-[#252830] hover:bg-white/5 px-4 py-2 rounded-md font-mono text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
                    >
                      Discard
                    </button>
                    <button
                      id="btn-send-reply"
                      onClick={() => handleSendSimulation('reply')}
                      className="bg-[#6366F1] hover:bg-[#6366F1]/90 text-white px-4 py-2 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Send size={12} /> Send Reply
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
