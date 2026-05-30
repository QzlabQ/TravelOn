package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerDayPlanRef;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerAgentSnapshotRef {

    private Integer version;
    private String markdown;

    @Builder.Default
    private List<PlannerPlaceSuggestion> places = new ArrayList<>();

    @Builder.Default
    private List<PlannerRouteSegment> routes = new ArrayList<>();

    @Builder.Default
    private List<PlannerDayPlanRef> dayPlans = new ArrayList<>();

    private Integer currentDayIndex;

    @Builder.Default
    private List<Integer> completedDayIndexes = new ArrayList<>();
}
