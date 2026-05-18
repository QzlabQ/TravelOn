package org.microarchitecturovisco.aiarrangeservice.domain.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageRole;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "planner_messages")
public class PlannerMessage {

    @Id
    private UUID id;

    private UUID conversationId;
    private UUID userId;
    private PlannerMessageRole role;
    private String content;
    private String model;

    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();

    private Instant createdAt;
}
