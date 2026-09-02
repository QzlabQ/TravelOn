package org.microarchitecturovisco.aiarrangeservice.domain.model.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerDayPlanRef;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerOptionGroup;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerDataRefreshPayload {

    private PlannerConversationStatus status;
    private String title;
    private String summary;
    private String markdown;
    private String nextQuestion;
    private Integer snapshotVersion;
    private String scope;
    private Integer currentDayIndex;
    private List<Integer> completedDayIndexes;
    private List<PlannerDayPlanRef> dayPlans;
    private List<PlannerPlaceSuggestion> places;
    private List<PlannerRouteSegment> routes;
    private List<UUID> selectedPlaceIds;
    private List<PlannerOptionGroup> recommendationGroups;
    private UUID runId;

    public static PlannerDataRefreshPayload from(PlannerConversationStatus status, PlannerSnapshot snapshot) {
        return PlannerDataRefreshPayload.builder()
                .status(status)
                .title(snapshot.getTitle())
                .summary(snapshot.getSummary())
                .markdown(snapshot.getMarkdown())
                .nextQuestion(snapshot.getNextQuestion())
                .snapshotVersion(snapshot.getVersion())
                .scope(snapshot.getScope())
                .currentDayIndex(snapshot.getCurrentDayIndex())
                .completedDayIndexes(snapshot.getCompletedDayIndexes())
                .dayPlans(snapshot.getDayPlans())
                .places(snapshot.getPlaces())
                .routes(snapshot.getRoutes())
                .selectedPlaceIds(snapshot.getSelectedPlaceIds())
                .build();
    }

    public static PlannerDataRefreshPayload from(PlannerConversationStatus status, PlannerSnapshot snapshot, List<PlannerOptionGroup> recommendationGroups) {
        PlannerDataRefreshPayload payload = from(status, snapshot);
        payload.setRecommendationGroups(recommendationGroups);
        return payload;
    }

    public static PlannerDataRefreshPayload from(PlannerConversationStatus status, PlannerSnapshot snapshot,
                                                 List<PlannerOptionGroup> recommendationGroups, UUID runId) {
        PlannerDataRefreshPayload payload = from(status, snapshot, recommendationGroups);
        payload.setRunId(runId);
        return payload;
    }
}
