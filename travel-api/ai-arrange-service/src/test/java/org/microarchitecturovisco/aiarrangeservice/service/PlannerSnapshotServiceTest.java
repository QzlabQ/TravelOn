package org.microarchitecturovisco.aiarrangeservice.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.aiarrangeservice.client.AiChatMessage;
import org.microarchitecturovisco.aiarrangeservice.client.AmapPoiClient;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceSource;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceType;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentToolCall;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentWarning;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerMessageRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerSnapshotRepository;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlannerSnapshotServiceTest {

    @Mock
    private PlannerAiClient plannerAiClient;

    @Mock
    private PlannerPromptFactory promptFactory;

    @Mock
    private PlannerMessageRepository messageRepository;

    @Mock
    private PlannerSnapshotRepository snapshotRepository;

    @Mock
    private AmapPoiClient amapPoiClient;

    @Mock
    private InternalOfferHotelMatcher internalOfferHotelMatcher;

    @Test
    void createSnapshotReusesPreviousPlaceIdForSamePlace() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID previousPlaceId = UUID.randomUUID();
        PlannerConversation conversation = PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .peopleCount(2)
                        .build())
                .title("Shanghai plan")
                .selectedPlaceIds(List.of(previousPlaceId))
                .build();
        PlannerPlaceSuggestion previousPlace = PlannerPlaceSuggestion.builder()
                .placeId(previousPlaceId)
                .name("The Bund")
                .type(PlannerPlaceType.SCENIC)
                .source(PlannerPlaceSource.AMAP)
                .latitude(31.2397)
                .longitude(121.4998)
                .build();
        PlannerSnapshot previousSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(1)
                .title("Shanghai plan")
                .markdown("# Shanghai plan")
                .places(List.of(previousPlace))
                .createdAt(Instant.now())
                .build();
        PlannerPlaceSuggestion draftPlace = PlannerPlaceSuggestion.builder()
                .name("The Bund")
                .type(PlannerPlaceType.SCENIC)
                .description("waterfront landmark")
                .build();
        PlannerSnapshotDraft draft = PlannerSnapshotDraft.builder()
                .title("Shanghai plan")
                .summary("summary")
                .markdown("# Shanghai plan")
                .places(List.of(draftPlace))
                .build();

        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)).thenReturn(List.of());
        when(promptFactory.buildExtractionPrompt(conversation, previousSnapshot, List.of(), "assistant")).thenReturn(List.of(new AiChatMessage("user", "extract")));
        when(plannerAiClient.extractSnapshotDraft(any())).thenReturn(Optional.of(draft));
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(previousSnapshot));
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository
        );

        PlannerSnapshot snapshot = service.createSnapshot(conversation, "assistant");

        assertThat(snapshot.getPlaces()).hasSize(1);
        PlannerPlaceSuggestion place = snapshot.getPlaces().getFirst();
        assertThat(place.getPlaceId()).isEqualTo(previousPlaceId);
        assertThat(place.isSelected()).isTrue();
        assertThat(place.getLatitude()).isEqualTo(31.2397);
        assertThat(place.getLongitude()).isEqualTo(121.4998);
        assertThat(snapshot.getVersion()).isEqualTo(2);
        assertThat(snapshot.getNextQuestion()).isNotBlank();
    }

    @Test
    void createSnapshotFromAgentResponseAssignsJavaVersionInsteadOfProposedVersion() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .peopleCount(2)
                        .build())
                .title("Shanghai plan")
                .selectedPlaceIds(List.of())
                .build();
        PlannerSnapshot previousSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(4)
                .title("Old")
                .markdown("# Old")
                .createdAt(Instant.now())
                .build();
        AgentRunResponse response = AgentRunResponse.builder()
                .traceId("trace-1")
                .status("SUCCESS")
                .assistantText("已生成规划。")
                .title("Shanghai plan")
                .summary("summary")
                .markdown("# Shanghai plan")
                .nextQuestion("是否确认当天？")
                .toolCalls(List.of(PlannerAgentToolCall.builder()
                        .tool("deepseek_chat_completion")
                        .status("SUCCESS")
                        .latencyMs(1234)
                        .outputSummary("requestMs=1200; model=flash")
                        .build()))
                .warnings(List.of(PlannerAgentWarning.builder()
                        .code("MODEL_SLOW_RESPONSE")
                        .message("模型响应偏慢。")
                        .source("deepseek")
                        .build()))
                .snapshotDraft(PlannerSnapshotDraft.builder()
                        .baseVersion(4)
                        .proposedVersion(99)
                        .scope("DAY_PLAN")
                        .targetDayIndex(2)
                        .markdown("# Shanghai plan")
                        .checksum("snapshot-checksum")
                        .build())
                .build();

        when(snapshotRepository.findFirstByConversationIdAndChecksumOrderByVersionDesc(conversationId, "snapshot-checksum"))
                .thenReturn(Optional.empty());
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(previousSnapshot));
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository
        );

        PlannerSnapshot snapshot = service.createSnapshotFromAgentResponse(conversation, response);

        assertThat(snapshot.getVersion()).isEqualTo(5);
        assertThat(snapshot.getVersion()).isNotEqualTo(99);
        assertThat(snapshot.getBaseVersion()).isEqualTo(4);
        assertThat(snapshot.getTargetDayIndex()).isEqualTo(2);
        assertThat(snapshot.getChecksum()).isEqualTo("snapshot-checksum");
        assertThat(snapshot.getTraceId()).isEqualTo("trace-1");
        assertThat(snapshot.getAgentToolCalls()).hasSize(1);
        assertThat(snapshot.getAgentToolCalls().getFirst().getLatencyMs()).isEqualTo(1234);
        assertThat(snapshot.getAgentWarnings()).extracting(PlannerAgentWarning::getCode).containsExactly("MODEL_SLOW_RESPONSE");
    }

    @Test
    void createSnapshotFromAgentResponseRejectsStaleBaseVersion() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .peopleCount(2)
                        .build())
                .title("Shanghai plan")
                .selectedPlaceIds(List.of())
                .build();
        PlannerSnapshot latestSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(4)
                .title("Current")
                .markdown("# Current")
                .createdAt(Instant.now())
                .build();
        AgentRunResponse response = AgentRunResponse.builder()
                .traceId("trace-stale")
                .status("SUCCESS")
                .assistantText("已生成规划。")
                .title("Shanghai plan")
                .markdown("# Stale plan")
                .snapshotDraft(PlannerSnapshotDraft.builder()
                        .baseVersion(3)
                        .proposedVersion(4)
                        .scope("DAY_REFINE")
                        .targetDayIndex(1)
                        .markdown("# Stale plan")
                        .checksum("stale-checksum")
                        .build())
                .build();

        when(snapshotRepository.findFirstByConversationIdAndChecksumOrderByVersionDesc(conversationId, "stale-checksum"))
                .thenReturn(Optional.empty());
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshot));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository
        );

        assertThatThrownBy(() -> service.createSnapshotFromAgentResponse(conversation, response))
                .isInstanceOf(PlannerSnapshotVersionConflictException.class)
                .hasMessageContaining("Agent 基于版本 3")
                .hasMessageContaining("当前最新版本是 4");
        verify(snapshotRepository, never()).save(any(PlannerSnapshot.class));
    }
}
