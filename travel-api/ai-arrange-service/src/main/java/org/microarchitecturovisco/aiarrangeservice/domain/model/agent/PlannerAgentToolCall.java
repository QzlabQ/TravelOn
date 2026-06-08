package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashMap;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerAgentToolCall {

    private String tool;
    private String status;
    private Integer latencyMs;
    private String detail;
    private Integer retryCount;
    private String inputSummary;
    private String outputSummary;

    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();
}
