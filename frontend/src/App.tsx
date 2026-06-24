import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ToolsSidebar } from './components/ToolsSidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { QuestionInline } from './components/QuestionInline';
import { CommandApprovalInline } from './components/CommandApprovalInline';
import { streamChat, checkPendingQuestions, connectApprovalEvents } from './api/chat';
import type { Conversation, Message, Question, ChatStep } from './types';

function ChatPage() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('omni-theme') || 'dark';
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [workspace, setWorkspace] = useState<string>(() => {
    return localStorage.getItem('omni-workspace') || '';
  });
  const [bypassApproval, setBypassApproval] = useState<boolean>(false);
  const [pendingQuestion, setPendingQuestion] = useState<{
    questionId: string;
    questions: Question[];
  } | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{
    ticketId: string;
    command: string;
    message: string;
  } | null>(null);
  const [streamingBlocks, setStreamingBlocks] = useState<ChatStep[]>([]);
  const [streamingBlockId, setStreamingBlockId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const approvalSseRef = useRef<{ eventSource: EventSource; controller: AbortController } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('omni-theme', next);
  };

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const startApprovalSse = useCallback(() => {
    if (approvalSseRef.current) return;
    const { eventSource, controller } = connectApprovalEvents((ticketId, command, message) => {
      setPendingApproval({ ticketId, command, message });
      setIsStreaming(false);
    });
    approvalSseRef.current = { eventSource, controller };
  }, []);

  const stopApprovalSse = useCallback(() => {
    if (approvalSseRef.current) {
      approvalSseRef.current.eventSource.close();
      approvalSseRef.current.controller.abort();
      approvalSseRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      try {
        const pending = await checkPendingQuestions();
        if (pending && pending.hasQuestion && pending.questionId && pending.questions.length > 0) {
          setPendingQuestion({
            questionId: pending.questionId,
            questions: pending.questions,
          });
          stopPolling();
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('omni-conversations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Conversation[];
        setConversations(parsed);
        if (parsed.length > 0) {
          setActiveId(parsed[0].id);
          setMessages(parsed[0].messages);
        }
      } catch (e) {
        console.error('Failed to load conversations:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('omni-conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  useEffect(() => {
    if (workspace) {
      localStorage.setItem('omni-workspace', workspace);
    } else {
      localStorage.removeItem('omni-workspace');
    }
  }, [workspace]);

  useEffect(() => {
    if (activeId !== null) {
      setConversations((convs) =>
        convs.map((c) => (c.id === activeId ? { ...c, bypassApproval } : c))
      );
    }
  }, [bypassApproval, activeId]);

  const handleNewChat = () => {
    const newConv: Conversation = {
      id: Date.now(),
      sessionId: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      bypassApproval: false,
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
    setMessages([]);
    setBypassApproval(false);
    setPendingQuestion(null);
  };

  const handleSelectChat = (id: number) => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setActiveId(id);
      setMessages(conv.messages);
      setBypassApproval(conv.bypassApproval ?? false);
      setWorkspace(conv.workspace ?? '');
      setPendingQuestion(null);
    }
  };

  const handleDeleteChat = (id: number) => {
    if (!confirm('确定要删除这个会话吗？')) return;
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (activeId === id) {
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
        setMessages(remaining[0].messages);
      } else {
        setActiveId(null);
        setMessages([]);
      }
    }
    if (remaining.length === 0) {
      localStorage.removeItem('omni-conversations');
    }
  };

  const handleRenameChat = (id: number, title: string) => {
    setConversations((convs) =>
      convs.map((c) => (c.id === id ? { ...c, title } : c))
    );
  };

  const handleSend = async (text: string) => {
    if (isStreaming || pendingQuestion) return;

    // 没有会话时自动创建
    let currentConvId = activeId;
    if (!activeConversation) {
      const newConv: Conversation = {
        id: Date.now(),
        sessionId: crypto.randomUUID(),
        title: 'New Chat',
        messages: [],
        createdAt: new Date().toISOString(),
        bypassApproval: false,
      };
      setConversations((prev) => [newConv, ...prev]);
      currentConvId = newConv.id;
      setActiveId(currentConvId);
      setMessages([]);
      setBypassApproval(false);
      setPendingQuestion(null);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const title = messages.length === 0 ? text.slice(0, 30) + (text.length > 30 ? '...' : '') : activeConversation?.title;

    setMessages((prev) => {
      const updated = [...prev, userMessage];
      setConversations((convs) =>
        convs.map((c) => (c.id === currentConvId ? { ...c, title, messages: updated } : c))
      );
      return updated;
    });

    setIsStreaming(true);
    setStreamingContent('');
    setStreamingBlocks([]);
    setPendingQuestion(null);
    setPendingApproval(null);
    startApprovalSse();
    startPolling();

    const startTime = performance.now();
    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    try {
      let fullContent = '';
      let roundIndex = 0;
      const thoughtBufferById: Record<string, string> = {};
      const textBufferById: Record<string, string> = {};
      const blocksLocal: ChatStep[] = [];
      setStreamingBlocks(blocksLocal);

      for await (const event of streamChat(text, activeConversation.sessionId, workspace, bypassApproval, undefined, abortController.signal)) {
        if (event.type === 'dangerous-command') {
          setIsStreaming(false);
          setPendingApproval({
            ticketId: event.ticketId!,
            command: event.command!,
            message: event.data || '危险命令待审批',
          });
          stopPolling();
          return;
        }

        // round 分隔：本轮结束，下一轮开始
        if (event.type === 'round-end') {
          roundIndex++;
          continue;
        }

        if (event.type === 'thought' && event.data) {
          fullContent += event.data;
          const id = `thought-${roundIndex}`;
          if (!thoughtBufferById[id]) {
            thoughtBufferById[id] = '';
          }
          thoughtBufferById[id] += event.data.replace(/^\n/, '');

          const existingThoughtIdx = blocksLocal.findIndex(b => b.type === 'thought' && b.id === id);
          if (existingThoughtIdx >= 0) {
            blocksLocal[existingThoughtIdx].content = thoughtBufferById[id];
          } else {
            blocksLocal.push({
              id,
              type: 'thought',
              content: thoughtBufferById[id],
              toolName: undefined,
            });
          }
          setStreamingBlockId(id);
          setStreamingBlocks([...blocksLocal]);
          setStreamingContent(fullContent);
        } else if (event.type === 'tool-call' && event.toolName) {
          fullContent += `\n[Tool: ${event.toolName}]\n`;
          const lastThought = blocksLocal.filter(b => b.type === 'thought').pop();
          if (lastThought) {
            lastThought.toolName = event.toolName;
            lastThought.toolInput = event.toolInput;
          }
          setStreamingBlocks([...blocksLocal]);
          setStreamingContent(fullContent);
        } else if (event.type === 'text' && event.data) {
          const id = `text-${roundIndex}`;
          if (!textBufferById[id]) {
            textBufferById[id] = '';
          }
          textBufferById[id] += event.data.replace(/^\n/, '');
          fullContent += event.data;

          const lastBlock = blocksLocal[blocksLocal.length - 1];
          if (lastBlock && lastBlock.type === 'text' && lastBlock.id === id) {
            lastBlock.content = textBufferById[id];
          } else {
            blocksLocal.push({
              id,
              type: 'text',
              content: textBufferById[id],
            });
          }
          setStreamingBlockId(id);
          setStreamingBlocks([...blocksLocal]);
          setStreamingContent(fullContent);
        }
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
        blocks: blocksLocal,
        processingTimeMs: Math.round(performance.now() - startTime),
      };

      setMessages((prev) => {
        const updated = [...prev, assistantMessage];
        setConversations((convs) =>
          convs.map((c) => (c.id === activeId ? { ...c, messages: updated } : c))
        );
        return updated;
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        console.log('Stream aborted by user');
      } else {
        console.error('Stream error:', e);
        setStreamingContent('Error: Failed to get response');
      }
    } finally {
      setIsStreaming(false);
      stopPolling();
      stopApprovalSse();
      streamAbortRef.current = null;
    }
  };

  const handleStopStreaming = useCallback(() => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const handleQuestionAnswered = (answerText: string) => {
    const answerMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: answerText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, answerMessage]);
    setPendingQuestion(null);
    startPolling();
  };

  const handleApprovalHandled = () => {
    setPendingApproval(null);
    setStreamingContent('');
  };

  return (
    <div className="flex h-full bg-white dark:bg-zinc-950">
      {leftSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setLeftSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed lg:relative z-40 h-full transition-transform duration-200 ${
          leftSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => {
            handleSelectChat(id);
            setLeftSidebarOpen(false);
          }}
          onNew={handleNewChat}
          onDelete={handleDeleteChat}
          onRename={handleRenameChat}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-4 md:px-6 py-3 md:py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLeftSidebarOpen(!leftSidebarOpen);
            }}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 rounded-lg transition-colors"
            title={leftSidebarOpen ? '隐藏侧边栏' : '显示侧边栏'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={leftSidebarOpen ? 'M11 19l-7-7 7-7' : 'M13 5l7 7-7 7'} />
            </svg>
          </button>
          <h1 className="text-base md:text-lg font-semibold text-zinc-900 dark:text-zinc-200 truncate">
            {activeConversation?.title || 'OmniAgent'}
          </h1>
          <div className="flex-1" />
          <button
            onClick={toggleTheme}
            className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !isStreaming && !streamingContent && !pendingQuestion && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-zinc-500 dark:text-zinc-500">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-zinc-400 dark:text-zinc-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-lg text-zinc-700 dark:text-zinc-300">Start a conversation with OmniAgent</p>
                <p className="text-sm mt-1 text-zinc-500 dark:text-zinc-500">Ask questions, search knowledge base, or request actions</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {isStreaming && streamingBlocks.length > 0 && (
            <ChatMessage
              message={{
                id: 'streaming',
                role: 'assistant',
                content: streamingContent,
                timestamp: Date.now(),
                blocks: streamingBlocks,
              }}
              streamingBlockId={streamingBlockId}
              isStreaming={isStreaming}
            />
          )}

          {isStreaming && !streamingContent && !pendingQuestion && (
            <div className="flex gap-2 sm:gap-3 p-3 sm:p-4">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                <span className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm font-semibold">AI</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">
                    OmniAgent
                  </span>
                  <span className="relative flex gap-1">
                    <span className="w-2 h-2 bg-blue-500 dark:bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-500 dark:bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-500 dark:bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="absolute inset-0 bg-blue-500/30 dark:bg-blue-500/30 rounded-full animate-ping opacity-75" />
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-600 animate-pulse">正在思考...</div>
              </div>
            </div>
          )}

          {pendingQuestion && (
            <div className="px-2 sm:px-4">
              <div className="flex gap-2 sm:gap-3 p-3 sm:p-4 bg-zinc-100 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 font-semibold text-xs sm:text-sm flex-shrink-0">
                  AI
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wide">
                    OmniAgent has a question
                  </div>
                  <QuestionInline
                    questionId={pendingQuestion.questionId!}
                    questions={pendingQuestion.questions}
                    onAnswered={handleQuestionAnswered}
                  />
                </div>
              </div>
            </div>
          )}

          {pendingApproval && (
            <div className="px-2 sm:px-4">
              <div className="flex gap-2 sm:gap-3 p-3 sm:p-4 bg-zinc-100 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 font-semibold text-xs sm:text-sm flex-shrink-0">
                  AI
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2 uppercase tracking-wide">
                    危险命令待审批
                  </div>
                  <CommandApprovalInline
                    ticketId={pendingApproval.ticketId}
                    command={pendingApproval.command}
                    message="此命令具有破坏性，需要你的确认才能执行"
                    onApproved={handleApprovalHandled}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || !!pendingApproval || !!pendingQuestion}
          isStreaming={isStreaming}
          onStop={handleStopStreaming}
          workspace={workspace}
          onWorkspaceChange={setWorkspace}
          bypassApproval={bypassApproval}
          onBypassApprovalChange={setBypassApproval}
        />
      </main>

      <ToolsSidebar />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}