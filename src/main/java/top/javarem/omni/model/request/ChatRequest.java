package top.javarem.omni.model.request;

import lombok.Data;

@Data
public class ChatRequest {
    private String question;
    private String sessionId;
    private String workspace;
    private Boolean bypassApproval;
    private String vendor;
    private String model;
    private Boolean stream;
}