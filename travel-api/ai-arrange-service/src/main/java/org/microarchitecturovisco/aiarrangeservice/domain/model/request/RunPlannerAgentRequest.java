package org.microarchitecturovisco.aiarrangeservice.domain.model.request;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerInteractionInput;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RunPlannerAgentRequest {

    @NotNull
    private UUID userId;

    private String message;
    private String planningMode;
    private String planningScope;
    private Integer targetDayIndex;
    private LocalDate targetDate;
    private PlannerInteractionInput interaction;

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();

    public PlannerChatSendPayload toChatPayload() {
        return PlannerChatSendPayload.builder()
                .message(message)
                .planningMode(planningMode)
                .planningScope(planningScope)
                .targetDayIndex(targetDayIndex)
                .targetDate(targetDate)
                .interaction(interaction)
                .selectedPlaceIds(selectedPlaceIds == null ? new ArrayList<>() : new ArrayList<>(selectedPlaceIds))
                .build();
    }
}
