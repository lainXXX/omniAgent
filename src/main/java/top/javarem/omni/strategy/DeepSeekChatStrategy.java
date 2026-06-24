package top.javarem.omni.strategy;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.deepseek.DeepSeekAssistantMessage;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import top.javarem.omni.model.chat.ChatChoiceChunk;
import top.javarem.omni.model.chat.ChatCompletionChunk;
import top.javarem.omni.model.chat.ChatCompletionResponse;
import top.javarem.omni.model.chat.ChatDelta;
import top.javarem.omni.model.chat.ToolCall;
import top.javarem.omni.model.chat.ToolCallFunction;
import top.javarem.omni.model.context.AdvisorContextConstants;
import top.javarem.omni.model.request.ChatRequest;
import top.javarem.omni.tool.ToolsManager;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * DeepSeek 策略实现
 *
 * <p>核心差异点：</p>
 * <ul>
 *   <li>通过 {@link DeepSeekAssistantMessage#getReasoningContent()} 提取推理过程</li>
 *   <li>推理内容按句子边界分割后逐句下发，避免前端等待完整推理结束后才显示</li>
 *   <li>工具调用发流前先排空推理缓存，保证前端事件顺序正确</li>
 * </ul>
 *
 * <p>推理缓存（{@link StreamState}）：</p>
 * <ul>
 *   <li>将连续到达的 reasoning_content 片段缓冲到 {@code reasoningBuffer} 中</li>
 *   <li>检测到句子边界（。！？.!?\n）时按句分割输出</li>
 *   <li>切换工具调用或正文前强制排空缓存，避免推理内容被混合到正文中</li>
 * </ul>
 */
@Slf4j
@Component
public class DeepSeekChatStrategy implements ChatModelStrategy {

    @Resource
    @Qualifier("deepseekChatClient")
    private ChatClient deepseekChatClient;

    @Resource
    private ToolsManager toolsManager;

    @Override
    public String vendor() {
        return "deepseek";
    }

    @Override
    public ChatCompletionResponse chat(ChatRequest request) {
        var allToolCallbacks = toolsManager.getToolCallbacks().toArray(new org.springframework.ai.tool.ToolCallback[0]);
        String content = deepseekChatClient.prompt()
                .user(request.getQuestion())
                .toolCallbacks(allToolCallbacks)
                .advisors(spec -> buildAdvisorSpec(spec, request))
                .toolContext(buildToolContext(request))
                .call()
                .content();

        return ChatCompletionResponse.builder()
                .id(UUID.randomUUID().toString())
                .created(System.currentTimeMillis() / 1000)
                .model("deepseek")
                .choices(List.of(ChatCompletionResponse.ChatChoice.builder()
                        .index(0)
                        .message(ChatCompletionResponse.ChatMessage.builder()
                                .role("assistant")
                                .content(content)
                                .build())
                        .finishReason("stop")
                        .build()))
                .build();
    }

    @Override
    public Flux<ChatCompletionChunk> streamChat(ChatRequest request) {
        var allToolCallbacks = toolsManager.getToolCallbacks().toArray(new org.springframework.ai.tool.ToolCallback[0]);

        // Flux.defer 保证每次订阅创建独立的状态机，避免并发请求共享 StreamState
        return Flux.defer(() -> {
            StreamState state = new StreamState();
            String messageId = UUID.randomUUID().toString();

            return deepseekChatClient.prompt()
                    .user(request.getQuestion())
                    .toolCallbacks(allToolCallbacks)
                    .advisors(spec -> buildAdvisorSpec(spec, request))
                    .toolContext(buildToolContext(request))
                    .stream()
                    .chatResponse()
                    .filter(response -> response.getResult() != null && response.getResult().getOutput() != null)
                    // concatMap 保证严格顺序：先处理完当前 Response 的所有 Chunk 才处理下一个
                    .concatMap(response -> {
                        AssistantMessage output = (AssistantMessage) response.getResult().getOutput();
                        List<ChatCompletionChunk> chunks = new ArrayList<>();

                        // ===== 阶段 1：工具调用 =====
                        if (output.getToolCalls() != null && !output.getToolCalls().isEmpty()) {
                            // 切到工具调用前必须排空推理缓存，否则前端可能将推理内容混为工具名称
                            state.flushReasoning(chunks, messageId);
                            List<ToolCall> toolCalls = output.getToolCalls().stream()
                                    .map(tc -> ToolCall.builder()
                                            .index(0)
                                            .id(tc.id())
                                            .type("function")
                                            .function(ToolCallFunction.builder()
                                                    .name(tc.name())
                                                    .arguments(tc.arguments())
                                                    .build())
                                            .build())
                                    .collect(Collectors.toList());
                            chunks.add(createChunk(messageId, ChatDelta.builder()
                                    .toolCalls(toolCalls)
                                    .build(), "tool_calls"));
                            return Flux.fromIterable(chunks);
                        }

                        // ===== 阶段 2：推理内容（DeepSeek 专有） =====
                        if (output instanceof DeepSeekAssistantMessage dsMsg) {
                            String reasoning = dsMsg.getReasoningContent();
                            if (reasoning != null && !reasoning.isEmpty()) {
                                state.accumulateReasoning(reasoning, chunks, messageId);
                            }
                        }

                        // ===== 阶段 3：正文内容 =====
                        String text = output.getText();
                        if (text != null && !text.isEmpty()) {
                            // 正文发流前排空剩余推理缓存，保证前端先展示 reasoning 再展示 answer
                            state.flushReasoning(chunks, messageId);
                            chunks.add(createChunk(messageId, ChatDelta.builder()
                                    .content(text)
                                    .build(), null));
                        }

                        // 缓冲区积累过多且无标点可分割时强制整块发出
                        state.forceFlushReasoningIfNeeded(chunks, messageId);

                        return Flux.fromIterable(chunks);
                    })
                    .onErrorResume(ex -> {
                        log.error("[DeepSeekStrategy] 流式输出异常", ex);
                        return Flux.just(createChunk(UUID.randomUUID().toString(),
                                ChatDelta.builder().content("【系统错误】" + extractUserFriendlyMessage(ex)).build(),
                                "error"));
                    })
                    .doOnComplete(() -> log.info("[DeepSeekStrategy] 流式输出完成"));
        });
    }

    // ==================== 推理缓存状态机 ====================

    /**
     * 推理缓存状态机。
     *
     * <p>DeepSeek 的 reasoning_content 来自流式数据块，可能跨多次 concatMap 调用到达。
     * 此状态机缓存未完整的推理片段，在句子边界或切换事件类型时自动下发。</p>
     *
     * <p>阈值 {@code REASONING_FLUSH_THRESHOLD = 50}：当缓存超过 50 字符且无标点可切时强制发出，
     * 防止推理内容被无限期缓冲（极端情况下模型输出长段无标点内容）。</p>
     */
    private static class StreamState {
        private static final int REASONING_FLUSH_THRESHOLD = 50;
        private static final Pattern SENTENCE_BOUNDARY = Pattern.compile("[。！？.!?\\n]+");

        private final StringBuilder reasoningBuffer = new StringBuilder();

        /**
         * 累积推理增量，在句子边界自动分割并下发。
         * 分割后剩余的未完整句子保留在缓存中，等待下一个增量或 flush。
         */
        public void accumulateReasoning(String delta, List<ChatCompletionChunk> target, String messageId) {
            reasoningBuffer.append(delta);

            String buf = reasoningBuffer.toString();
            var matcher = SENTENCE_BOUNDARY.matcher(buf);
            int lastEnd = 0;
            while (matcher.find()) {
                int end = matcher.end();
                String segment = buf.substring(lastEnd, end).trim();
                if (!segment.isEmpty()) {
                    target.add(createChunk(messageId, ChatDelta.builder()
                            .reasoningContent(segment)
                            .build(), null));
                }
                lastEnd = end;
            }
            // 移除已发出的部分，保留尾部未完成句子的片段
            reasoningBuffer.delete(0, lastEnd);

            // 缓存超过阈值且无完整句子可切时强制作句末分割下发
            if (reasoningBuffer.length() > REASONING_FLUSH_THRESHOLD) {
                String forced = reasoningBuffer.toString();
                reasoningBuffer.setLength(0);
                target.add(createChunk(messageId, ChatDelta.builder()
                        .reasoningContent(forced)
                        .build(), null));
            }
        }

        /** 排空推理缓存。在切换到工具调用或正文前调用，保证事件顺序正确。 */
        public void flushReasoning(List<ChatCompletionChunk> target, String messageId) {
            if (reasoningBuffer.length() > 0) {
                target.add(createChunk(messageId, ChatDelta.builder()
                        .reasoningContent(reasoningBuffer.toString())
                        .build(), null));
                reasoningBuffer.setLength(0);
            }
        }

        /** 仅在缓存超过阈值时强制 flush，用于流结束前的兜底。 */
        public void forceFlushReasoningIfNeeded(List<ChatCompletionChunk> target, String messageId) {
            if (reasoningBuffer.length() > REASONING_FLUSH_THRESHOLD) {
                flushReasoning(target, messageId);
            }
        }
    }

    // ==================== 公共工具方法 ====================

    private static ChatCompletionChunk createChunk(String id, ChatDelta delta, String finishReason) {
        return ChatCompletionChunk.builder()
                .id(id)
                .created(System.currentTimeMillis() / 1000)
                .model("deepseek")
                .choices(List.of(ChatChoiceChunk.builder()
                        .index(0)
                        .delta(delta)
                        .finishReason(finishReason)
                        .build()))
                .build();
    }

    private void buildAdvisorSpec(ChatClient.AdvisorSpec spec, ChatRequest request) {
        spec.param(ChatMemory.CONVERSATION_ID, request.getSessionId())
                .param(AdvisorContextConstants.ENABLE_SKILL, true)
                .param(AdvisorContextConstants.USER_ID, "zzw")
                .param(AdvisorContextConstants.WORKSPACE, request.getWorkspace())
                .param(AdvisorContextConstants.BYPASS_APPROVAL, Boolean.TRUE.equals(request.getBypassApproval()));
    }

    private java.util.Map<String, Object> buildToolContext(ChatRequest request) {
        java.util.Map<String, Object> ctx = new java.util.HashMap<>();
        ctx.put(ChatMemory.CONVERSATION_ID, request.getSessionId());
        ctx.put(AdvisorContextConstants.USER_ID, "zzw");
        ctx.put(AdvisorContextConstants.WORKSPACE, request.getWorkspace() != null ? request.getWorkspace() : "");
        ctx.put(AdvisorContextConstants.BYPASS_APPROVAL, Boolean.TRUE.equals(request.getBypassApproval()));
        return ctx;
    }

    /**
     * 从异常堆栈中提取用户可读的错误信息。
     * 对不同 HTTP 状态码和网络异常进行友好提示，避免将原始异常信息直接暴露给用户。
     */
    private String extractUserFriendlyMessage(Throwable ex) {
        String msg = ex.getMessage();
        if (msg == null) return "API 请求失败，请稍后重试";
        if (msg.contains("429") || msg.contains("Too Many Requests"))
            return "API 请求过于频繁，请稍后重试（429 Too Many Requests）";
        if (msg.contains("529") || msg.contains("Unknown status code"))
            return "API 服务暂不可用，请稍后重试（529）";
        if (msg.contains("timeout") || msg.contains("Timeout"))
            return "API 请求超时，请检查网络或稍后重试";
        if (msg.contains("connection") || msg.contains("Connection"))
            return "网络连接失败，请检查网络后重试";
        if (msg.length() > 100) return msg.substring(0, 100) + "...";
        return msg;
    }
}
