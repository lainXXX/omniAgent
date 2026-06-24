package top.javarem.omni.model.chat;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 统一工具调用结构 — 与 OpenAI-Compatible tool_calls 格式对齐
 *
 * <p>当模型决定调用工具时，在 Delta 中下发此结构。
 * 前端根据 {@code function.name} 显示工具名称，根据 {@code finish_reason = "tool_calls"} 判断工具调用阶段。</p>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ToolCall {

    /** 在单次工具调用列表中的序号 */
    private Integer index;

    /** 工具调用 ID，用于后续 tool_result 回传时的匹配 */
    private String id;

    /** 工具类型，固定为 "function" */
    private String type;

    /** 工具函数信息（名称 + 参数 JSON） */
    private ToolCallFunction function;
}
