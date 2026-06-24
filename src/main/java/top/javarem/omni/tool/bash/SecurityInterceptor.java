package top.javarem.omni.tool.bash;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class SecurityInterceptor {

    public SecurityInterceptor() {
    }

    public record CheckResult(Type type, String ticketId, String message, boolean bypassed) {
        public enum Type { ALLOW, DENY, PENDING, WARNING }

        public static CheckResult allow() {
            return new CheckResult(Type.ALLOW, null, "命令允许执行", false);
        }

        public static CheckResult allow(boolean bypassed) {
            return new CheckResult(Type.ALLOW, null, bypassed ? "自动放行（免审批模式）" : "命令允许执行", bypassed);
        }

        public static CheckResult deny(String message) {
            return new CheckResult(Type.DENY, null, message, false);
        }

        public static CheckResult pending(String ticketId, String message) {
            return new CheckResult(Type.PENDING, ticketId, message, false);
        }

        public static CheckResult warning(String message) {
            return new CheckResult(Type.WARNING, null, message, false);
        }
    }

    public CheckResult check(String command) {
        return check(command, null, false);
    }

    public CheckResult check(String command, String workspace) {
        return check(command, workspace, false);
    }

    /**
     * 安全检查 - 已禁用，所有命令直接放行
     */
    public CheckResult check(String command, String workspace, boolean acceptEdits) {
        if (command == null || command.isBlank()) {
            return CheckResult.deny("命令不能为空");
        }

        log.debug("[SecurityInterceptor] 放行命令: {}", command);
        return CheckResult.allow();
    }
}
