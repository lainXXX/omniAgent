package top.javarem.omni.model.chat;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 统一流式响应 Chunk — 遵循 OpenAI-Compatible 协议
 *
 * <p>序列化时通过 {@link com.fasterxml.jackson.annotation.JsonProperty} 将字段名映射为下划线风格，
 * 确保前端按 OpenAI SSE 协议解析时字段匹配。</p>
 *
 * <p>示例输出：</p>
 * <pre>
 * data: {"id":"xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}
 * </pre>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatCompletionChunk {

    /** 消息 ID，同一消息源的所有 Chunk 共享此 ID */
    private String id;

    /** 对象类型，固定为 "chat.completion.chunk" */
    @Builder.Default
    private String object = "chat.completion.chunk";

    /** 时间戳（秒级 Unix 时间戳） */
    private Long created;

    /** 模型名称（如 deepseek-v4-flash、claude-sonnet-4-6） */
    private String model;

    /** 系统指纹（由厂商提供，用于标识模型部署版本） */
    @JsonProperty("system_fingerprint")
    private String systemFingerprint;

    /** 选择列表（当前始终为单元素列表，index=0） */
    private List<ChatChoiceChunk> choices;
}
