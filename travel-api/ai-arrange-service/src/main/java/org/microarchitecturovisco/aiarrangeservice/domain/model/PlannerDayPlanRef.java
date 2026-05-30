package org.microarchitecturovisco.aiarrangeservice.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerDayPlanRef {

    private Integer dayIndex;
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
}
