package top.javarem.omni.strategy;

import reactor.core.publisher.Flux;
import top.javarem.omni.model.chat.ChatCompletionChunk;
import top.javarem.omni.model.chat.ChatCompletionResponse;
import top.javarem.omni.model.request.ChatRequest;

/**
 * 大模型厂商策略接口
 *
 * <p>【策略模式】每个厂商实现独立策略，负责将厂商原生响应适配为统一 DTO。
 * Controller 层只依赖此接口，新增厂商时不修改 Controller。</p>
 *
 * <p>职责边界：</p>
 * <ul>
 *   <li>vendor() — 返回厂商标识，用于策略工厂路由</li>
 *   <li>chat() — 非流式调用的响应适配</li>
 *   <li>streamChat() — 流式调用的响应适配</li>
 * </ul>
 */
public interface ChatModelStrategy {

    /**
     * 厂商标识（如 deepseek, openai, anthropic, minimax）。
     * 用于 {@link ChatModelStrategyFactory} 自动路由，必须唯一且与配置文件 vendor 值对应。
     */
    String vendor();

    /**
     * 非流式调用：封装 ChatClient.call()，返回统一格式的非流式响应。
     *
     * @param request 用户请求（含 question, sessionId, vendor 等）
     * @return 统一非流式响应 DTO
     */
    ChatCompletionResponse chat(ChatRequest request);

    /**
     * 流式调用：封装 ChatClient.stream()，将厂商原生 Flux 适配为统一 Chunk 格式。
     * 每个厂商在此方法内处理其特有的 Message 子类型（如 DeepSeekAssistantMessage）。
     *
     * @param request 用户请求（含 question, sessionId, vendor 等）
     * @return 统一流式 Chunk Flux，由 {@link SseChunkEncoder} 编码为 SSE
     */
    Flux<ChatCompletionChunk> streamChat(ChatRequest request);
}
