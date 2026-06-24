import { useState } from 'react';
import type { Question } from '../types';
import { skipQuestion as skipQuestionApi, submitQuestionAnswer as submitAnswerApi } from '../api/chat';

interface QuestionInlineProps {
  questionId: string;
  questions: Question[];
  onAnswered: (answerText: string) => void;
}

export function QuestionInline({ questionId, questions, onAnswered }: QuestionInlineProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const total = questions.length;
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === total - 1;
  const allAnswered = questions.every((q, i) => {
    const a = answers[i];
    if (!a) return false;
    if (Array.isArray(a)) {
      if (a.length === 0) return false;
      if (a.includes('__other__')) return !!otherTexts[i]?.trim();
      return true;
    }
    return a !== '__other__' || !!otherTexts[i]?.trim();
  });
  const hasPreview = questions[currentIdx]?.options.some(o => o.preview);

  const selectedOption = (qIdx: number): Question['options'][number] | undefined => {
    const value = answers[qIdx];
    if (!value || value === '__other__' || Array.isArray(value)) return undefined;
    return questions[qIdx]?.options.find(o => o.label === value);
  };

  const handleOptionClick = (qIdx: number, value: string, question: Question) => {
    if (question.multiSelect) {
      setAnswers((prev) => {
        const current = prev[qIdx];
        const arr = Array.isArray(current) ? current : [];
        const next = arr.includes(value)
          ? arr.filter(v => v !== value)
          : [...arr, value];
        return { ...prev, [qIdx]: next };
      });
    } else {
      setAnswers((prev) => ({ ...prev, [qIdx]: value }));
    }
  };

  const handleOtherClick = (qIdx: number, question: Question) => {
    if (question.multiSelect) {
      setAnswers((prev) => {
        const current = prev[qIdx];
        const arr = Array.isArray(current) ? current : [];
        const next = arr.includes('__other__')
          ? arr.filter(v => v !== '__other__')
          : [...arr, '__other__'];
        return { ...prev, [qIdx]: next };
      });
    } else {
      setAnswers((prev) => ({ ...prev, [qIdx]: '__other__' }));
    }
  };

  const serializeAnswer = (a: string | string[] | undefined, q: Question): string => {
    if (!a) return '(未选择)';
    if (Array.isArray(a)) {
      return a
        .map(v => (v === '__other__' ? otherTexts[questions.indexOf(q)] || '(未填写)' : v))
        .filter(Boolean)
        .join(', ') || '(未选择)';
    }
    return a === '__other__' ? otherTexts[questions.indexOf(q)] || '(未填写)' : a;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const answersMap: Record<string, string> = {};
    questions.forEach((q, i) => {
      answersMap[q.question] = serializeAnswer(answers[i], q);
    });

    try {
      await submitAnswerApi(questionId, answersMap);
    } catch (e) {
      console.error('Failed to submit answer:', e);
    }

    const lines: string[] = ['[用户回答]'];
    questions.forEach((q, i) => {
      lines.push(`${q.question}=${serializeAnswer(answers[i], q)}`);
    });

    onAnswered(lines.join('\n'));
  };

  const handleSkip = async () => {
    try {
      await skipQuestionApi(questionId);
    } catch (e) {
      console.error('Failed to skip:', e);
    }
    onAnswered('[用户跳过了问题]');
  };

  if (!questions.length) return null;

  const preview = hasPreview && !questions[currentIdx]?.multiSelect
    ? selectedOption(currentIdx)?.preview
    : undefined;

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* 步骤指示器 */}
        <div className="flex items-center gap-2">
          {questions.map((q, i) => {
            const answered = !!answers[i];
            const isCurrent = i === currentIdx;
            return (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={`w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center transition-colors ${
                  isCurrent
                    ? 'bg-blue-600 text-white ring-2 ring-blue-300 dark:ring-blue-700'
                    : answered
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-300 dark:border-zinc-700'
                }`}
              >
                {answered ? '✓' : i + 1}
              </button>
            );
          })}
        </div>

        {/* 当前问题 */}
        {(() => {
          const q = questions[currentIdx];
          const idx = currentIdx;
          const selPreview = preview;
          return (
            <div>
              {/* Header + step hint */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {q.header && (
                    <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-blue-400 text-xs font-semibold rounded">
                      {q.header}
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400">{currentIdx + 1}/{total}</span>
              </div>

              {/* Question text */}
              <p className="text-zinc-800 dark:text-zinc-200 font-medium mb-3">
                {q.question}
              </p>

              {/* Preview side-by-side layout */}
              <div className={selPreview ? 'flex gap-6' : ''}>
                <div className={selPreview ? 'flex-1 min-w-0' : ''}>
                  {/* Options */}
                  <div className="space-y-2">
                    {q.options.map((option, oIdx) => {
                      const value = option.label;
                      const isSelected = q.multiSelect
                        ? Array.isArray(answers[idx]) && (answers[idx] as string[]).includes(value)
                        : answers[idx] === value;
                      const showInlinePreview = isSelected && option.preview && !selPreview;
                      const isMulti = q.multiSelect;

                      return (
                        <div key={oIdx}>
                          <button
                            onClick={() => handleOptionClick(idx, value, q)}
                            className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-4 h-4 shrink-0 border-2 flex items-center justify-center ${
                                isMulti ? 'rounded' : 'rounded-full'
                              } ${
                                isSelected
                                  ? 'border-blue-500 dark:border-blue-400'
                                  : 'border-zinc-300 dark:border-zinc-600'
                              }`}>
                                {isSelected && (
                                  isMulti
                                    ? <span className="text-blue-500 dark:text-blue-400 text-[10px] font-bold">✓</span>
                                    : <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <span>{option.label}</span>
                                {option.description && (
                                  <p className="text-xs font-normal text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    {option.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>

                          {showInlinePreview && (
                            <div className="mt-2 mb-3 ml-7 p-3 bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-xs leading-relaxed whitespace-pre text-zinc-600 dark:text-zinc-400">
                              {option.preview}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Other button */}
                    {(() => {
                      const isOther = q.multiSelect
                        ? Array.isArray(answers[idx]) && (answers[idx] as string[]).includes('__other__')
                        : answers[idx] === '__other__';
                      return (
                        <button
                          onClick={() => handleOtherClick(idx, q)}
                          className={`w-full text-left px-4 py-3 rounded-lg border-2 border-dashed text-sm font-medium transition-colors ${
                            isOther
                              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-4 h-4 shrink-0 border-2 flex items-center justify-center ${
                              q.multiSelect ? 'rounded' : 'rounded-full'
                            } ${
                              isOther
                                ? 'border-blue-500 dark:border-blue-400'
                                : 'border-zinc-300 dark:border-zinc-600'
                            }`}>
                              {isOther && (
                                q.multiSelect
                                  ? <span className="text-blue-500 dark:text-blue-400 text-[10px] font-bold">✓</span>
                                  : <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                              )}
                            </span>
                            其他
                          </div>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Other text input */}
                  {(q.multiSelect
                    ? Array.isArray(answers[idx]) && (answers[idx] as string[]).includes('__other__')
                    : answers[idx] === '__other__'
                  ) && (
                    <div className="mt-3">
                      <input
                        type="text"
                        placeholder="请输入你的回答..."
                        value={otherTexts[idx] || ''}
                        onChange={(e) =>
                          setOtherTexts((prev) => ({ ...prev, [idx]: e.target.value }))
                        }
                        className="w-full max-w-md px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                {/* Preview panel (side-by-side) */}
                {selPreview && (
                  <div className="w-72 shrink-0 hidden md:block">
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-500 mb-2 uppercase tracking-wide">
                      Preview
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre text-zinc-700 dark:text-zinc-300">
                      {selPreview}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 导航 */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setCurrentIdx((i) => i - 1)}
            disabled={isFirst}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isFirst
                ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            ← 上一题
          </button>

          {!isLast ? (
            <button
              onClick={() => setCurrentIdx((i) => i + 1)}
              className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
            >
              下一题 →
            </button>
          ) : (
            <div />
          )}
        </div>

        {/* 操作：跳过 / 提交 */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            跳过
          </button>

          {allAnswered && !submitting && (
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-500 transition-colors"
            >
              提交回答
            </button>
          )}

          {submitting && (
            <span className="text-sm text-zinc-400">提交中...</span>
          )}
        </div>
      </div>
    </div>
  );
}
