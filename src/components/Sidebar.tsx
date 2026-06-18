import React from 'react';
import { Inbox, Sparkles, PenSquare, LayoutGrid, Newspaper, Terminal, LogIn, LogOut, RefreshCw } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAuthenticated?: boolean | null;
  userEmail?: string;
  onLogin?: () => void;
  onLogout?: () => void;
  onSync?: (type: 'full' | 'incremental') => void;
  syncStatus?: string;
}

export default function Sidebar({ activeTab, setActiveTab, isAuthenticated, userEmail, onLogin, onLogout, onSync, syncStatus }: SidebarProps) {
  const navItems = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'chat', label: 'AI Chat Agent', icon: Sparkles },
    { id: 'compose', label: 'Compose with AI', icon: PenSquare },
    { id: 'categories', label: 'Categories Zoom', icon: LayoutGrid },
    { id: 'newsletters', label: 'Newsletter Digest', icon: Newspaper },
  ];

  return (
    <div 
      id="main-sidebar"
      className="w-[60px] h-screen bg-[#161920] border-r border-[#252830] flex flex-col items-center py-4 justify-between shrink-0 select-none"
    >
      {/* Top Brand Indicator */}
      <div className="flex flex-col items-center gap-6 w-full">
        <div 
          id="brand-logo" 
          className="w-10 h-10 rounded-lg bg-linear-to-br from-[#6366F1] to-[#22D3EE] flex items-center justify-center text-white"
          title="Gmail AI Intelligence"
        >
          <Terminal size={18} className="text-[#0D0F12]" />
        </div>

        {/* Navigation Elements */}
        <nav className="flex flex-col gap-3 w-full px-2" id="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <div 
                key={item.id} 
                className="relative group flex justify-center"
              >
                <button
                  id={`nav-btn-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-10 h-10 rounded-md flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-[#6366F1]/15 text-[#22D3EE] border border-[#6366F1]/30'
                      : 'text-gray-400 hover:bg-[#252830] hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                </button>

                {/* Left Sidebar hover tooltips */}
                <span 
                  id={`tooltip-${item.id}`}
                  className="absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium font-sans text-gray-200 bg-[#161920] border border-[#252830] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-50 shadow-xl"
                >
                  {item.label}
                </span>
              </div>
            );
          })}

          {/* Sync button */}
          {isAuthenticated && onSync && (
            <div className="relative group flex justify-center mt-2 pt-2 border-t border-[#252830]">
              <button
                id="nav-btn-sync"
                onClick={() => onSync('incremental')}
                disabled={syncStatus === 'syncing'}
                className={`w-10 h-10 rounded-md flex items-center justify-center transition-all duration-200 cursor-pointer ${
                  syncStatus === 'syncing'
                    ? 'bg-[#22D3EE]/10 text-[#22D3EE] animate-pulse'
                    : 'text-gray-400 hover:bg-[#252830] hover:text-white'
                }`}
              >
                <RefreshCw size={18} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              </button>
              <span className="absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium font-sans text-gray-200 bg-[#161920] border border-[#252830] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-50 shadow-xl">
                {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Gmail'}
              </span>
            </div>
          )}
        </nav>
      </div>

      {/* Footer: Auth Status */}
      <div className="flex flex-col items-center gap-3 mb-2">
        {isAuthenticated === false && onLogin && (
          <div className="relative group flex justify-center">
            <button
              id="btn-login"
              onClick={onLogin}
              className="w-8 h-8 rounded-full bg-[#6366F1] flex items-center justify-center text-white cursor-pointer hover:bg-[#6366F1]/80 transition-colors"
            >
              <LogIn size={14} />
            </button>
            <span className="absolute left-14 bottom-1 px-2.5 py-1 text-xs font-mono text-gray-300 bg-[#161920] border border-[#252830] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-50">
              Connect Gmail
            </span>
          </div>
        )}

        {isAuthenticated && (
          <>
            <div className="relative group flex justify-center">
              <div 
                id="user-status-avatar"
                className="w-8 h-8 rounded-full bg-[#252830] border border-[#22D3EE]/30 flex items-center justify-center text-[10px] font-bold text-[#22D3EE] font-mono"
              >
                {userEmail?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="absolute left-14 bottom-1 px-2.5 py-1 text-xs font-mono text-gray-300 bg-[#161920] border border-[#252830] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-50">
                {userEmail || 'Connected'}
              </span>
            </div>

            {onLogout && (
              <div className="relative group flex justify-center">
                <button
                  id="btn-logout"
                  onClick={onLogout}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-gray-500 cursor-pointer hover:text-red-400 transition-colors"
                >
                  <LogOut size={12} />
                </button>
                <span className="absolute left-14 bottom-1 px-2.5 py-1 text-xs font-mono text-gray-300 bg-[#161920] border border-[#252830] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-50">
                  Sign Out
                </span>
              </div>
            )}
          </>
        )}

        {isAuthenticated === null && (
          <div className="relative group flex justify-center">
            <div 
              id="user-status-avatar"
              className="w-8 h-8 rounded-full bg-[#252830] border border-gray-600 flex items-center justify-center text-[10px] font-bold text-gray-300 font-mono"
            >
              DEV
            </div>
            <span 
              id="user-tooltip"
              className="absolute left-14 bottom-1 px-2.5 py-1 text-xs font-mono text-gray-300 bg-[#161920] border border-[#252830] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-50"
            >
              Gmail AI Intelligence
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
