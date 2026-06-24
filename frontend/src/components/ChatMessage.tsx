import { memo } from 'react';
import { Message } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatMessageProps {
  message: Message;
  streamingBlockId?: string | null;
  isStreaming?: boolean;
}

function displayToolName(name: string): string {
  return name.replace(/(Tool)?Config$/, '');
}

/** 提取工具调用的展示文本：Skill 只显示 skillName，其他显示完整命令 */
function getToolDisplayText(toolName: string | undefined, toolInput: string | undefined): string {
  if (!toolInput) return '';
  const name = displayToolName(toolName || '');
  try {
    const parsed = JSON.parse(toolInput);
    if (name === 'Skill') return parsed.skillName || parsed.name || '';
    const val = Object.values(parsed).find(v => typeof v === 'string');
    if (val) return val;
  } catch { /* not JSON */ }
  return toolInput;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  streamingBlockId,
  isStreaming,
}: ChatMessageProps) {

  // 如果没有 blocks，只渲染用户消息
  if (!message.blocks || message.blocks.length === 0) {
    return (
      <div className="flex gap-3 md:gap-4 py-4 md:py-6">
        <div className="w-7 h-7 md:w-8 md:h-8 rounded flex items-center justify-center shrink-0 border text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-100">
          U
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="text-sm md:text-[15px] text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  // 判断文本内容是否包含未完成的思考标签
  const combinedText = message.blocks
    .filter(b => b.type === 'text')
    .map(b => b.content)
    .join('');
  const hasIncompleteThink = combinedText.includes('<think>') && !combinedText.includes('</think>');

  return (
    <>
      {/* CSS for details[open] chevron rotation */}
      <style>{`
        .thought-details[open] .thought-chevron {
          transform: rotate(90deg);
        }
        .thought-details .thought-chevron {
          transition: transform 0.15s ease;
        }
      `}</style>

      <div className="flex gap-3 md:gap-4 py-4 md:py-6">
        {/* Avatar */}
        <div className="w-7 h-7 md:w-8 md:h-8 rounded flex items-center justify-center shrink-0 border text-[10px] font-bold bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
          AI
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-1 md:pt-1.5">
          {message.processingTimeMs != null && (
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-1 tabular-nums">
              处理耗时 {message.processingTimeMs < 1000 ? `${message.processingTimeMs}ms` : `${(message.processingTimeMs / 1000).toFixed(1)}s`}
            </div>
          )}
          <div className="relative border-l border-zinc-300 dark:border-zinc-800 ml-1.5 md:ml-2 pl-4 md:pl-6 space-y-4 md:space-y-6">
            {/* 按顺序渲染所有 blocks */}
            {message.blocks.map((block, idx) => {
              const isBlockStreaming = isStreaming && block.id === streamingBlockId;
              const isLastBlock = idx === (message.blocks?.length ?? 0) - 1;

              if (block.type === 'thought') {
                const hasTool = !!block.toolName;
                const isSkill = hasTool && displayToolName(block.toolName!) === 'Skill';
                const toolDisplay = hasTool ? getToolDisplayText(block.toolName, block.toolInput) : '';

                return (
                  <div key={block.id || `thought-${idx}`} className="relative">
                    {/* 时间线圆点 */}
                    <div className={`absolute w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-zinc-400 dark:bg-zinc-500 ring-2 md:ring-4 ring-white dark:ring-zinc-950 -left-5 md:-left-[30px] top-1.5 md:top-2 ${isBlockStreaming ? 'animate-pulse' : ''}`} />

                    <details className={`thought-details group ${
                      isBlockStreaming
                        ? hasTool ? 'ring-1 ring-zinc-400/30 dark:ring-zinc-600/30' : 'ring-1 ring-blue-500/30'
                        : ''
                    }`} open={isBlockStreaming || (isLastBlock && hasIncompleteThink)}>
                      <summary className={`flex items-center gap-2 cursor-pointer text-xs font-mono uppercase tracking-wide select-none list-none py-2 px-3 rounded-lg border transition-colors ${
                        hasTool
                          ? 'bg-zinc-50 dark:bg-zinc-900/70 border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-300'
                          : 'bg-zinc-100 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                      }`}>
                        <svg className="thought-chevron w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>

                        {hasTool ? (
                          /* 工具调用 */
                          <span className={`flex items-center gap-1.5 min-w-0 flex-1 normal-case ${
                            isBlockStreaming ? 'animate-pulse' : ''
                          }`}>
                            <span className="shrink-0">⚙ {displayToolName(block.toolName!)}</span>
                            {toolDisplay && (
                              <span className={`font-mono ${
                                isSkill ? 'text-xs' : 'text-[10px]'
                              } text-zinc-500/80 dark:text-zinc-400/80 truncate`}>
                                {toolDisplay}
                              </span>
                            )}
                          </span>
                        ) : (
                          /* 纯思考过程 */
                          <span className={isBlockStreaming ? 'text-blue-500 dark:text-blue-400 animate-pulse' : ''}>
                            THOUGHT
                          </span>
                        )}

                        {isBlockStreaming && (
                          <span className="ml-auto flex gap-1 shrink-0">
                            <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                              hasTool ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-blue-500 dark:bg-blue-400'
                            }`} style={{ animationDelay: '0ms' }} />
                            <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                              hasTool ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-blue-500 dark:bg-blue-400'
                            }`} style={{ animationDelay: '200ms' }} />
                            <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                              hasTool ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-blue-500 dark:bg-blue-400'
                            }`} style={{ animationDelay: '400ms' }} />
                          </span>
                        )}
                      </summary>
                      <div className={`mt-2 p-4 bg-zinc-50 dark:bg-zinc-900/70 rounded-lg border border-zinc-200 dark:border-zinc-700 font-mono text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap ${isBlockStreaming ? 'relative overflow-hidden' : ''}`}>
                        {block.content}
                        {isBlockStreaming && (
                          <span className="inline-block w-0.5 h-4 bg-blue-500 dark:bg-blue-400 ml-1 animate-pulse align-middle" />
                        )}
                        {isBlockStreaming && (
                          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-zinc-100/90 dark:from-zinc-900/90 to-transparent pointer-events-none" />
                        )}
                      </div>
                    </details>
                  </div>
                );
              }

              // text block - 渲染 Markdown
              return (
                <div key={block.id || `text-${idx}`} className="relative">
                  <div className={`absolute w-2 h-2 md:w-2.5 md:h-2.5 rounded-sm bg-emerald-500 ring-2 md:ring-4 ring-white dark:ring-zinc-950 -left-5 md:-left-[30px] top-1.5 md:top-2 ${isBlockStreaming ? 'animate-pulse' : ''}`} />
                  <div className="prose prose-zinc prose-sm max-w-none dark:prose-invert">
                    <MarkdownRenderer content={block.content} />
                    {isBlockStreaming && (
                      <span className="inline-block w-0.5 h-4 bg-emerald-500 ml-1 animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
});
