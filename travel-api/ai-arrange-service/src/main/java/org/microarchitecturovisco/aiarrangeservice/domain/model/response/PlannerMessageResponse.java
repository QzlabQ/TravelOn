package org.microarchitecturovisco.aiarrangeservice.domain.model.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageRole;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerMessageResponse {

    private UUID id;
    private PlannerMessageRole role;
    private String content;
    private Instant createdAt;

    public static PlannerMessageResponse from(PlannerMessage message) {
        return PlannerMessageResponse.builder()
                .id(message.getId())
                .role(message.getRole())
                .content(message.getContent())
                .createdAt(message.getCreatedAt())
                .build();
    }
}
