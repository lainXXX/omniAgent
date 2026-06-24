package top.javarem.omni.strategy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import top.javarem.omni.model.chat.ChatCompletionChunk;

/**
 * SSE 数据编码器 — 将 ChatCompletionChunk 序列化为 JSON 字符串
 *
 * <p>注意：不添加 {@code data: } 前缀和 {@code \n\n} 后缀。</p>
 * <p>Spring Boot WebFlux 的 {@code ServerSentEventHttpMessageWriter} 在输出
 * {@code Flux<String>} + {@code text/event-stream} 时，会自动为每个元素添加
 * {@code data: } 前缀和 {@code \n\n} 后缀。如果编码器再重复添加，会出现双前缀问题。</p>
 *
 * <p>输出链路：</p>
 * <pre>
 *   JSON String → Spring SSE Writer → data: {json}\n\n
 *   "[DONE]"   → Spring SSE Writer → data: [DONE]\n\n
 * </pre>
 */
@Slf4j
@Component
public class SseChunkEncoder {

    private final ObjectMapper objectMapper;

    public SseChunkEncoder() {
        this.objectMapper = new ObjectMapper();
        this.objectMapper.configure(SerializationFeature.FAIL_ON_EMPTY_BEANS, false);
        this.objectMapper.setSerializationInclusion(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL);
    }

    /**
     * 将 Chunk 序列化为 JSON 字符串，不含 SSE 框架标记。
     * Spring Boot 的 SSE 编解码器会在输出层自动添加 {@code data: } 前缀。
     */
    public String encode(ChatCompletionChunk chunk) {
        try {
            return objectMapper.writeValueAsString(chunk);
        } catch (Exception e) {
            log.error("[SseEncoder] JSON 编码失败", e);
            return "{\"error\":\"编码失败\"}";
        }
    }

    /**
     * 流结束标记，不含 SSE 框架标记。
     * Spring Boot 在输出时自动包装为 {@code data: [DONE]\n\n}。
     */
    public String done() {
        return "[DONE]";
    }
}
