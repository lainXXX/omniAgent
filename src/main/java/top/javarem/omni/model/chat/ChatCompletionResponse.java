package top.javarem.omni.model.chat;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 统一非流式响应 DTO
 *
 * <p>与 {@link ChatCompletionChunk} 共用字段风格，区别在于使用 {@link ChatMessage} 替代 Delta，
 * 因为非流式响应的完整文本是一次性返回的。</p>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatCompletionResponse {

    /** 响应 ID */
    private String id;

    /** 对象类型，固定为 "chat.completion" */
    @Builder.Default
    private String object = "chat.completion";

    /** 时间戳（秒级 Unix 时间戳） */
    private Long created;

    /** 模型名称 */
    private String model;

    /** 选择列表 */
    private List<ChatChoice> choices;

    /** 单个 Choice，封装消息内容和结束原因 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatChoice {
        private Integer index;
        private ChatMessage message;
        private String finishReason;
    }

    /** 完整消息内容（非流式响应使用） */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatMessage {
        private String role;
        private String content;
    }
}
