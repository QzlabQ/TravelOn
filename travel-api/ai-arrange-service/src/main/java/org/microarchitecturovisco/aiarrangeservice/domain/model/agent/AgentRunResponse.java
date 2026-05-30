package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentRunResponse {

    private String traceId;
    private String status;
    private String assistantText;
    private String title;
    private String summary;
    private String markdown;
    private String nextQuestion;
    private String nextAction;

    @Builder.Default
    private List<PlannerPlaceSuggestion> places = new ArrayList<>();

    @Builder.Default
    private List<PlannerRouteSegment> routes = new ArrayList<>();

    @Builder.Default
    private List<PlannerOptionGroup> recommendationGroups = new ArrayList<>();

    private PlannerSnapshotDraft snapshotDraft;

    @Builder.Default
    private List<PlannerAgentToolCall> toolCalls = new ArrayList<>();

    @Builder.Default
    private List<PlannerAgentWarning> warnings = new ArrayList<>();

    @Builder.Default
    private List<PlannerAgentUserFacingEvent> userFacingEvents = new ArrayList<>();
}
