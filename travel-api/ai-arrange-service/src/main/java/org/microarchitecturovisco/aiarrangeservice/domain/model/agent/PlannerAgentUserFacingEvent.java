package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.LinkedHashMap;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerAgentUserFacingEvent {

    private String type;
    private String message;
    private String status;
    private String tool;

    @Builder.Default
    private Map<String, Object> metadata = new LinkedHashMap<>();
}
