package org.microarchitecturovisco.aiarrangeservice.domain.model.request;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdatePlannerSelectionRequest {

    @NotNull
    private UUID userId;

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();
}
