package org.microarchitecturovisco.aiarrangeservice.domain.model.request;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageType;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerSocketEnvelope {

    private PlannerMessageType type;
    private UUID conversationId;
    private UUID userId;
    private JsonNode payload;
}
