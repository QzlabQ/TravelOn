package org.microarchitecturovisco.aiarrangeservice.domain.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerActiveRun;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "planner_conversations")
public class PlannerConversation {

    @Id
    private UUID id;

    private UUID userId;
    private PlannerConversationStatus status;
    private TripCoreSlots coreSlots;
    private String title;
    private String currentMarkdown;
    private String nextQuestion;
    private Integer latestSnapshotVersion;

    private PlannerActiveRun activeRun;

    @Builder.Default
    private List<UUID> selectedPlaceIds = new ArrayList<>();

    @Builder.Default
    private Map<String, UUID> currentDayRevisionIds = new LinkedHashMap<>();

    private Instant createdAt;
    private Instant updatedAt;
}
