package top.javarem.omni.model.chat;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatChoiceChunk {
    private Integer index;

    private ChatDelta delta;

    private Object logprobs;

    @JsonProperty("finish_reason")
    private String finishReason;
}
