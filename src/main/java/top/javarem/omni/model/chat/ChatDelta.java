package top.javarem.omni.model.chat;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * SSE Delta 内容 — 表示本次 Chunk 增量数据
 *
 * <p>三种 Delta 类型互斥或共存：</p>
 * <ul>
 *   <li>{@code content} — 正文文本增量（当 {@code finish_reason = null} 时持续追加）</li>
 *   <li>{@code reasoning_content} — 推理过程增量（仅支持推理内容的模型，如 DeepSeek）</li>
 *   <li>{@code tool_calls} — 工具调用指令（当 {@code finish_reason = "tool_calls"} 时出现）</li>
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatDelta {

    /** 角色标识，通常为 "assistant"，首条 Delta 含此字段 */
    private String role;

    /** 正文内容增量，前端逐块累加后得到完整 Markdown 文本 */
    private String content;

    /** 推理内容增量（仅 DeepSeek 等支持推理过程的模型），与 content 互斥 */
    @JsonProperty("reasoning_content")
    private String reasoningContent;

    /** 工具调用列表，模型请求执行工具时出现 */
    @JsonProperty("tool_calls")
    private List<ToolCall> toolCalls;
}
