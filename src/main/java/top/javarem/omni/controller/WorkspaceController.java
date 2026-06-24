package top.javarem.omni.controller;

import javafx.application.Platform;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.File;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

@RestController
@RequestMapping("/api/workspace")
public class WorkspaceController {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceController.class);
    private static boolean fxInitialized = false;

    @GetMapping("/dialog")
    public ResponseEntity<Map<String, String>> openDirectoryDialog() {
        try {
            initJavaFX();

            AtomicReference<String> result = new AtomicReference<>();
            CountDownLatch latch = new CountDownLatch(1);

            Platform.runLater(() -> {
                try {
                    DirectoryChooser chooser = new DirectoryChooser();
                    chooser.setTitle("选择项目目录");
                    File selected = chooser.showDialog(new Stage());
                    if (selected != null) {
                        result.set(selected.getAbsolutePath());
                    }
                } catch (Exception e) {
                    log.error("[WorkspaceController] 目录选择异常", e);
                } finally {
                    latch.countDown();
                }
            });

            latch.await();
            return ResponseEntity.ok(Map.of("path", result.get() != null ? result.get() : ""));
        } catch (Exception e) {
            log.error("[WorkspaceController] 打开目录对话框失败", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage() != null ? e.getMessage() : "Unknown error"));
        }
    }

    private static synchronized void initJavaFX() {
        if (!fxInitialized) {
            Platform.startup(() -> {});
            fxInitialized = true;
        }
    }
}
