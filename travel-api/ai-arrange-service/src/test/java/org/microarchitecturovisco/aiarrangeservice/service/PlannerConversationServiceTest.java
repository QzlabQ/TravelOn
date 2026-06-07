package org.microarchitecturovisco.aiarrangeservice.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAgentClient;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageType;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentToolCall;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentWarning;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerStreamEvent;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerDataRefreshPayload;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.PlannerChatSendPayload;
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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.timeout;
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
    private PlannerAgentClient plannerAgentClient;

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
                plannerAgentClient,
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

    @Test
    void runPlannerAgentCallsPythonAgentAndSavesJavaVersionedSnapshot() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = conversation(conversationId, userId);
        PlannerSnapshot latest = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(4)
                .title("Old")
                .markdown("# Old")
                .createdAt(Instant.now())
                .build();
        AgentRunResponse response = agentResponse(4, 99, "snapshot-checksum");
        PlannerSnapshot savedSnapshot = agentSnapshot(conversationId, userId, 5, 4, "snapshot-checksum");

        when(conversationRepository.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.of(conversation));
        when(conversationRepository.save(any(PlannerConversation.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)).thenReturn(List.of());
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.of(latest));
        when(plannerAgentClient.runPlanner(any(AgentRunRequest.class))).thenReturn(response);
        when(snapshotService.createSnapshotFromAgentResponse(any(PlannerConversation.class), eq(response))).thenReturn(savedSnapshot);

        PlannerConversationService service = new PlannerConversationService(
                conversationRepository,
                messageRepository,
                snapshotRepository,
                promptFactory,
                plannerAiClient,
                plannerAgentClient,
                snapshotService,
                webSocketSessionRegistry,
                plannerExecutorService
        );

        PlannerSnapshot snapshot = service.runPlannerAgent(
                conversationId,
                userId,
                PlannerChatSendPayload.builder().message("生成第二天").targetDayIndex(2).build()
        );

        ArgumentCaptor<AgentRunRequest> requestCaptor = ArgumentCaptor.forClass(AgentRunRequest.class);
        verify(plannerAgentClient).runPlanner(requestCaptor.capture());
        AgentRunRequest request = requestCaptor.getValue();
        assertThat(request.getLatestSnapshot().getVersion()).isEqualTo(4);
        assertThat(request.getPlanningMode()).isEqualTo("REFINE_WITH_SELECTION");
        assertThat(request.getPlanningScope()).isEqualTo("DAY_REFINE");
        assertThat(request.getTargetDayIndex()).isEqualTo(2);

        assertThat(snapshot.getVersion()).isEqualTo(5);
        assertThat(snapshot.getVersion()).isNotEqualTo(99);
        assertThat(snapshot.getBaseVersion()).isEqualTo(4);
        assertThat(snapshot.getTraceId()).isEqualTo("trace-1");
        assertThat(snapshot.getChecksum()).isEqualTo("snapshot-checksum");
        verify(snapshotService).createSnapshotFromAgentResponse(any(PlannerConversation.class), eq(response));
        verify(webSocketSessionRegistry).send(eq(conversationId), eq(PlannerMessageType.PLANNER_SNAPSHOT_SAVED), any());
    }

    @Test
    void handleChatMessageStreamsPythonAgentEvents() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = conversation(conversationId, userId);
        AgentRunResponse response = agentResponse(null, 1, "stream-checksum");
        PlannerSnapshot savedSnapshot = agentSnapshot(conversationId, userId, 1, null, "stream-checksum");
        ExecutorService executorService = Executors.newSingleThreadExecutor();

        when(conversationRepository.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.of(conversation));
        when(conversationRepository.save(any(PlannerConversation.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)).thenReturn(List.of());
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.empty());
        when(snapshotService.createSnapshotFromAgentResponse(any(PlannerConversation.class), eq(response))).thenReturn(savedSnapshot);
        when(plannerAgentClient.streamPlanner(any(AgentRunRequest.class), any())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Consumer<PlannerStreamEvent> consumer = invocation.getArgument(1, Consumer.class);
            consumer.accept(PlannerStreamEvent.builder()
                    .traceId("trace-1")
                    .conversationId(conversationId)
                    .userId(userId)
                    .type("RUN_STARTED")
                    .status("RUNNING")
                    .message("开始生成旅行规划。")
                    .build());
            return CompletableFuture.completedFuture(response);
        });

        PlannerConversationService service = new PlannerConversationService(
                conversationRepository,
                messageRepository,
                snapshotRepository,
                promptFactory,
                plannerAiClient,
                plannerAgentClient,
                snapshotService,
                webSocketSessionRegistry,
                executorService
        );

        service.handleChatMessage(conversationId, userId, PlannerChatSendPayload.builder().message("生成第一天").build());

        verify(webSocketSessionRegistry, timeout(1000)).send(eq(conversationId), eq(PlannerMessageType.PLANNER_TRACE_EVENT), any());
        verify(webSocketSessionRegistry, timeout(1000)).send(eq(conversationId), eq(PlannerMessageType.PLANNER_SNAPSHOT_SAVED), any());
        executorService.shutdownNow();
    }

    @Test
    void handleChatMessageReportsAgentFallbackWarning() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        PlannerConversation conversation = conversation(conversationId, userId);
        AgentRunResponse response = agentResponse(null, 1, "fallback-checksum");
        response.setStatus("PARTIAL_SUCCESS");
        response.setToolCalls(List.of(
                PlannerAgentToolCall.builder()
                        .tool("deepseek_chat_completion")
                        .status("FAILED")
                        .detail("All connection attempts failed")
                        .retryCount(1)
                        .build(),
                PlannerAgentToolCall.builder()
                        .tool("fallback_plan_builder")
                        .status("SUCCESS")
                        .build()
        ));
        response.setWarnings(List.of(
                PlannerAgentWarning.builder()
                        .code("MODEL_FAILED")
                        .message("模型生成失败，已使用本地规划模板。")
                        .source("deepseek")
                        .build()
        ));
        PlannerSnapshot savedSnapshot = agentSnapshot(conversationId, userId, 1, null, "fallback-checksum");
        ExecutorService executorService = Executors.newSingleThreadExecutor();

        when(conversationRepository.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.of(conversation));
        when(conversationRepository.save(any(PlannerConversation.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)).thenReturn(List.of());
        when(snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId)).thenReturn(Optional.empty());
        when(snapshotService.createSnapshotFromAgentResponse(any(PlannerConversation.class), eq(response))).thenReturn(savedSnapshot);
        when(plannerAgentClient.streamPlanner(any(AgentRunRequest.class), any())).thenReturn(CompletableFuture.completedFuture(response));

        PlannerConversationService service = new PlannerConversationService(
                conversationRepository,
                messageRepository,
                snapshotRepository,
                promptFactory,
                plannerAiClient,
                plannerAgentClient,
                snapshotService,
                webSocketSessionRegistry,
                executorService
        );

        service.handleChatMessage(conversationId, userId, PlannerChatSendPayload.builder().message("生成第一天").build());

        ArgumentCaptor<String> detailCaptor = ArgumentCaptor.forClass(String.class);
        verify(webSocketSessionRegistry, timeout(1000)).sendError(
                eq(conversationId),
                eq("PLANNER_AGENT_FALLBACK_USED"),
                eq("模型生成失败，已返回本地兜底规划。请检查 DeepSeek 网络/API 配置。"),
                detailCaptor.capture()
        );
        assertThat(detailCaptor.getValue()).contains("deepseek_chat_completion 失败");
        assertThat(detailCaptor.getValue()).contains("All connection attempts failed");
        assertThat(detailCaptor.getValue()).contains("fallback_plan_builder");
        executorService.shutdownNow();
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

    private AgentRunResponse agentResponse(Integer baseVersion, Integer proposedVersion, String checksum) {
        return AgentRunResponse.builder()
                .traceId("trace-1")
                .status("SUCCESS")
                .assistantText("已生成规划。")
                .title("Shanghai plan")
                .summary("summary")
                .markdown("# Shanghai plan")
                .nextQuestion("是否确认当天？")
                .nextAction("ASK_USER_SELECTION")
                .snapshotDraft(PlannerSnapshotDraft.builder()
                        .baseVersion(baseVersion)
                        .proposedVersion(proposedVersion)
                        .scope("DAY_PLAN")
                        .targetDayIndex(1)
                        .markdown("# Shanghai plan")
                        .changeSummary("Generated by agent.")
                        .checksum(checksum)
                        .build())
                .build();
    }

    private PlannerSnapshot agentSnapshot(UUID conversationId, UUID userId, Integer version, Integer baseVersion, String checksum) {
        return PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .version(version)
                .baseVersion(baseVersion)
                .title("Shanghai plan")
                .summary("summary")
                .markdown("# Shanghai plan")
                .nextQuestion("是否确认当天？")
                .assistantText("已生成规划。")
                .checksum(checksum)
                .traceId("trace-1")
                .createdAt(Instant.now())
                .build();
    }
}
