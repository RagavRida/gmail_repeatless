import React, { useState } from 'react';
import { NewsletterItem } from '../types';
import { Newspaper, HelpCircle, Layers, ExternalLink, Percent, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';

interface NewsletterDigestProps {
  newsletters: NewsletterItem[];
}

export default function NewsletterDigest({ newsletters }: NewsletterDigestProps) {
  const [onlyDeduplicated, setOnlyDeduplicated] = useState(false);

  const displayedItems = onlyDeduplicated
    ? newsletters.filter((item) => item.isDeduplicated)
    : newsletters;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0D0F12] p-6 text-gray-200">
      
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full gap-5">
        
        {/* Core Header */}
        <div className="flex items-center justify-between border-b border-[#252830] pb-3 shrink-0 select-none">
          <div>
            <h1 className="text-base font-sans font-semibold text-white tracking-tight flex items-center gap-2">
              <Newspaper size={18} className="text-[#22D3EE]" />
              AI Newsletter Pulse & Synthesis
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Multi-source cross-referencing and automatic news clustering.
            </p>
          </div>

          <div className="text-[10px] text-gray-500 font-mono">
            Analyzed: 3 subscriptions
          </div>
        </div>

        {/* CONTROLS BAR: DEDUPLICATION SWITCH */}
        <div 
          id="digest-controls-bar"
          className="bg-[#161920] border border-[#252830] rounded-md p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 select-none"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={13} className="text-[#22D3EE]" />
              Smart Deduplication Engine
            </span>
            <span className="text-[10px] text-gray-400">
              Isolate topics covered across multiple subscriptions to cancel noise.
            </span>
          </div>

          <button
            id="btn-deduplicated-toggle"
            onClick={() => setOnlyDeduplicated(!onlyDeduplicated)}
            className={`px-4 py-2 rounded-md font-mono text-xs font-semibold flex items-center gap-2.5 bg-[#0D0F12] border transition-all cursor-pointer ${
              onlyDeduplicated 
                ? 'border-[#22D3EE] text-[#22D3EE]'
                : 'border-[#252830] text-gray-400 hover:text-white'
            }`}
          >
            <span>Deduplicated Highlights Only</span>
            {onlyDeduplicated ? (
              <ToggleRight size={20} className="text-[#22D3EE]" />
            ) : (
              <ToggleLeft size={20} className="text-gray-600" />
            )}
          </button>
        </div>

        {/* LIST OF NEWS ITEMS */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4" id="digest-news-scroller">
          {displayedItems.length === 0 ? (
            <div className="p-12 text-center text-gray-500 font-sans text-sm">
              No articles match this active synthesis filter.
            </div>
          ) : (
            displayedItems.map((article) => {
              return (
                <div
                  key={article.id}
                  id={`article-${article.id}`}
                  className={`bg-[#161920] border rounded-md p-5 flex flex-col gap-3 relative transition-colors ${
                    article.isDeduplicated 
                      ? 'border-[#22D3EE]/30 bg-[#161920]/80' 
                      : 'border-[#252830] hover:border-gray-700'
                  }`}
                >
                  {/* Top indicators and deduplication chip code */}
                  <div className="flex items-center justify-between select-none">
                    <span className="text-[10px] font-mono text-gray-500 bg-[#0D0F12] px-2.5 py-0.5 rounded-full border border-gray-800">
                      Category: {article.category}
                    </span>

                    {/* DEDUPLICATION METRIC BADGE INDICATOR */}
                    {article.isDeduplicated ? (
                      <div className="flex items-center gap-1.5 bg-[#22D3EE]/15 border border-[#22D3EE]/30 text-[#22D3EE] px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider animate-pulse">
                        <Layers size={10} />
                        Deduplicated ({article.deduplicatedCount} publications)
                      </div>
                    ) : (
                      <span className="text-[9px] font-mono text-gray-600">
                        Single Editorial
                      </span>
                    )}
                  </div>

                  {/* Headline and synthesised summary selection text */}
                  <div className="flex flex-col gap-1.5 select-text selection:bg-[#22D3EE]/30">
                    <h3 className="text-sm font-sans font-bold text-white tracking-tight leading-snug hover:text-[#22D3EE] transition-colors cursor-pointer flex items-center gap-1">
                      {article.headline}
                      <ExternalLink size={10} className="text-gray-500 shrink-0" />
                    </h3>
                    <p className="text-xs text-gray-300 leading-relaxed font-sans">
                      {article.summary}
                    </p>
                  </div>

                  {/* SOURCES CHIP BAR GRID */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-[#252830] pt-3.5 mt-1 gap-2 select-none">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono text-gray-500 uppercase font-bold mr-1">
                        Synthesised Sources:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {article.sources.map((src, idx) => (
                          <span
                            key={idx}
                            className="bg-[#0D0F12] border border-[#252830] text-gray-400 hover:text-[#22D3EE] px-2 py-0.5 rounded-md text-[9px] font-mono tracking-wide"
                          >
                            {src}
                          </span>
                        ))}
                      </div>
                    </div>

                    <span className="text-[9px] font-mono text-[#22D3EE] flex items-center gap-1 select-none">
                      <Sparkles size={9} />
                      AI Summarized Report
                    </span>
                  </div>

                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}
