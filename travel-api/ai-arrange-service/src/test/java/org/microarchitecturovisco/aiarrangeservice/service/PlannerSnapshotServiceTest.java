package org.microarchitecturovisco.aiarrangeservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.aiarrangeservice.client.AiChatMessage;
import org.microarchitecturovisco.aiarrangeservice.client.AmapPoiClient;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerDayRevision;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceSource;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceType;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerDayPlanRef;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentToolCall;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentWarning;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.CreatePlannerMarkdownSnapshotRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerSnapshotDiffResponse;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerDayRevisionRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerMessageRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerSnapshotRepository;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
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
    private PlannerDayRevisionRepository dayRevisionRepository;

    @Mock
    private AmapPoiClient amapPoiClient;

    @Mock
    private InternalOfferHotelMatcher internalOfferHotelMatcher;

    private final Map<UUID, PlannerDayRevision> dayRevisionStore = new HashMap<>();

    @BeforeEach
    void setUpDayRevisionRepository() {
        dayRevisionStore.clear();
        lenient().when(dayRevisionRepository.save(any(PlannerDayRevision.class))).thenAnswer(invocation -> {
            PlannerDayRevision revision = invocation.getArgument(0);
            dayRevisionStore.put(revision.getId(), revision);
            return revision;
        });
        lenient().when(dayRevisionRepository.findById(any(UUID.class))).thenAnswer(invocation -> Optional.ofNullable(dayRevisionStore.get(invocation.getArgument(0))));
    }

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
                snapshotRepository,
                dayRevisionRepository
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
                .toolCalls(List.of(PlannerAgentToolCall.builder()
                        .tool("deepseek_chat_completion")
                        .status("SUCCESS")
                        .latencyMs(1234)
                        .outputSummary("requestMs=1200; model=flash")
                        .build()))
                .warnings(List.of(PlannerAgentWarning.builder()
                        .code("MODEL_SLOW_RESPONSE")
                        .message("model response was slow")
                        .source("deepseek")
                        .build()))
                .nextQuestion("是否确认当天？")
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
                snapshotRepository,
                dayRevisionRepository
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
    void createSnapshotFromAgentResponseEnrichesDayPlanImagesBeforeSavingMarkdown() {
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
        PlannerPlaceSuggestion bund = PlannerPlaceSuggestion.builder()
                .name("The Bund")
                .type(PlannerPlaceType.SCENIC)
                .build();
        PlannerDayPlanRef dayPlan = PlannerDayPlanRef.builder()
                .dayIndex(1)
                .date(LocalDate.of(2026, 6, 1))
                .title("Day 1")
                .markdown("# Day 1\n\n- Walk the Bund.")
                .places(List.of(bund))
                .build();
        AgentRunResponse response = AgentRunResponse.builder()
                .traceId("trace-images")
                .status("SUCCESS")
                .assistantText("已生成规划。")
                .title("Shanghai plan")
                .summary("summary")
                .markdown("# Day 1\n\n- Walk the Bund.")
                .snapshotDraft(PlannerSnapshotDraft.builder()
                        .scope("DAY_PLAN")
                        .targetDayIndex(1)
                        .markdown("# Day 1\n\n- Walk the Bund.")
                        .currentDayPlan(dayPlan)
                        .dayPlans(List.of(dayPlan))
                        .build())
                .build();

        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.empty());
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(dayRevisionRepository.findFirstByConversationIdAndDayIndexAndContentHashOrderByDayVersionDesc(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(dayRevisionRepository.findFirstByConversationIdAndDayIndexOrderByDayVersionDesc(any(), any()))
                .thenReturn(Optional.empty());
        when(amapPoiClient.searchFirst(any(), any(PlannerPlaceSuggestion.class))).thenAnswer(invocation -> {
            PlannerPlaceSuggestion candidate = invocation.getArgument(1);
            candidate.setImageUrl("https://img.test/bund-1.jpg");
            candidate.setImageUrls(List.of("https://img.test/bund-1.jpg", "https://img.test/bund-2.jpg"));
            return Optional.of(candidate);
        });

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot snapshot = service.createSnapshotFromAgentResponse(conversation, response);

        assertThat(snapshot.getMarkdown())
                .contains("- Walk the Bund.\n\n![The Bund 1](https://img.test/bund-1.jpg)")
                .doesNotContain("### 景点图片参考");
        assertThat(snapshot.getCurrentDayPlan().getMarkdown())
                .contains("- Walk the Bund.\n\n![The Bund 1](https://img.test/bund-1.jpg)", "![The Bund 2](https://img.test/bund-2.jpg)")
                .doesNotContain("### 景点图片参考");
        assertThat(snapshot.getDayPlans().getFirst().getMarkdown()).doesNotContain("### 景点图片参考");
    }

    @Test
    void createSnapshotFromAgentResponseKeepsImageReferencePlaceholderWhenImagesAreMissing() {
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
        PlannerPlaceSuggestion bund = PlannerPlaceSuggestion.builder()
                .name("The Bund")
                .type(PlannerPlaceType.SCENIC)
                .build();
        PlannerDayPlanRef dayPlan = PlannerDayPlanRef.builder()
                .dayIndex(1)
                .date(LocalDate.of(2026, 6, 1))
                .title("Day 1")
                .markdown("# Day 1\n\n- Walk the Bund.")
                .places(List.of(bund))
                .build();
        AgentRunResponse response = AgentRunResponse.builder()
                .traceId("trace-image-placeholder")
                .status("SUCCESS")
                .assistantText("已生成规划。")
                .title("Shanghai plan")
                .summary("summary")
                .markdown("# Day 1\n\n- Walk the Bund.")
                .snapshotDraft(PlannerSnapshotDraft.builder()
                        .scope("DAY_PLAN")
                        .targetDayIndex(1)
                        .markdown("# Day 1\n\n- Walk the Bund.")
                        .currentDayPlan(dayPlan)
                        .dayPlans(List.of(dayPlan))
                        .build())
                .build();

        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.empty());
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(dayRevisionRepository.findFirstByConversationIdAndDayIndexAndContentHashOrderByDayVersionDesc(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(dayRevisionRepository.findFirstByConversationIdAndDayIndexOrderByDayVersionDesc(any(), any()))
                .thenReturn(Optional.empty());
        when(amapPoiClient.searchFirst(any(), any(PlannerPlaceSuggestion.class))).thenReturn(Optional.empty());

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot snapshot = service.createSnapshotFromAgentResponse(conversation, response);

        assertThat(snapshot.getMarkdown())
                .contains("- Walk the Bund.\n\n- 暂无可展示图片")
                .doesNotContain("### 景点图片参考");
        assertThat(snapshot.getCurrentDayPlan().getMarkdown())
                .contains("- Walk the Bund.\n\n- 暂无可展示图片")
                .doesNotContain("### 景点图片参考");
        assertThat(snapshot.getDayPlans().getFirst().getMarkdown()).doesNotContain("### 景点图片参考");
    }

    @Test
    void createSnapshotFromAgentResponseBackfillsDayPlanImagesFromTopLevelPlaces() {
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
        PlannerPlaceSuggestion bund = PlannerPlaceSuggestion.builder()
                .name("The Bund")
                .type(PlannerPlaceType.SCENIC)
                .imageUrl("https://img.test/bund-1.jpg")
                .imageUrls(List.of("https://img.test/bund-1.jpg", "https://img.test/bund-2.jpg"))
                .build();
        PlannerDayPlanRef dayPlan = PlannerDayPlanRef.builder()
                .dayIndex(1)
                .date(LocalDate.of(2026, 6, 1))
                .title("Day 1")
                .markdown("# Day 1\n\n- Walk the Bund.")
                .build();
        AgentRunResponse response = AgentRunResponse.builder()
                .traceId("trace-top-level-images")
                .status("SUCCESS")
                .assistantText("已生成规划。")
                .title("Shanghai plan")
                .summary("summary")
                .markdown("# Day 1\n\n- Walk the Bund.")
                .places(List.of(bund))
                .snapshotDraft(PlannerSnapshotDraft.builder()
                        .scope("DAY_PLAN")
                        .targetDayIndex(1)
                        .markdown("# Day 1\n\n- Walk the Bund.")
                        .currentDayPlan(dayPlan)
                        .dayPlans(List.of(dayPlan))
                        .build())
                .build();

        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.empty());
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(dayRevisionRepository.findFirstByConversationIdAndDayIndexAndContentHashOrderByDayVersionDesc(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(dayRevisionRepository.findFirstByConversationIdAndDayIndexOrderByDayVersionDesc(any(), any()))
                .thenReturn(Optional.empty());

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot snapshot = service.createSnapshotFromAgentResponse(conversation, response);

        assertThat(snapshot.getCurrentDayPlan().getPlaces()).extracting(PlannerPlaceSuggestion::getName).containsExactly("The Bund");
        assertThat(snapshot.getCurrentDayPlan().getMarkdown())
                .contains("- Walk the Bund.\n\n![The Bund 1](https://img.test/bund-1.jpg)", "![The Bund 2](https://img.test/bund-2.jpg)")
                .doesNotContain("### 景点图片参考");
        assertThat(snapshot.getDayPlans().getFirst().getMarkdown())
                .contains("- Walk the Bund.\n\n![The Bund 1](https://img.test/bund-1.jpg)")
                .doesNotContain("### 景点图片参考");
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
                .assistantText("Plan ready.")
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
                snapshotRepository,
                dayRevisionRepository
        );

        assertThatThrownBy(() -> service.createSnapshotFromAgentResponse(conversation, response))
                .isInstanceOf(PlannerSnapshotVersionConflictException.class)
                .hasMessageContaining("Agent 基于版本 3")
                .hasMessageContaining("当前最新版本是 4");
        verify(snapshotRepository, never()).save(any(PlannerSnapshot.class));
    }

    @Test
    void rollbackSnapshotCreatesNewVersionFromHistoricalSnapshot() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID selectedPlaceId = UUID.randomUUID();
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
        PlannerSnapshot historicalSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(2)
                .title("Better old plan")
                .summary("old summary")
                .markdown("# Better old plan")
                .selectedPlaceIds(List.of(selectedPlaceId))
                .checksum("old-checksum")
                .traceId("trace-old")
                .createdAt(Instant.now())
                .build();
        PlannerSnapshot latestSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(4)
                .title("Latest plan")
                .markdown("# Latest plan")
                .createdAt(Instant.now())
                .build();

        when(snapshotRepository.findByConversationIdAndVersion(conversationId, 2)).thenReturn(Optional.of(historicalSnapshot));
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshot));
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot restoredSnapshot = service.rollbackSnapshot(conversation, 2);

        assertThat(restoredSnapshot.getId()).isNotEqualTo(historicalSnapshot.getId());
        assertThat(restoredSnapshot.getVersion()).isEqualTo(5);
        assertThat(restoredSnapshot.getBaseVersion()).isEqualTo(2);
        assertThat(restoredSnapshot.getScope()).isEqualTo("ROLLBACK");
        assertThat(restoredSnapshot.getMarkdown()).isEqualTo("# Better old plan");
        assertThat(restoredSnapshot.getSelectedPlaceIds()).containsExactly(selectedPlaceId);
        assertThat(restoredSnapshot.getChangeSummary()).isEqualTo("Restored from version 2");
        assertThat(restoredSnapshot.getPatchOps()).hasSize(1);
    }

    @Test
    void diffSnapshotsReportsMarkdownPlacesAndDayPlanChanges() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerPlaceSuggestion bund = PlannerPlaceSuggestion.builder()
                .placeId(UUID.randomUUID())
                .name("The Bund")
                .type(PlannerPlaceType.SCENIC)
                .build();
        PlannerPlaceSuggestion museum = PlannerPlaceSuggestion.builder()
                .placeId(UUID.randomUUID())
                .name("Shanghai Museum")
                .type(PlannerPlaceType.SCENIC)
                .build();
        PlannerSnapshot fromSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(1)
                .title("Plan")
                .summary("old")
                .markdown("# Plan\nOld route")
                .places(List.of(bund))
                .selectedPlaceIds(List.of(bund.getPlaceId()))
                .dayPlans(List.of(PlannerDayPlanRef.builder()
                        .dayIndex(1)
                        .status("DRAFT")
                        .title("Day 1")
                        .markdown("Old day")
                        .build()))
                .createdAt(Instant.now())
                .build();
        PlannerSnapshot toSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(2)
                .title("Plan")
                .summary("new")
                .markdown("# Plan\nNew route\nMuseum stop")
                .places(List.of(bund, museum))
                .selectedPlaceIds(List.of(bund.getPlaceId(), museum.getPlaceId()))
                .currentDayIndex(2)
                .completedDayIndexes(List.of(1))
                .dayPlans(List.of(
                        PlannerDayPlanRef.builder()
                                .dayIndex(1)
                                .status("CONFIRMED")
                                .title("Day 1")
                                .markdown("Old day")
                                .build(),
                        PlannerDayPlanRef.builder()
                                .dayIndex(2)
                                .status("DRAFT")
                                .title("Day 2")
                                .markdown("New day")
                                .build()
                ))
                .createdAt(Instant.now())
                .build();

        when(snapshotRepository.findByConversationIdAndVersion(conversationId, 1)).thenReturn(Optional.of(fromSnapshot));
        when(snapshotRepository.findByConversationIdAndVersion(conversationId, 2)).thenReturn(Optional.of(toSnapshot));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshotDiffResponse diff = service.diffSnapshots(conversationId, 1, 2);

        assertThat(diff.getFromVersion()).isEqualTo(1);
        assertThat(diff.getToVersion()).isEqualTo(2);
        assertThat(diff.getChanges())
                .extracting("field")
                .contains("summary", "markdown", "places", "selectedPlaceIds", "currentDayIndex", "completedDayIndexes", "dayPlans");
    }

    @Test
    void restoreDaySnapshotOnlyReplacesSelectedDayAndCreatesNewVersion() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .travelEndDate(LocalDate.of(2026, 6, 3))
                        .peopleCount(2)
                        .build())
                .title("Shanghai plan")
                .selectedPlaceIds(List.of())
                .build();
        PlannerDayPlanRef oldDayTwo = PlannerDayPlanRef.builder()
                .dayIndex(2)
                .status("CONFIRMED")
                .title("Old day 2")
                .markdown("Old day 2 markdown")
                .build();
        PlannerDayPlanRef latestDayOne = PlannerDayPlanRef.builder()
                .dayIndex(1)
                .status("CONFIRMED")
                .title("Latest day 1")
                .markdown("Latest day 1 markdown")
                .build();
        PlannerDayPlanRef latestDayTwo = PlannerDayPlanRef.builder()
                .dayIndex(2)
                .status("DRAFT")
                .title("Latest day 2")
                .markdown("Latest day 2 markdown")
                .build();
        PlannerSnapshot sourceSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(3)
                .targetDayIndex(2)
                .currentDayPlan(oldDayTwo)
                .dayPlans(List.of(oldDayTwo))
                .createdAt(Instant.now())
                .build();
        PlannerSnapshot latestSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(7)
                .dayPlans(List.of(latestDayOne, latestDayTwo))
                .createdAt(Instant.now())
                .build();

        when(snapshotRepository.findByConversationIdAndVersion(conversationId, 3)).thenReturn(Optional.of(sourceSnapshot));
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshot));
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot restoredSnapshot = service.restoreDaySnapshot(conversation, 2, 3);

        assertThat(restoredSnapshot.getVersion()).isEqualTo(8);
        assertThat(restoredSnapshot.getScope()).isEqualTo("DAY_RESTORE");
        assertThat(restoredSnapshot.getTargetDayIndex()).isEqualTo(2);
        assertThat(restoredSnapshot.getCurrentDayPlan().getTitle()).isEqualTo("Old day 2");
        assertThat(restoredSnapshot.getDayPlans()).extracting(PlannerDayPlanRef::getTitle)
                .containsExactly("Latest day 1", "Old day 2");
        assertThat(restoredSnapshot.getCompletedDayIndexes()).containsExactly(1, 2);
    }

    @Test
    void restoreDaySnapshotPreservesOtherDaysWhenLatestSnapshotDroppedDayPlans() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .travelEndDate(LocalDate.of(2026, 6, 3))
                        .peopleCount(2)
                        .build())
                .title("Shanghai plan")
                .selectedPlaceIds(List.of())
                .build();
        PlannerDayPlanRef oldDayTwo = PlannerDayPlanRef.builder()
                .dayIndex(2)
                .status("CONFIRMED")
                .title("Old day 2")
                .markdown("Old day 2 markdown")
                .build();
        PlannerDayPlanRef latestDayOne = PlannerDayPlanRef.builder()
                .dayIndex(1)
                .status("CONFIRMED")
                .title("Latest day 1")
                .markdown("Latest day 1 markdown")
                .build();
        PlannerDayPlanRef latestDayTwo = PlannerDayPlanRef.builder()
                .dayIndex(2)
                .status("DRAFT")
                .title("Latest day 2")
                .markdown("Latest day 2 markdown")
                .build();
        PlannerSnapshot sourceSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(3)
                .currentDayPlan(oldDayTwo)
                .createdAt(Instant.now())
                .build();
        PlannerSnapshot latestSnapshotWithoutDayPlans = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(7)
                .title("Latest wrapper")
                .markdown("# Latest wrapper")
                .createdAt(Instant.now())
                .build();
        PlannerSnapshot dayOneSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(6)
                .currentDayPlan(latestDayOne)
                .createdAt(Instant.now())
                .build();
        PlannerSnapshot dayTwoLatestSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(5)
                .currentDayPlan(latestDayTwo)
                .createdAt(Instant.now())
                .build();

        when(snapshotRepository.findByConversationIdAndVersion(conversationId, 3)).thenReturn(Optional.of(sourceSnapshot));
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshotWithoutDayPlans));
        when(snapshotRepository.findByConversationIdOrderByVersionDesc(conversationId))
                .thenReturn(List.of(latestSnapshotWithoutDayPlans, dayOneSnapshot, dayTwoLatestSnapshot, sourceSnapshot));
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot restoredSnapshot = service.restoreDaySnapshot(conversation, 2, 3);

        assertThat(restoredSnapshot.getVersion()).isEqualTo(8);
        assertThat(restoredSnapshot.getDayPlans()).extracting(PlannerDayPlanRef::getTitle)
                .containsExactly("Latest day 1", "Old day 2");
        assertThat(restoredSnapshot.getMarkdown()).isEqualTo("Old day 2 markdown");
    }

    @Test
    void activateDayVersionSwitchesPointerWithoutCreatingDayRevision() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .travelEndDate(LocalDate.of(2026, 6, 2))
                        .peopleCount(2)
                        .build())
                .title("Shanghai plan")
                .selectedPlaceIds(List.of())
                .build();
        PlannerDayRevision dayOne = PlannerDayRevision.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .dayIndex(1)
                .dayVersion(1)
                .status("CONFIRMED")
                .title("Latest day 1")
                .markdown("Latest day 1 markdown")
                .createdAt(Instant.now())
                .build();
        PlannerDayRevision oldDayTwo = PlannerDayRevision.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .dayIndex(2)
                .dayVersion(1)
                .status("CONFIRMED")
                .title("Old day 2")
                .markdown("Old day 2 markdown")
                .createdAt(Instant.now())
                .build();
        PlannerDayRevision latestDayTwo = PlannerDayRevision.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .dayIndex(2)
                .dayVersion(2)
                .status("CONFIRMED")
                .title("Latest day 2")
                .markdown("Latest day 2 markdown")
                .createdAt(Instant.now())
                .build();
        dayRevisionStore.put(dayOne.getId(), dayOne);
        dayRevisionStore.put(oldDayTwo.getId(), oldDayTwo);
        dayRevisionStore.put(latestDayTwo.getId(), latestDayTwo);
        conversation.getCurrentDayRevisionIds().put("1", dayOne.getId());
        conversation.getCurrentDayRevisionIds().put("2", latestDayTwo.getId());

        PlannerSnapshot latestSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(5)
                .title("Latest wrapper")
                .markdown("# Latest wrapper")
                .createdAt(Instant.now())
                .build();

        when(dayRevisionRepository.findByConversationId(conversationId)).thenReturn(List.of(dayOne, oldDayTwo, latestDayTwo));
        when(dayRevisionRepository.findByConversationIdAndDayIndexAndDayVersion(conversationId, 2, 1)).thenReturn(Optional.of(oldDayTwo));
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshot));
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot activatedSnapshot = service.activateDayVersion(conversation, 2, 1);

        assertThat(activatedSnapshot.getVersion()).isEqualTo(6);
        assertThat(activatedSnapshot.getScope()).isEqualTo("DAY_VERSION_ACTIVATE");
        assertThat(conversation.getCurrentDayRevisionIds()).containsEntry("2", oldDayTwo.getId());
        assertThat(activatedSnapshot.getDayPlans()).extracting(PlannerDayPlanRef::getTitle)
                .containsExactly("Latest day 1", "Old day 2");
        verify(dayRevisionRepository, never()).save(any(PlannerDayRevision.class));
    }

    @Test
    void assembleTripSnapshotBuildsMarkdownWithoutCallingAgent() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .travelEndDate(LocalDate.of(2026, 6, 2))
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
                .dayPlans(List.of(
                        PlannerDayPlanRef.builder()
                                .dayIndex(1)
                                .status("CONFIRMED")
                                .title("Day 1")
                                .markdown("Day 1 markdown")
                                .build(),
                        PlannerDayPlanRef.builder()
                                .dayIndex(2)
                                .status("CONFIRMED")
                                .title("Day 2")
                                .markdown("Day 2 markdown")
                                .build()
                ))
                .createdAt(Instant.now())
                .build();

        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshot));
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot assembledSnapshot = service.assembleTripSnapshot(conversation);

        assertThat(assembledSnapshot.getVersion()).isEqualTo(5);
        assertThat(assembledSnapshot.getScope()).isEqualTo("TRIP_ASSEMBLE");
        assertThat(assembledSnapshot.getMarkdown()).contains("Day 1 markdown", "Day 2 markdown");
        assertThat(assembledSnapshot.getCompletedDayIndexes()).containsExactly(1, 2);
        verify(plannerAiClient, never()).extractSnapshotDraft(any());
    }

    @Test
    void assembleTripSnapshotUsesHistoricalDayPlansWhenLatestSnapshotDroppedDayPlans() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = PlannerConversation.builder()
                .id(conversationId)
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .travelEndDate(LocalDate.of(2026, 6, 2))
                        .peopleCount(2)
                        .build())
                .title("Shanghai plan")
                .selectedPlaceIds(List.of())
                .build();
        PlannerDayPlanRef dayOne = PlannerDayPlanRef.builder()
                .dayIndex(1)
                .status("CONFIRMED")
                .title("Day 1")
                .markdown("Day 1 markdown")
                .build();
        PlannerDayPlanRef dayTwo = PlannerDayPlanRef.builder()
                .dayIndex(2)
                .status("CONFIRMED")
                .title("Day 2")
                .markdown("Day 2 markdown")
                .build();
        PlannerSnapshot latestSnapshotWithoutDayPlans = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(4)
                .title("Latest wrapper")
                .markdown("# Latest wrapper")
                .createdAt(Instant.now())
                .build();
        PlannerSnapshot dayTwoSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(3)
                .currentDayPlan(dayTwo)
                .createdAt(Instant.now())
                .build();
        PlannerSnapshot dayOneSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(2)
                .currentDayPlan(dayOne)
                .createdAt(Instant.now())
                .build();

        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshotWithoutDayPlans));
        when(snapshotRepository.findByConversationIdOrderByVersionDesc(conversationId))
                .thenReturn(List.of(latestSnapshotWithoutDayPlans, dayTwoSnapshot, dayOneSnapshot));
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot assembledSnapshot = service.assembleTripSnapshot(conversation);

        assertThat(assembledSnapshot.getVersion()).isEqualTo(5);
        assertThat(assembledSnapshot.getMarkdown()).contains("Day 1 markdown", "Day 2 markdown");
        assertThat(assembledSnapshot.getDayPlans()).extracting(PlannerDayPlanRef::getTitle)
                .containsExactly("Day 1", "Day 2");
    }

    @Test
    void createMarkdownSnapshotSavesDayEditAsSnapshotAndDayRevision() {
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
        PlannerDayPlanRef dayOne = PlannerDayPlanRef.builder()
                .dayIndex(1)
                .status("DRAFT")
                .title("Day 1")
                .markdown("old markdown")
                .build();
        PlannerSnapshot latestSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(4)
                .scope("DAY_PLAN")
                .currentDayIndex(1)
                .title("Shanghai plan")
                .markdown("old markdown")
                .currentDayPlan(dayOne)
                .dayPlans(List.of(dayOne))
                .selectedPlaceIds(List.of())
                .createdAt(Instant.now())
                .build();

        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshot));
        when(dayRevisionRepository.findByConversationId(conversationId)).thenReturn(List.of());
        when(snapshotRepository.findByConversationIdOrderByVersionDesc(conversationId)).thenReturn(List.of(latestSnapshot));
        when(dayRevisionRepository.findFirstByConversationIdAndDayIndexAndContentHashOrderByDayVersionDesc(eq(conversationId), eq(1), any()))
                .thenReturn(Optional.empty());
        when(dayRevisionRepository.findFirstByConversationIdAndDayIndexOrderByDayVersionDesc(conversationId, 1))
                .thenReturn(Optional.empty());
        when(snapshotRepository.save(any(PlannerSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        PlannerSnapshot snapshot = service.createMarkdownSnapshot(conversation, CreatePlannerMarkdownSnapshotRequest.builder()
                .userId(userId)
                .mode(CreatePlannerMarkdownSnapshotRequest.Mode.DAY)
                .dayIndex(1)
                .baseVersion(4)
                .markdown("manual markdown")
                .build());

        assertThat(snapshot.getVersion()).isEqualTo(5);
        assertThat(snapshot.getBaseVersion()).isEqualTo(4);
        assertThat(snapshot.getScope()).isEqualTo("DAY_MARKDOWN_EDIT");
        assertThat(snapshot.getMarkdown()).isEqualTo("manual markdown");
        assertThat(snapshot.getCurrentDayPlan().getMarkdown()).isEqualTo("manual markdown");
        assertThat(snapshot.getDayPlans()).extracting(PlannerDayPlanRef::getMarkdown).containsExactly("manual markdown");
        assertThat(dayRevisionStore.values()).extracting(PlannerDayRevision::getMarkdown).contains("manual markdown");
    }

    @Test
    void createMarkdownSnapshotRejectsStaleBaseVersion() {
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
                .version(7)
                .title("Shanghai plan")
                .markdown("latest")
                .createdAt(Instant.now())
                .build();

        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latestSnapshot));

        PlannerSnapshotService service = new PlannerSnapshotService(
                plannerAiClient,
                promptFactory,
                new PlannerMarkdownBuilder(),
                new PlaceEnrichmentService(amapPoiClient, internalOfferHotelMatcher),
                messageRepository,
                snapshotRepository,
                dayRevisionRepository
        );

        assertThatThrownBy(() -> service.createMarkdownSnapshot(conversation, CreatePlannerMarkdownSnapshotRequest.builder()
                .userId(userId)
                .mode(CreatePlannerMarkdownSnapshotRequest.Mode.TRIP)
                .baseVersion(6)
                .markdown("manual markdown")
                .build()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409 CONFLICT");
        verify(snapshotRepository, never()).save(any(PlannerSnapshot.class));
    }
}
