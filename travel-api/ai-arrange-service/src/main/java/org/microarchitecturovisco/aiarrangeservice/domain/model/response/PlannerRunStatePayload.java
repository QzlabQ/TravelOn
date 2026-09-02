package org.microarchitecturovisco.aiarrangeservice.domain.model.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerRunStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerActiveRun;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerRunStatePayload {

    private UUID conversationId;
    private UUID requestedRunId;
    private PlannerActiveRun activeRun;
    private Integer latestSnapshotVersion;
    private PlannerRunStatus status;
}
