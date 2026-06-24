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
 * MiniMax 策略实现
 *
 * <p>通过 Spring AI MiniMax ChatClient 接入 MiniMax 模型（如 M2.7）。
 * MiniMax 使用 OpenAI-Compatible 接口，因此处理逻辑与 Anthropic 基本一致。</p>
 *
 * <p>后续拓展方向：</p>
 * <ul>
 *   <li>如果 MiniMax 在 Delta 中返回 reasoning_content 字段，可像 DeepSeek 一样提取推理内容</li>
 *   <li>目前统一按标准 AssistantMessage 处理</li>
 * </ul>
 */
@Slf4j
@Component
public class MiniMaxChatStrategy implements ChatModelStrategy {

    @Resource
    @Qualifier("minimaxChatClient")
    private ChatClient minimaxChatClient;

    @Resource
    private ToolsManager toolsManager;

    @Override
    public String vendor() {
        return "minimax";
    }

    @Override
    public ChatCompletionResponse chat(ChatRequest request) {
        var allToolCallbacks = toolsManager.getToolCallbacks().toArray(new org.springframework.ai.tool.ToolCallback[0]);
        String content = minimaxChatClient.prompt()
                .user(request.getQuestion())
                .toolCallbacks(allToolCallbacks)
                .advisors(spec -> buildAdvisorSpec(spec, request))
                .toolContext(buildToolContext(request))
                .call()
                .content();

        return ChatCompletionResponse.builder()
                .id(UUID.randomUUID().toString())
                .created(System.currentTimeMillis() / 1000)
                .model("minimax")
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

            return minimaxChatClient.prompt()
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

                        // 工具调用：统一映射格式
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
                        log.error("[MiniMaxStrategy] 流式输出异常", ex);
                        return Flux.just(createChunk(UUID.randomUUID().toString(),
                                ChatDelta.builder().content("【系统错误】" + ex.getMessage()).build(),
                                "error"));
                    })
                    .doOnComplete(() -> log.info("[MiniMaxStrategy] 流式输出完成"));
        });
    }

    private static ChatCompletionChunk createChunk(String id, ChatDelta delta, String finishReason) {
        return ChatCompletionChunk.builder()
                .id(id)
                .created(System.currentTimeMillis() / 1000)
                .model("minimax")
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
