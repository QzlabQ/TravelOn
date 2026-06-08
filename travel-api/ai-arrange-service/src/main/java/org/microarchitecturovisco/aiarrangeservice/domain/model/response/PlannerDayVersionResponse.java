package org.microarchitecturovisco.aiarrangeservice.domain.model.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerDayRevision;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerDayVersionResponse {

    private UUID id;
    private Integer dayIndex;
    private Integer dayVersion;
    private boolean current;
    private LocalDate date;
    private String status;
    private String title;
    private String markdown;
    private List<PlannerPlaceSuggestion> places;
    private List<PlannerRouteSegment> routes;
    private List<UUID> selectedPlaceIds;
    private List<UUID> rejectedPlaceIds;
    private String changeSummary;
    private String checksum;
    private Integer sourceSnapshotVersion;
    private Instant createdAt;

    public static PlannerDayVersionResponse from(PlannerDayRevision revision, boolean current) {
        return PlannerDayVersionResponse.builder()
                .id(revision.getId())
                .dayIndex(revision.getDayIndex())
                .dayVersion(revision.getDayVersion())
                .current(current)
                .date(revision.getDate())
                .status(revision.getStatus())
                .title(revision.getTitle())
                .markdown(revision.getMarkdown())
                .places(revision.getPlaces())
                .routes(revision.getRoutes())
                .selectedPlaceIds(revision.getSelectedPlaceIds())
                .rejectedPlaceIds(revision.getRejectedPlaceIds())
                .changeSummary(revision.getChangeSummary())
                .checksum(revision.getChecksum())
                .sourceSnapshotVersion(revision.getSourceSnapshotVersion())
                .createdAt(revision.getCreatedAt())
                .build();
    }
}
