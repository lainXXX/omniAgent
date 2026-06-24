package top.javarem.omni.controller;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import top.javarem.omni.model.chat.ChatCompletionResponse;
import top.javarem.omni.model.request.ChatRequest;
import top.javarem.omni.service.ChatService;

/**
 * AI Agent 流式交互控制器
 *
 * <p>职责边界：仅负责 HTTP 入参和响应出口。</p>
 * <ul>
 *   <li>不包含任何厂商专属解析逻辑（如 instanceof DeepSeekAssistantMessage）</li>
 *   <li>不直接调用 ChatClient，全部委托 {@link ChatService} 编排</li>
 *   <li>流式接口输出统一 OpenAI-Compatible SSE 格式（{@code data: {...}\n\n}）</li>
 * </ul>
 *
 * <p>厂商适配链路：</p>
 * <pre>
 *   ChatController → ChatService → ChatModelStrategyFactory → ChatModelStrategy
 *                                          ↓
 *                                SseChunkEncoder.encode()
 *                                          ↓
 *                                 data: {...}\n\n
 * </pre>
 */
@RestController
@RequestMapping("/chat")
@Slf4j
public class ChatController {

    @Resource
    private ChatService chatService;

    /**
     * 非流式同步调用。适用于一次性获取完整回复（测试、简单问答）。
     * 返回统一格式的 ChatCompletionResponse，不涉及 SSE 编码。
     */
    @PostMapping("/user/input")
    public ChatCompletionResponse chat(@RequestBody ChatRequest request) {
        log.info("[SYNC] 用户问题：{}", request.getQuestion());
        return chatService.chat(request);
    }

    /**
     * 流式输出接口。
     *
     * <p>统一使用 OpenAI-Compatible SSE 格式：</p>
     * <ul>
     *   <li>推理内容：{@code {choices:[{delta:{reasoning_content:"..."}}]}}</li>
     *   <li>正文内容：{@code {choices:[{delta:{content:"..."}}]}}</li>
     *   <li>工具调用：{@code {choices:[{delta:{tool_calls:[...]},finish_reason:"tool_calls"}]}}</li>
     *   <li>结束标记：{@code data: [DONE]}</li>
     * </ul>
     *
     * <p>前端按行读取，匹配 {@code data: } 前缀后解析 JSON。</p>
     */
    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> streamChat(@RequestBody ChatRequest request) {
        log.info("[USER] 用户问题：{}", request.getQuestion());
        return chatService.streamChat(request);
    }
}
