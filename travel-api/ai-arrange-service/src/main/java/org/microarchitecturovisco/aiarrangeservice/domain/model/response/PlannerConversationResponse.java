package org.microarchitecturovisco.aiarrangeservice.domain.model.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerActiveRun;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerConversationResponse {

    private UUID id;
    private UUID userId;
    private PlannerConversationStatus status;
    private TripCoreSlots coreSlots;
    private String title;
    private String currentMarkdown;
    private String nextQuestion;
    private Integer latestSnapshotVersion;
    private PlannerActiveRun activeRun;
    private List<UUID> selectedPlaceIds;
    private Instant createdAt;
    private Instant updatedAt;

    public static PlannerConversationResponse from(PlannerConversation conversation) {
        return PlannerConversationResponse.builder()
                .id(conversation.getId())
                .userId(conversation.getUserId())
                .status(conversation.getStatus())
                .coreSlots(conversation.getCoreSlots())
                .title(conversation.getTitle())
                .currentMarkdown(conversation.getCurrentMarkdown())
                .nextQuestion(conversation.getNextQuestion())
                .latestSnapshotVersion(conversation.getLatestSnapshotVersion())
                .activeRun(conversation.getActiveRun())
                .selectedPlaceIds(conversation.getSelectedPlaceIds())
                .createdAt(conversation.getCreatedAt())
                .updatedAt(conversation.getUpdatedAt())
                .build();
    }
}
