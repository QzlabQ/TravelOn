package org.microarchitecturovisco.aiarrangeservice.domain.model.request;

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
public class PlannerChatSendPayload {

    private String message;

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();
}
