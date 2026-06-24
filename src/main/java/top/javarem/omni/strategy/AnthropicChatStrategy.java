package top.javarem.omni.strategy;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import top.javarem.omni.model.chat.*;
import top.javarem.omni.model.context.AdvisorContextConstants;
import top.javarem.omni.model.request.ChatRequest;
import top.javarem.omni.tool.ToolsManager;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Anthropic Claude 策略实现
 *
 * <p>通过 Spring AI Anthropic ChatClient 接入 Claude 系列模型。
 * 当前使用标准 {@link AssistantMessage} 处理文本和工具调用，暂不支持 reasoning_content 提取。</p>
 *
 * <p>后续拓展方向：</p>
 * <ul>
 *   <li>当 Spring AI Anthropic 支持 thinking content block 时，可从中提取推理内容</li>
 *   <li>或通过 response metadata 中的 "thinking" 字段提取（参考 ChatTestController）</li>
 * </ul>
 */
@Slf4j
@Component
public class AnthropicChatStrategy implements ChatModelStrategy {

    @Resource
    @Qualifier("anthropicChatClient")
    private ChatClient anthropicChatClient;

    @Resource
    private ToolsManager toolsManager;

    @Override
    public String vendor() {
        return "anthropic";
    }

    @Override
    public ChatCompletionResponse chat(ChatRequest request) {
        var allToolCallbacks = toolsManager.getToolCallbacks().toArray(new org.springframework.ai.tool.ToolCallback[0]);
        String content = anthropicChatClient.prompt()
                .user(request.getQuestion())
                .toolCallbacks(allToolCallbacks)
                .advisors(spec -> buildAdvisorSpec(spec, request))
                .toolContext(buildToolContext(request))
                .call()
                .content();

        return ChatCompletionResponse.builder()
                .id(UUID.randomUUID().toString())
                .created(System.currentTimeMillis() / 1000)
                .model("claude")
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

        return Flux.defer(() -> {
            String messageId = UUID.randomUUID().toString();

            return anthropicChatClient.prompt()
                    .user(request.getQuestion())
                    .toolCallbacks(allToolCallbacks)
                    .advisors(spec -> buildAdvisorSpec(spec, request))
                    .toolContext(buildToolContext(request))
                    .stream()
                    .chatResponse()
                    .filter(response -> response.getResult() != null && response.getResult().getOutput() != null)
                    .concatMap(response -> {
                        AssistantMessage output = response.getResult().getOutput();
                        List<ChatCompletionChunk> chunks = new ArrayList<>();

                        // 工具调用：将 Spring AI 的 AssistantMessage.ToolCall 映射为统一 ToolCall DTO
                        if (output.getToolCalls() != null && !output.getToolCalls().isEmpty()) {
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

                        // 正文内容逐块下发
                        String text = output.getText();
                        if (text != null && !text.isEmpty()) {
                            chunks.add(createChunk(messageId, ChatDelta.builder()
                                    .content(text)
                                    .build(), null));
                        }

                        return Flux.fromIterable(chunks);
                    })
                    .onErrorResume(ex -> {
                        log.error("[AnthropicStrategy] 流式输出异常", ex);
                        return Flux.just(createChunk(UUID.randomUUID().toString(),
                                ChatDelta.builder().content("【系统错误】" + ex.getMessage()).build(),
                                "error"));
                    })
                    .doOnComplete(() -> log.info("[AnthropicStrategy] 流式输出完成"));
        });
    }

    private static ChatCompletionChunk createChunk(String id, ChatDelta delta, String finishReason) {
        return ChatCompletionChunk.builder()
                .id(id)
                .created(System.currentTimeMillis() / 1000)
                .model("claude")
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

    private Map<String, Object> buildToolContext(ChatRequest request) {
        Map<String, Object> ctx = new HashMap<>();
        ctx.put(ChatMemory.CONVERSATION_ID, request.getSessionId());
        ctx.put(AdvisorContextConstants.USER_ID, "zzw");
        ctx.put(AdvisorContextConstants.WORKSPACE, request.getWorkspace() != null ? request.getWorkspace() : "");
        ctx.put(AdvisorContextConstants.BYPASS_APPROVAL, Boolean.TRUE.equals(request.getBypassApproval()));
        return ctx;
    }
}
