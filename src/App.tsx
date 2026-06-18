import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import InboxView from './components/InboxView';
import AIChatAgent from './components/AIChatAgent';
import ComposeView from './components/ComposeView';
import CategoriesView from './components/CategoriesView';
import NewsletterDigest from './components/NewsletterDigest';

import { DUMMY_EMAILS, DUMMY_CHAT_HISTORY } from './dummyData';
import { Email, ChatSession, NewsletterItem } from './types';
import * as api from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('inbox');
  const [emails, setEmails] = useState<Email[]>(DUMMY_EMAILS);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(DUMMY_CHAT_HISTORY);
  const [newsletters, setNewsletters] = useState<NewsletterItem[]>([]);
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Cross-view contextual state for replying
  const [replyContextEmail, setReplyContextEmail] = useState<Email | null>(null);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const session = await api.getAuthSession();
      setIsAuthenticated(session.authenticated);
      if (session.authenticated) {
        setUserEmail(session.email);
        loadEmails();
      }
    } catch {
      setIsAuthenticated(false);
    }
  }

  async function handleLogin() {
    try {
      const { url } = await api.getAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error('Failed to get auth URL:', err);
    }
  }

  async function handleLogout() {
    await api.logout();
    setIsAuthenticated(false);
    setUserEmail('');
    setEmails(DUMMY_EMAILS);
  }

  async function handleSync(type: 'full' | 'incremental' = 'incremental') {
    try {
      setSyncStatus('syncing');
      await api.startSync(type);
      
      // Poll sync status and progressively load emails as they arrive
      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getSyncStatus();
          // Refresh inbox on every poll so emails appear progressively
          await loadEmails();
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);
            setSyncStatus(status.status);
          }
        } catch {
          clearInterval(pollInterval);
          setSyncStatus('failed');
        }
      }, 5000);
    } catch (err) {
      setSyncStatus('failed');
    }
  }

  async function loadEmails() {
    try {
      setIsLoading(true);
      const result = await api.getThreads({ pageSize: 50 });
      if (result.threads && result.threads.length > 0) {
        setEmails(result.threads);
      }
    } catch (err) {
      console.error('Failed to load emails:', err);
      // Keep dummy data as fallback
    } finally {
      setIsLoading(false);
    }
  }

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
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onSync={handleSync}
        syncStatus={syncStatus}
      />

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
            isAuthenticated={isAuthenticated === true}
          />
        )}

        {activeTab === 'compose' && (
          <ComposeView 
            emails={emails} 
            replyContextEmail={replyContextEmail}
            clearReplyContext={clearReplyContext}
            isAuthenticated={isAuthenticated === true}
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
            isAuthenticated={isAuthenticated === true}
          />
        )}
      </main>
    </div>
  );
}
