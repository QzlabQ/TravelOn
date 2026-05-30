package org.microarchitecturovisco.aiarrangeservice.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerRouteSegment {

    private UUID fromPlaceId;
    private UUID toPlaceId;
    private String transportMode;
    private Double distanceKm;
    private Integer estimatedMinutes;
    private String polyline;
    private String summary;
    private Integer dayIndex;
}
