package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentRunRequest {

    private UUID conversationId;
    private UUID userId;

    @Builder.Default
    private String planningMode = "INITIAL_PLAN";

    @Builder.Default
    private String planningScope = "DAY_PLAN";

    @Builder.Default
    private String modelVariant = "FLASH";

    private Integer targetDayIndex;
    private LocalDate targetDate;
    private TripCoreSlots coreSlots;

    @Builder.Default
    private String userMessage = "";

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();

    private PlannerInteractionInput interaction;
    private PlannerAgentSnapshotRef latestSnapshot;

    @Builder.Default
    private List<PlannerAgentHistoryMessage> history = new ArrayList<>();

    private Map<String, Object> userContext;
}
