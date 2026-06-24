import { useState, useRef, useEffect, useCallback, FormEvent, KeyboardEvent } from 'react';
import { TOOLS_TOGGLE_EVENT } from './ToolsSidebar';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  workspace?: string;
  onWorkspaceChange?: (ws: string) => void;
  bypassApproval?: boolean;
  onBypassApprovalChange?: (enabled: boolean) => void;
  isStreaming?: boolean;
  onStop?: () => void;
}

export function ChatInput({ onSend, disabled, workspace = '', onWorkspaceChange, bypassApproval = false, onBypassApprovalChange, isStreaming, onStop }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [selectingFolder, setSelectingFolder] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showWorkspace) return;
    const handleClick = (e: MouseEvent) => {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setShowWorkspace(false);
      }
    };
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [showWorkspace]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-2 sm:p-4 bg-gradient-to-t from-zinc-50 dark:from-zinc-950 via-zinc-50 dark:via-zinc-950 to-transparent">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 sm:px-3 py-2 shadow-2xl focus-within:border-blue-500 dark:focus-within:border-zinc-600 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message OmniAgent..."
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent border-none outline-none resize-none text-zinc-900 dark:text-zinc-200 text-sm placeholder-zinc-400 dark:placeholder-zinc-700 max-h-24 py-1 px-1 font-sans leading-relaxed"
          />
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/50">
            <div className="flex items-center gap-2">
              {/* Workspace Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowWorkspace(!showWorkspace)}
                  className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors max-w-[200px] ${
                    workspace
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30'
                      : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  title="Workspace 设置"
                >
                  {workspace ? (
                    <>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="truncate hidden sm:inline">{workspace}</span>
                      <span className="truncate sm:hidden">WS</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </>
                  )}
                </button>

                {/* Workspace Dropdown */}
                {showWorkspace && (
                  <div ref={wsDropdownRef} className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50">
                    <div className="p-3">
                      {workspace && (
                        <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 rounded mb-3">
                          {workspace}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={selectingFolder}
                        onClick={async () => {
                          setSelectingFolder(true);
                          try {
                            const res = await fetch('/api/workspace/dialog');
                            const data = await res.json();
                            if (data.path) {
                              onWorkspaceChange?.(data.path);
                              setShowWorkspace(false);
                            }
                          } catch {
                            // User cancelled or API error
                          } finally {
                            setSelectingFolder(false);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50"
                      >
                        {selectingFolder ? (
                          <span className="animate-pulse">打开中...</span>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            打开文件夹
                          </>
                        )}
                      </button>
                    </div>
                    {workspace && (
                      <div className="pb-2 px-3">
                        <button
                          onClick={() => { onWorkspaceChange?.(''); setShowWorkspace(false); }}
                          className="w-full text-xs text-zinc-500 dark:text-zinc-500 hover:text-blue-400 transition-colors text-center"
                        >
                          移除
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tools Button */}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(TOOLS_TOGGLE_EVENT))}
                className="p-1.5 text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                title="工具面板"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Bypass Approval Toggle */}
              <button
                type="button"
                onClick={() => onBypassApprovalChange?.(!bypassApproval)}
                className={`p-1.5 rounded transition-colors ${
                  bypassApproval
                    ? 'text-amber-400 hover:text-amber-300 bg-amber-500/20'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
                title={bypassApproval ? '已开启免审批模式（危险命令将自动执行）' : '开启免审批模式（危险命令无需审批）'}
              >
                {bypassApproval ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 11v4m4-4h4m-4 0h4m-5-4h1a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2v-4a2 2 0 012-2h6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
              </button>
            </div>
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="px-3 py-1 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                </svg>
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || disabled}
                className="px-3 py-1 rounded text-xs font-bold bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
