package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerStreamEvent {

    private String eventId;
    private String traceId;
    private UUID runId;
    private UUID conversationId;
    private UUID userId;
    private String type;
    private String status;
    private String message;
    private String phase;
    private String tool;
    private Integer snapshotVersion;
    private Integer targetDayIndex;

    @Builder.Default
    private Map<String, Object> data = new LinkedHashMap<>();

    private Instant createdAt;
}
