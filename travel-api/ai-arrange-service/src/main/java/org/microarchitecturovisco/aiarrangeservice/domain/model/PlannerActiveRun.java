package org.microarchitecturovisco.aiarrangeservice.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerRunStatus;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerActiveRun {

    private UUID runId;
    private PlannerRunStatus status;
    private Integer targetDayIndex;
    private String traceId;
    private Instant startedAt;
    private Instant updatedAt;
    private String errorCode;
    private String errorMessage;
}
