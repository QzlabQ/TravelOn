package org.microarchitecturovisco.aiarrangeservice.domain.model.request;

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
public class PlannerChatSendPayload {

    private String message;
    private String planningMode;
    private String planningScope;
    private Integer targetDayIndex;
    private LocalDate targetDate;
    private PlannerInteractionInput interaction;

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();
}
