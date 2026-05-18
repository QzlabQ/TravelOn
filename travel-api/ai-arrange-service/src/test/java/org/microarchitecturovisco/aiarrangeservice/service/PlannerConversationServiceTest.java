package org.microarchitecturovisco.aiarrangeservice.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageType;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerDataRefreshPayload;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerConversationRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerMessageRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerSnapshotRepository;
import org.microarchitecturovisco.aiarrangeservice.websocket.PlannerWebSocketSessionRegistry;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlannerConversationServiceTest {

    @Mock
    private PlannerConversationRepository conversationRepository;

    @Mock
    private PlannerMessageRepository messageRepository;

    @Mock
    private PlannerSnapshotRepository snapshotRepository;

    @Mock
    private PlannerPromptFactory promptFactory;

    @Mock
    private PlannerAiClient plannerAiClient;

    @Mock
    private PlannerSnapshotService snapshotService;

    @Mock
    private PlannerWebSocketSessionRegistry webSocketSessionRegistry;

    @Mock
    private ExecutorService plannerExecutorService;

    @Test
    void updateSelectionPushesDataRefresh() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID placeId = UUID.randomUUID();
        PlannerConversation conversation = conversation(conversationId, userId);
        PlannerSnapshot snapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(2)
                .title("Shanghai plan")
                .summary("summary")
                .markdown("# Shanghai plan")
                .selectedPlaceIds(List.of(placeId))
                .createdAt(Instant.now())
                .build();

        when(conversationRepository.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.of(conversation));
        when(conversationRepository.save(any(PlannerConversation.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(snapshotService.updateSelectionSnapshot(any(PlannerConversation.class), eq(List.of(placeId)))).thenReturn(snapshot);

        PlannerConversationService service = new PlannerConversationService(
                conversationRepository,
                messageRepository,
                snapshotRepository,
                promptFactory,
                plannerAiClient,
                snapshotService,
                webSocketSessionRegistry,
                plannerExecutorService
        );

        service.updateSelection(conversationId, userId, List.of(placeId));

        ArgumentCaptor<Object> payloadCaptor = ArgumentCaptor.forClass(Object.class);
        verify(webSocketSessionRegistry).send(eq(conversationId), eq(PlannerMessageType.PLANNER_DATA_REFRESH), payloadCaptor.capture());
        PlannerDataRefreshPayload payload = (PlannerDataRefreshPayload) payloadCaptor.getValue();
        assertThat(payload.getSnapshotVersion()).isEqualTo(2);
        assertThat(payload.getSelectedPlaceIds()).containsExactly(placeId);
    }

    private PlannerConversation conversation(UUID conversationId, UUID userId) {
        return PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .peopleCount(2)
                        .build())
                .title("Shanghai plan")
                .currentMarkdown("")
                .latestSnapshotVersion(1)
                .selectedPlaceIds(List.of())
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }
}
