import type { ChatRequest, Question } from '../types';

export interface PendingApproval {
  ticketId: string;
  command: string;
}

const API_BASE = '/chat';

export interface StreamEvent {
  type: 'text' | 'thought' | 'dangerous-command' | 'ask-user-question' | 'tool-call' | 'round-end';
  id?: string;
  data?: string;
  ticketId?: string;
  command?: string;
  questionId?: string;
  conversationId?: string;
  questions?: unknown[];
  toolName?: string;
  toolInput?: string;
  thinkToolName?: string;
}

/**
 * 解析 OpenAI-Compatible SSE data: 行，提取 delta 内容
 */
function parseDeltaPayload(line: string): StreamEvent[] {
  const events: StreamEvent[] = [];

  try {
    const parsed = JSON.parse(line);
    const choices = parsed.choices;
    if (!choices || !choices.length) return events;

    const choice = choices[0];
    const delta = choice.delta || {};
    const finishReason = choice.finish_reason;
    const messageId = parsed.id || 'default';

    // 1. 推理内容
    if (delta.reasoning_content) {
      events.push({ type: 'thought', id: 'reasoning', data: delta.reasoning_content });
    }

    // 2. 工具调用
    if (delta.tool_calls && delta.tool_calls.length > 0) {
      for (const tc of delta.tool_calls) {
        events.push({
          type: 'tool-call',
          id: tc.id || messageId,
          toolName: tc.function?.name,
          toolInput: tc.function?.arguments,
        });
      }
    }

    // 3. 正文内容
    if (delta.content) {
      events.push({ type: 'text', id: messageId, data: delta.content });
    }

    // 4. finish_reason 标记 round 分隔
    // tool_calls 表示本轮工具调用的结束，下一轮交互开始
    if (finishReason === 'tool_calls') {
      events.push({ type: 'round-end' });
    }

  } catch {
    // 非 JSON 行忽略
  }

  return events;
}

export async function* streamChat(
  question: string,
  sessionId: string,
  workspace?: string,
  bypassApproval?: boolean,
  vendor?: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await fetch(`${API_BASE}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({
      question,
      sessionId,
      workspace,
      bypassApproval,
      vendor,
    } satisfies ChatRequest),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 处理 buffer 中完整的 data: 行
      const lines = buffer.split('\n');
      // 保留最后可能不完整的行
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;

        // 提取 data: 之后的实际负载（兼容 data:{...}、data: {...}、data:data:{...} 等）
        const payload = line.replace(/^(?:data:\s*)+/, '').trim();
        if (!payload) continue;

        // [DONE] 结束标记
        if (payload === '[DONE]') {
          return;
        }

        // JSON 负载
        if (payload.startsWith('{')) {
          const events = parseDeltaPayload(payload);
          for (const event of events) {
            yield event;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function checkPendingQuestions(): Promise<{
  hasQuestion: boolean;
  questionId: string | null;
  questions: Question[];
} | null> {
  try {
    const response = await fetch('/api/questions/pending', { credentials: 'include' });
    const data = await response.json();
    return data;
  } catch {
    return null;
  }
}

export async function checkPendingApprovals(): Promise<
  {
    ticketId: string;
    command: string;
    message: string;
  }[]
> {
  try {
    const response = await fetch('/approval/pending', { credentials: 'include' });
    return response.json();
  } catch {
    return [];
  }
}

export async function submitQuestionAnswer(
  questionId: string,
  answers: Record<string, string>,
  annotations?: Record<string, unknown>
): Promise<void> {
  await fetch(`/api/questions/${questionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ answers, annotations: annotations || {} }),
  });
}

export async function skipQuestion(questionId: string): Promise<void> {
  await fetch(`/api/questions/${questionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ skip: true, skipReason: 'User skipped' }),
  });
}

export async function submitApproval(
  ticketId: string,
  command: string,
  approved: boolean
): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ticketId, command, approved }),
  });
  return response.json();
}

/**
 * 连接审批事件 SSE 通道（实时推送）
 */
export function connectApprovalEvents(
  onDangerousCommand: (ticketId: string, command: string, message: string) => void
): { eventSource: EventSource; controller: AbortController } {
  const controller = new AbortController();
  const eventSource = new EventSource('/approval-events');

  eventSource.addEventListener('dangerous-command', (event) => {
    try {
      const data = JSON.parse(event.data);
      onDangerousCommand(data.ticketId, data.command, data.message);
    } catch (e) {
      console.error('Failed to parse dangerous-command event:', e);
    }
  });

  eventSource.onerror = (error) => {
    console.error('Approval events SSE error:', error);
  };

  return { eventSource, controller };
}
