import React, { useState } from 'react';
import { Email, EmailCategory } from '../types';
import { getCategoryStyles } from './InboxView';
import { Mail, Calendar, User, Eye, Check, Activity, BarChart2, Star, FileText } from 'lucide-react';

interface CategoriesViewProps {
  emails: Email[];
  setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  onViewEmailInInbox: (email: Email) => void;
}

export default function CategoriesView({ emails, setEmails, onViewEmailInInbox }: CategoriesViewProps) {
  const categories: EmailCategory[] = ['Job', 'Work', 'Newsletter', 'Finance', 'Personal', 'Notification'];
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory>('Job');

  // Compute live stats
  const stats = categories.reduce((acc, cat) => {
    const total = emails.filter((e) => e.category === cat).length;
    const unread = emails.filter((e) => e.category === cat && !e.read).length;
    acc[cat] = { total, unread };
    return acc;
  }, {} as Record<EmailCategory, { total: number; unread: number }>);

  // Filtered emails
  const filteredCategoryEmails = emails.filter((e) => e.category === selectedCategory);

  // Toggle read status
  const handleToggleRead = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEmails((prev) =>
      prev.map((item) => (item.id === emailId ? { ...item, read: !item.read } : item))
    );
  };

  const maxTotalCount = Math.max(...categories.map((c) => stats[c].total), 1);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0D0F12] p-6 text-gray-200">
      
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full gap-5">
        
        {/* Header Stats Title */}
        <div className="flex items-center justify-between border-b border-[#252830] pb-3 shrink-0 select-none">
          <div>
            <h1 className="text-base font-sans font-semibold text-white tracking-tight flex items-center gap-2">
              <Activity size={18} className="text-[#22D3EE]" />
              Automated Categories & Analysis
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              AI classified pipelines with real-time stats overview.
            </p>
          </div>
          <div className="text-xs text-gray-400 font-mono">
            Total Classified: {emails.length} Emails
          </div>
        </div>

        {/* STATS BAR: GRAPHICAL HORIZONTAL BAR CHART */}
        <div 
          id="category-stats-chart"
          className="bg-[#161920] border border-[#252830] rounded-md p-5 flex flex-col gap-4 shrink-0 select-none"
        >
          <div className="flex items-center gap-1.5 text-xs text-white font-mono font-bold uppercase tracking-wider">
            <BarChart2 size={14} className="text-[#6366F1]" />
            Category Distribution & Status
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((cat) => {
              const categoryStat = stats[cat];
              const styles = getCategoryStyles(cat);
              const heightPercent = `${(categoryStat.total / maxTotalCount) * 100}%`;

              return (
                <div 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex flex-col gap-2 p-3 rounded-md border transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#161920] border-[#6366F1] shadow-md shadow-[#6366F1]/5'
                      : 'bg-[#0D0F12]/60 border-[#252830] hover:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-gray-400 font-bold">{cat}</span>
                    <span className="text-[#22D3EE] font-semibold">{categoryStat.total}</span>
                  </div>

                  {/* Visual Bar element representation */}
                  <div className="h-10 bg-[#0D0F12] rounded-full overflow-hidden flex items-end">
                    <div 
                      className={`w-full rounded-full transition-all duration-500 ${styles.dot}`}
                      style={{ height: heightPercent }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[9px] font-mono text-gray-500 mt-1">
                    <span>Unread</span>
                    <span className={categoryStat.unread > 0 ? 'text-[#22D3EE]' : 'text-gray-600'}>
                      {categoryStat.unread}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* HORIZONTAL ZOOM IN TABS */}
        <div className="flex gap-2.5 overflow-x-auto pb-1 shrink-0 border-b border-[#252830] select-none" id="category-zoom-tabs">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            const badge = stats[cat];
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 text-xs font-mono font-medium rounded-t-md border-t border-x transition-colors cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#161920] border-[#252830] text-[#22D3EE] font-bold border-b-[#161920]'
                    : 'bg-transparent border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${getCategoryStyles(cat).dot}`} />
                {cat}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#111319] text-gray-500">
                  {badge.total}
                </span>
              </button>
            );
          })}
        </div>

        {/* GRID OF MAILCARDS FILTERED BY ACTIVE SELECTION */}
        <div className="flex-1 overflow-y-auto" id="filtered-category-grid-container">
          {filteredCategoryEmails.length === 0 ? (
            <div className="p-12 text-center text-gray-500 font-sans text-sm">
              All cleaned up! No emails filed under {selectedCategory} tab.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCategoryEmails.map((email) => {
                const styles = getCategoryStyles(email.category);
                return (
                  <div
                    key={email.id}
                    id={`grid-email-${email.id}`}
                    className={`bg-[#161920] border rounded-md p-4 flex flex-col justify-between gap-3 relative transition-all group ${
                      email.read 
                        ? 'border-[#252830] hover:border-gray-700' 
                        : 'border-[#22D3EE]/40 shadow-inner hover:border-[#22D3EE]'
                    }`}
                  >
                    {/* Header: Sender & Date */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#0D0F12] border border-[#252830] flex items-center justify-center">
                          <User size={11} className="text-gray-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-sans font-bold text-white tracking-tight truncate max-w-[150px]">
                            {email.sender}
                          </span>
                          <span className="text-[9px] font-mono text-gray-500 truncate max-w-[150px]">
                            {email.senderEmail}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">{email.time}</span>
                    </div>

                    {/* Main content body */}
                    <div className="flex flex-col gap-1.5 select-text selection:bg-[#6366F1]/30">
                      <h4 className="text-xs font-semibold text-white leading-tight line-clamp-1">
                        {email.subject}
                      </h4>
                      <p className="text-[11px] text-gray-400 font-sans line-clamp-2 leading-relaxed">
                        {email.snippet}
                      </p>
                    </div>

                    {/* AI Insight Box inside Grid item */}
                    <div className="bg-[#0D0F12]/80 border border-[#252830] p-2 rounded-md flex items-start gap-1.5">
                      <FileText size={12} className="text-[#22D3EE] shrink-0 mt-0.5" />
                      <div className="text-[10px] text-gray-300 font-sans leading-normal select-text">
                        <strong className="text-[#22D3EE] font-mono text-[8px] tracking-wider uppercase mr-1">AI INSIGHT:</strong>
                        {email.aiSummary}
                      </div>
                    </div>

                    {/* Actions and Status controls */}
                    <div className="flex items-center justify-between border-t border-[#252830] pt-2.5 mt-1 select-none">
                      <button
                        onClick={(e) => handleToggleRead(email.id, e)}
                        className={`text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors ${
                          email.read 
                            ? 'text-gray-500 hover:text-gray-200' 
                            : 'text-[#22D3EE] hover:text-[#22D3EE]/80'
                        }`}
                      >
                        <Check size={11} />
                        {email.read ? 'Completed (Read)' : 'Mark Completed'}
                      </button>

                      <button
                        onClick={() => onViewEmailInInbox(email)}
                        className="bg-[#6366F1]/10 hover:bg-[#6366F1] text-white font-mono text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded border border-[#6366F1]/30 hover:border-[#6366F1] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                      >
                        <Eye size={10} />
                        View Full Thread
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
