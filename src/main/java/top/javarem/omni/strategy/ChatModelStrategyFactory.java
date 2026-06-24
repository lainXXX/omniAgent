package top.javarem.omni.strategy;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 策略工厂 — 根据 vendor 路由到对应的大模型策略
 *
 * <p>Spring 启动时自动收集所有 {@link ChatModelStrategy} Bean 并建立 vendor → Strategy 映射。
 * 后续新增厂商时只需新建一个 ChatModelStrategy 实现类并标注 @Component，无需修改工厂代码。</p>
 *
 * <p>回退机制：当请求的 vendor 不存在时，自动降级到 {@code omni.provider.default} 配置的默认策略。</p>
 */
@Slf4j
@Component
public class ChatModelStrategyFactory {

    /** vendor → Strategy 映射表（构造时自动初始化） */
    private final Map<String, ChatModelStrategy> strategyMap;

    @Value("${omni.provider.default:deepseek}")
    private String defaultVendor;

    /**
     * 构造工厂，将所有 ChatModelStrategy Bean 按 vendor 建立索引。
     * 同 vendor 冲突时保留后注册的并打印警告（通常不应发生）。
     */
    public ChatModelStrategyFactory(List<ChatModelStrategy> strategies) {
        this.strategyMap = strategies.stream()
                .collect(Collectors.toMap(
                        ChatModelStrategy::vendor,
                        Function.identity(),
                        (existing, replacement) -> {
                            log.warn("[StrategyFactory] 发现重复 vendor: {}，保留后注册的", existing.vendor());
                            return replacement;
                        }
                ));
        log.info("[StrategyFactory] 已注册策略: {}", strategyMap.keySet());
    }

    /**
     * 根据 vendor 获取对应策略。
     * vendor 为空或 null 时使用默认策略；vendor 不存在时回退到默认策略。
     *
     * @param vendor 厂商标识（如 deepseek / anthropic / minimax），允许为空
     * @return 匹配的策略实例
     * @throws IllegalArgumentException 当默认策略也不存在时抛出
     */
    public ChatModelStrategy getStrategy(String vendor) {
        String key = (vendor != null && !vendor.isBlank()) ? vendor : defaultVendor;
        ChatModelStrategy strategy = strategyMap.get(key);
        if (strategy == null) {
            log.warn("[StrategyFactory] 不支持的厂商: {}，回退到默认: {}", key, defaultVendor);
            ChatModelStrategy fallback = strategyMap.get(defaultVendor);
            if (fallback == null) {
                throw new IllegalArgumentException("无可用的大模型策略，vendor=" + key + ", default=" + defaultVendor);
            }
            return fallback;
        }
        return strategy;
    }
}
