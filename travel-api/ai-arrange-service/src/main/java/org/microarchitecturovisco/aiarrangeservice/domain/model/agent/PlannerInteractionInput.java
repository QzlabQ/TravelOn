package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

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
public class PlannerInteractionInput {

    @Builder.Default
    private List<String> selectedOptionIds = new ArrayList<>();

    @Builder.Default
    private List<String> rejectedOptionIds = new ArrayList<>();

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();

    @Builder.Default
    private List<UUID> rejectedPlaceIds = new ArrayList<>();

    private String freeText;

    @Builder.Default
    private boolean confirmCurrentPlan = false;
}
