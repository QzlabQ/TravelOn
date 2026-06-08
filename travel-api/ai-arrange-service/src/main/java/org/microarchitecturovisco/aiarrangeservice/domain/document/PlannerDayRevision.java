package org.microarchitecturovisco.aiarrangeservice.domain.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "planner_day_revisions")
public class PlannerDayRevision {

    @Id
    private UUID id;

    private UUID conversationId;
    private UUID userId;
    private Integer dayIndex;
    private Integer dayVersion;
    private LocalDate date;

    @Builder.Default
    private String status = "DRAFT";

    private String title;

    @Builder.Default
    private String markdown = "";

    @Builder.Default
    private List<PlannerPlaceSuggestion> places = new ArrayList<>();

    @Builder.Default
    private List<PlannerRouteSegment> routes = new ArrayList<>();

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();

    @Builder.Default
    private List<UUID> rejectedPlaceIds = new ArrayList<>();

    private String changeSummary;
    private String checksum;
    private String contentHash;
    private Integer sourceSnapshotVersion;
    private UUID baseDayRevisionId;
    private Instant createdAt;
}
