package org.microarchitecturovisco.aiarrangeservice.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerSnapshotDraft {

    private Integer baseVersion;
    private Integer proposedVersion;
    private String scope;
    private Integer targetDayIndex;
    private PlannerDayPlanRef currentDayPlan;

    @Builder.Default
    private List<PlannerDayPlanRef> dayPlans = new ArrayList<>();

    private String title;
    private String summary;
    private String markdown;
    private String nextQuestion;

    @Builder.Default
    private List<PlannerPlaceSuggestion> places = new ArrayList<>();

    @Builder.Default
    private List<PlannerRouteSegment> routes = new ArrayList<>();

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();

    @Builder.Default
    private List<UUID> rejectedPlaceIds = new ArrayList<>();

    private String changeSummary;

    @Builder.Default
    private List<Map<String, Object>> patchOps = new ArrayList<>();

    private String checksum;
}
