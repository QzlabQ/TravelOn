package org.microarchitecturovisco.communityservice.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.microarchitecturovisco.communityservice.domain.TravelStyle;

import java.util.List;

public record CreateTravelRouteRequest(
        @NotBlank @Size(max = 120) String title,
        @Size(max = 4000) String summary,
        @Min(1) @Max(60) int days,
        @Min(1) @Max(100) int peopleCount,
        @Min(0) int budget,
        @NotNull TravelStyle style,
        @Size(max = 255) String cityId,
        List<@Size(max = 1000) String> imageUrls,
        @NotEmpty @Valid List<CreateRouteStopRequest> stops
) {
}
