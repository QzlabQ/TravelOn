package org.microarchitecturovisco.aiarrangeservice.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceSource;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceType;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerPlaceSuggestion {

    @Builder.Default
    private UUID placeId = UUID.randomUUID();

    private String name;

    @Builder.Default
    private PlannerPlaceType type = PlannerPlaceType.OTHER;

    @Builder.Default
    private PlannerPlaceSource source = PlannerPlaceSource.AI;

    private UUID internalOfferId;
    private String amapPoiId;
    private Double latitude;
    private Double longitude;
    private String address;
    private String imageUrl;
    private String description;

    @Builder.Default
    private boolean selected = false;

    @Builder.Default
    private List<String> tags = new ArrayList<>();
}
