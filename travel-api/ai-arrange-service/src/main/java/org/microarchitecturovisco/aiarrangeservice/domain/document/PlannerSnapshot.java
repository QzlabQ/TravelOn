package org.microarchitecturovisco.aiarrangeservice.domain.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerDayPlanRef;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "planner_snapshots")
public class PlannerSnapshot {

    @Id
    private UUID id;

    private UUID conversationId;
    private UUID userId;
    private Integer version;
    private Integer baseVersion;
    private String scope;
    private Integer targetDayIndex;
    private Integer currentDayIndex;

    @Builder.Default
    private List<Integer> completedDayIndexes = new ArrayList<>();

    private String title;
    private String summary;
    private String markdown;
    private String nextQuestion;
    private String assistantText;

    @Builder.Default
    private List<PlannerPlaceSuggestion> places = new ArrayList<>();

    @Builder.Default
    private List<PlannerRouteSegment> routes = new ArrayList<>();

    private PlannerDayPlanRef currentDayPlan;

    @Builder.Default
    private List<PlannerDayPlanRef> dayPlans = new ArrayList<>();

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();

    @Builder.Default
    private List<UUID> rejectedPlaceIds = new ArrayList<>();

    private String changeSummary;

    @Builder.Default
    private List<Map<String, Object>> patchOps = new ArrayList<>();

    private String checksum;
    private String traceId;

    private Instant createdAt;
}
