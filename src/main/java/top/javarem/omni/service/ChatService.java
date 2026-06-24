package top.javarem.omni.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import top.javarem.omni.model.chat.ChatCompletionChunk;
import top.javarem.omni.model.chat.ChatCompletionResponse;
import top.javarem.omni.model.request.ChatRequest;
import top.javarem.omni.strategy.ChatModelStrategy;
import top.javarem.omni.strategy.ChatModelStrategyFactory;
import top.javarem.omni.strategy.SseChunkEncoder;

/**
 * 聊天业务编排服务
 *
 * <p>严格遵循单一职责：只做编排，不包含具体 LLM 调用逻辑。</p>
 * <p>编排流程：</p>
 * <ol>
 *   <li>从 {@link ChatRequest#getVendor()} 或配置默认值确定厂商</li>
 *   <li>通过 {@link ChatModelStrategyFactory} 获取对应策略</li>
 *   <li>调用策略的 chat() / streamChat() 获取统一响应</li>
 *   <li>流式场景下将 Chunk 通过 {@link SseChunkEncoder} 编码为 SSE 格式</li>
 * </ol>
 */
@Slf4j
@Service
public class ChatService {

    private final ChatModelStrategyFactory strategyFactory;
    private final SseChunkEncoder sseChunkEncoder;
    private final String defaultVendor;

    public ChatService(ChatModelStrategyFactory strategyFactory,
                       SseChunkEncoder sseChunkEncoder,
                       @Value("${omni.provider.default:deepseek}") String defaultVendor) {
        this.strategyFactory = strategyFactory;
        this.sseChunkEncoder = sseChunkEncoder;
        this.defaultVendor = defaultVendor;
    }

    /**
     * 非流式调用，返回统一格式的 ChatCompletionResponse。
     * 适用于需要一次性获取完整回复的场景（如测试、简单问答）。
     */
    public ChatCompletionResponse chat(ChatRequest request) {
        ChatModelStrategy strategy = resolveStrategy(request);
        log.info("[ChatService] 非流式调用 vendor={}", strategy.vendor());
        return strategy.chat(request);
    }

    /**
     * 流式调用，返回 SSE 编码后的字符串 Flux。
     * 每个 Chunk 编码为 {@code data: {...}\n\n} 格式，流结束时追加 {@code data: [DONE]\n\n}。
     * 前端可直接按行解析，无需额外转码。
     */
    public Flux<String> streamChat(ChatRequest request) {
        ChatModelStrategy strategy = resolveStrategy(request);
        log.info("[ChatService] 流式调用 vendor={}", strategy.vendor());

        return strategy.streamChat(request)
                .map(sseChunkEncoder::encode)
                .concatWithValues(sseChunkEncoder.done());
    }

    /**
     * 流式调用，返回统一 Chunk Flux（跳过 SSE 编码）。
     * 供需要在服务端处理 Chunk 的场景使用（如日志、聚合、转发）。
     */
    public Flux<ChatCompletionChunk> streamChatRaw(ChatRequest request) {
        ChatModelStrategy strategy = resolveStrategy(request);
        return strategy.streamChat(request);
    }

    /**
     * 解析请求中的 vendor，为空时降级到默认配置。
     */
    private ChatModelStrategy resolveStrategy(ChatRequest request) {
        String vendor = request.getVendor();
        if (vendor == null || vendor.isBlank()) {
            vendor = defaultVendor;
        }
        return strategyFactory.getStrategy(vendor);
    }
}
