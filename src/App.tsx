import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import InboxView from './components/InboxView';
import AIChatAgent from './components/AIChatAgent';
import ComposeView from './components/ComposeView';
import CategoriesView from './components/CategoriesView';
import NewsletterDigest from './components/NewsletterDigest';

import { DUMMY_EMAILS, DUMMY_CHAT_HISTORY, DUMMY_NEWSLETTERS } from './dummyData';
import { Email, ChatSession, NewsletterItem } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('inbox');
  const [emails, setEmails] = useState<Email[]>(DUMMY_EMAILS);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(DUMMY_CHAT_HISTORY);
  const [newsletters] = useState<NewsletterItem[]>(DUMMY_NEWSLETTERS);
  
  // Cross-view contextual state for replying
  const [replyContextEmail, setReplyContextEmail] = useState<Email | null>(null);

  const handleComposeReplyWithAI = (email: Email) => {
    setReplyContextEmail(email);
    setActiveTab('compose');
  };

  const clearReplyContext = () => {
    setReplyContextEmail(null);
  };

  const handleViewEmailInInbox = (email: Email) => {
    // We update emails locally if needed, e.g. mark read
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
    );
    // Switch tab
    setActiveTab('inbox');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0D0F12] font-sans antialiased">
      {/* 60px Left Icon Navigation Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Pane wrapper */}
      <main className="flex-1 h-screen overflow-hidden flex flex-col relative" id="main-content-canvas">
        {activeTab === 'inbox' && (
          <InboxView 
            emails={emails} 
            setEmails={setEmails}
            onComposeReply={handleComposeReplyWithAI} 
          />
        )}
        
        {activeTab === 'chat' && (
          <AIChatAgent 
            chatSessions={chatSessions}
            setChatSessions={setChatSessions} 
          />
        )}

        {activeTab === 'compose' && (
          <ComposeView 
            emails={emails} 
            replyContextEmail={replyContextEmail}
            clearReplyContext={clearReplyContext}
          />
        )}

        {activeTab === 'categories' && (
          <CategoriesView 
            emails={emails} 
            setEmails={setEmails}
            onViewEmailInInbox={handleViewEmailInInbox}
          />
        )}

        {activeTab === 'newsletters' && (
          <NewsletterDigest 
            newsletters={newsletters} 
          />
        )}
      </main>
    </div>
  );
}
