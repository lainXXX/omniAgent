package top.javarem.omni.tool.bash;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Bash 工作目录管理器
 *
 * <p>跟踪并验证工作目录状态。核心规则：</p>
 * <ul>
 *   <li>defaultWorkspace 仅作为构造初始值，来源标记为 INITIAL</li>
 *   <li>只有 {@link #hasVerifiedCwd()} 为 true 时，才可用于运行时工作目录</li>
 *   <li>可信来源只有两种：显式同步（前端打开文件夹）和 sentinel 捕获（命令执行后）</li>
 *   <li>不解析 cd 命令、不匹配自然语言输出，只信任 runner 注入的 sentinel 标记</li>
 * </ul>
 */
@Component
@Slf4j
public class WorkingDirectoryManager {

    /** sentinel 标记，由 BashExecutor.doExecute 在每条命令末尾注入 */
    public static final String SENTINEL_MARKER = "___OMNI_CWD_SENTINEL___";

    /** 工作目录来源标记 */
    public enum CwdSource {
        /** 构造函数设置的默认值，运行时不可信 */
        INITIAL,
        /** 通过显式 syncWorkspace 设置（前端打开/切换文件夹） */
        EXPLICIT_SYNC,
        /** 通过 sentinel 从命令输出中可信捕获 */
        SENTINEL_CAPTURED
    }

    private volatile Path currentDir;
    private volatile CwdSource currentDirSource;

    public WorkingDirectoryManager(
            @Value("${agent.working-directory:${user.dir}}") String workspace) {
        Path ws = normalize(workspace);
        this.currentDir = ws;
        this.currentDirSource = CwdSource.INITIAL;
        log.info("[WorkingDirectoryManager] 初始化, currentDir={}, source={}",
            currentDir, currentDirSource);
    }

    // ═══════════════════════════════════════════════
    //  查询
    // ═══════════════════════════════════════════════

    /**
     * 当前工作目录是否可用于运行时执行。
     * 只有来源不是 INITIAL 且路径存在的目录才可信。
     */
    public boolean hasVerifiedCwd() {
        if (currentDir == null || currentDirSource == CwdSource.INITIAL) {
            return false;
        }
        try {
            return Files.exists(currentDir) && Files.isDirectory(currentDir);
        } catch (Exception e) {
            return false;
        }
    }

    public Path getCurrentDir() {
        return currentDir;
    }

    public CwdSource getCurrentDirSource() {
        return currentDirSource;
    }

    // ═══════════════════════════════════════════════
    //  更新
    // ═══════════════════════════════════════════════

    /**
     * 显式同步工作目录（前端打开/切换文件夹时调用），标记为 EXPLICIT_SYNC。
     */
    public void syncWorkspace(String workspace) {
        if (workspace == null || workspace.isBlank()) return;
        try {
            this.currentDir = normalize(workspace);
            this.currentDirSource = CwdSource.EXPLICIT_SYNC;
            log.info("[WorkingDirectoryManager] 显式同步 workspace: {}, source={}",
                currentDir, currentDirSource);
        } catch (Exception e) {
            log.warn("[WorkingDirectoryManager] workspace 同步异常: {}", workspace, e);
        }
    }

    /**
     * 从命令输出中解析 sentinel 标记并更新 cwd。
     * sentinel 格式: ___OMNI_CWD_SENTINEL___cwd=/path/to/dir___rc=0___
     * 只信任最后出现的 sentinel，标记为 SENTINEL_CAPTURED。
     *
     * @param output 命令的 stdout+stderr 合并输出
     * @return 捕获到的 cwd，未找到返回 null
     */
    public Path captureFromSentinel(String output) {
        if (output == null || output.isBlank()) return null;

        int lastMarker = output.lastIndexOf(SENTINEL_MARKER);
        if (lastMarker < 0) return null;

        // 只解析最后一个 sentinel（防止历史输出干扰）
        String tail = output.substring(lastMarker);
        int cwdStart = tail.indexOf("cwd=");
        if (cwdStart < 0) return null;
        int cwdEnd = tail.indexOf("___rc=", cwdStart + 4);
        if (cwdEnd < 0) return null;

        String cwd = tail.substring(cwdStart + 4, cwdEnd);
        try {
            Path path = normalize(cwd);
            if (Files.exists(path) && Files.isDirectory(path)) {
                this.currentDir = path;
                this.currentDirSource = CwdSource.SENTINEL_CAPTURED;
                log.debug("[WorkingDirectoryManager] sentinel 捕获 cwd: {} (source={})",
                    currentDir, currentDirSource);
                return path;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /**
     * 从命令输出中追踪并验证 cwd（委托给 captureFromSentinel）。
     * 不匹配自然语言，不解析 cd 命令。
     */
    public Path trackAndValidate(String output) {
        Path captured = captureFromSentinel(output);
        if (captured != null) return captured;
        return currentDir;
    }

    /**
     * 重置到初始状态（来源标记为 INITIAL）。
     */
    public void resetToInitial() {
        this.currentDirSource = CwdSource.INITIAL;
        log.info("[WorkingDirectoryManager] 重置 source 为 INITIAL");
    }

    private Path normalize(String pathStr) {
        if (pathStr == null || pathStr.isBlank()) {
            return currentDir;
        }
        String normalized = OsHelper.current().normalizePath(pathStr.trim());
        return Paths.get(normalized).normalize().toAbsolutePath();
    }
}
