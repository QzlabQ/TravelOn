package org.microarchitecturovisco.aiarrangeservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.client.AiChatMessage;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAgentClient;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageRole;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageType;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentHistoryMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentSnapshotRef;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerInteractionInput;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerStreamEvent;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.PlannerChatSendPayload;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerChatStreamPayload;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerConversationResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerDataRefreshPayload;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerConversationRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerMessageRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerSnapshotRepository;
import org.microarchitecturovisco.aiarrangeservice.websocket.PlannerWebSocketSessionRegistry;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class PlannerConversationService {

    private static final Logger logger = Logger.getLogger(PlannerConversationService.class.getName());

    private final PlannerConversationRepository conversationRepository;
    private final PlannerMessageRepository messageRepository;
    private final PlannerSnapshotRepository snapshotRepository;
    private final PlannerPromptFactory promptFactory;
    private final PlannerAiClient plannerAiClient;
    private final PlannerAgentClient plannerAgentClient;
    private final PlannerSnapshotService snapshotService;
    private final PlannerWebSocketSessionRegistry webSocketSessionRegistry;
    private final ExecutorService plannerExecutorService;

    public PlannerConversationResponse createConversation(UUID userId, TripCoreSlots coreSlots) {
        PlannerConversation conversation = PlannerConversation.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .status(PlannerConversationStatus.ACTIVE_CHAT)
                .coreSlots(coreSlots)
                .title(defaultTitle(coreSlots))
                .currentMarkdown("")
                .nextQuestion(defaultNextQuestion())
                .latestSnapshotVersion(0)
                .selectedPlaceIds(new ArrayList<>())
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        return PlannerConversationResponse.from(conversationRepository.save(conversation));
    }

    public PlannerConversationResponse updateCoreSlots(UUID conversationId, UUID userId, TripCoreSlots coreSlots) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        conversation.setCoreSlots(coreSlots);
        conversation.setStatus(PlannerConversationStatus.ACTIVE_CHAT);
        conversation.setTitle(defaultTitle(coreSlots));
        conversation.setNextQuestion(defaultNextQuestion());
        conversation.setUpdatedAt(Instant.now());
        return PlannerConversationResponse.from(conversationRepository.save(conversation));
    }

    public PlannerConversationResponse updateSelection(UUID conversationId, UUID userId, List<UUID> selectedPlaceIds) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        List<UUID> safeSelectedPlaceIds = selectedPlaceIds == null ? new ArrayList<>() : new ArrayList<>(selectedPlaceIds);
        conversation.setSelectedPlaceIds(safeSelectedPlaceIds);
        conversation.setUpdatedAt(Instant.now());
        PlannerConversation savedConversation = conversationRepository.save(conversation);

        PlannerSnapshot snapshot = snapshotService.updateSelectionSnapshot(savedConversation, safeSelectedPlaceIds);
        refreshConversationFromSnapshot(savedConversation, snapshot);
        PlannerConversation refreshedConversation = conversationRepository.save(savedConversation);
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(refreshedConversation.getStatus(), snapshot));
        return PlannerConversationResponse.from(refreshedConversation);
    }

    public PlannerConversationResponse getConversation(UUID conversationId, UUID userId) {
        return PlannerConversationResponse.from(getOwnedConversation(conversationId, userId));
    }

    public List<PlannerConversationResponse> listConversations(UUID userId) {
        return conversationRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                .stream()
                .map(PlannerConversationResponse::from)
                .toList();
    }

    public List<PlannerSnapshot> listSnapshots(UUID conversationId, UUID userId) {
        getOwnedConversation(conversationId, userId);
        return snapshotRepository.findByConversationIdOrderByVersionDesc(conversationId);
    }

    public PlannerSnapshot runPlannerAgent(UUID conversationId, UUID userId, PlannerChatSendPayload payload) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        PlannerChatSendPayload safePayload = payload == null ? new PlannerChatSendPayload() : payload;
        applySelectedPlaces(conversation, safePayload);

        if (StringUtils.hasText(safePayload.getMessage())) {
            saveMessage(conversationId, userId, PlannerMessageRole.USER, safePayload.getMessage(), null, Map.of("source", "planner-agent-rest"));
        }

        List<PlannerMessage> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId).orElse(null);
        AgentRunRequest request = buildAgentRunRequest(conversation, userId, safePayload, latestSnapshot, history);
        AgentRunResponse response = plannerAgentClient.runPlanner(request);
        PlannerSnapshot snapshot = finalizeAgentTurnFromAgent(conversation, userId, response, "planner-agent-rest");
        if (snapshot == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Planner Agent 未返回快照草稿，无法保存正式规划快照");
        }
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(conversation.getStatus(), snapshot, response.getRecommendationGroups()));
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                Map.of("version", snapshot.getVersion(), "traceId", response.getTraceId()));
        return snapshot;
    }

    public void handleChatMessage(UUID conversationId, UUID userId, PlannerChatSendPayload payload) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        if (conversation.getStatus() == PlannerConversationStatus.COLLECTING_CORE_SLOTS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "开始对话前请先补充必要出行信息");
        }
        if (payload.getMessage() == null || payload.getMessage().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "消息内容不能为空");
        }

        applySelectedPlaces(conversation, payload);

        saveMessage(conversationId, userId, PlannerMessageRole.USER, payload.getMessage(), null, Map.of("source", "websocket"));

        List<PlannerMessage> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        PlannerConversation activeConversation = conversation;
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId).orElse(null);
        AgentRunRequest agentRequest = buildAgentRunRequest(activeConversation, userId, payload, latestSnapshot, history);

        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_CHAT_STREAM,
                PlannerChatStreamPayload.builder().delta("").done(false).build());

        plannerAgentClient.streamPlanner(agentRequest, event -> forwardAgentStreamEvent(conversationId, event))
                .thenApplyAsync(response -> finalizeAgentTurnFromAgent(activeConversation, userId, response, "planner-agent-stream"), plannerExecutorService)
                .thenAccept(snapshot -> {
                    webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_CHAT_STREAM,
                            PlannerChatStreamPayload.builder().delta("").done(true).build());
                    if (snapshot != null) {
                        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                                PlannerDataRefreshPayload.from(activeConversation.getStatus(), snapshot));
                        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                                Map.of("version", snapshot.getVersion()));
                    }
                })
                .exceptionally(error -> {
                    logger.warning("Planner chat failed: " + error.getMessage());
                    webSocketSessionRegistry.sendError(conversationId, "PLANNER_CHAT_FAILED", "规划生成失败，请稍后重试或补充更明确的偏好。");
                    return null;
                });
    }

    public PlannerConversation getOwnedConversation(UUID conversationId, UUID userId) {
        return conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "未找到对应规划会话"));
    }

    public void assertAccess(UUID conversationId, UUID userId) {
        getOwnedConversation(conversationId, userId);
    }

    private PlannerSnapshot finalizeAssistantTurn(PlannerConversation conversation, UUID userId, String assistantText) {
        saveMessage(conversation.getId(), userId, PlannerMessageRole.ASSISTANT, assistantText, plannerAiClient.model(), Map.of("source", "ai"));
        PlannerSnapshot snapshot = snapshotService.createSnapshot(conversation, assistantText);
        refreshConversationFromSnapshot(conversation, snapshot);
        conversationRepository.save(conversation);
        return snapshot;
    }

    private PlannerSnapshot finalizeAgentTurnFromAgent(PlannerConversation conversation, UUID userId, AgentRunResponse response, String source) {
        if (response == null) {
            throw new IllegalStateException("Planner Agent 返回了空响应");
        }

        saveMessage(conversation.getId(), userId, PlannerMessageRole.ASSISTANT,
                StringUtils.hasText(response.getAssistantText()) ? response.getAssistantText() : response.getMarkdown(),
                "ai-arrange-agent-service",
                Map.of("source", source, "traceId", response.getTraceId() == null ? "" : response.getTraceId()));

        if (response.getSnapshotDraft() == null) {
            conversation.setTitle(nonBlank(response.getTitle(), conversation.getTitle()));
            conversation.setCurrentMarkdown(nonBlank(response.getMarkdown(), conversation.getCurrentMarkdown()));
            conversation.setNextQuestion(nonBlank(response.getNextQuestion(), conversation.getNextQuestion()));
            conversation.setUpdatedAt(Instant.now());
            conversationRepository.save(conversation);
            return null;
        }

        PlannerSnapshot snapshot = snapshotService.createSnapshotFromAgentResponse(conversation, response);
        if (snapshot == null) {
            throw new IllegalStateException("Planner Agent 快照保存结果为空");
        }
        refreshConversationFromSnapshot(conversation, snapshot);
        conversationRepository.save(conversation);
        return snapshot;
    }

    private void refreshConversationFromSnapshot(PlannerConversation conversation, PlannerSnapshot snapshot) {
        conversation.setCurrentMarkdown(snapshot.getMarkdown());
        conversation.setNextQuestion(snapshot.getNextQuestion());
        conversation.setTitle(snapshot.getTitle());
        conversation.setLatestSnapshotVersion(snapshot.getVersion());
        conversation.setUpdatedAt(Instant.now());
    }

    private PlannerMessage saveMessage(UUID conversationId, UUID userId, PlannerMessageRole role, String content, String model, Map<String, Object> metadata) {
        PlannerMessage message = PlannerMessage.builder()
                .id(UUID.randomUUID())
                .conversationId(conversationId)
                .userId(userId)
                .role(role)
                .content(content)
                .model(model)
                .metadata(metadata)
                .createdAt(Instant.now())
                .build();
        return messageRepository.save(message);
    }

    private String defaultTitle(TripCoreSlots slots) {
        return slots.getCity() + " \u884C\u524D\u89C4\u5212";
    }

    private String defaultNextQuestion() {
        return "你想先从酒店区域、核心景点，还是餐厅偏好开始？";
    }

    private AgentRunRequest buildAgentRunRequest(
            PlannerConversation conversation,
            UUID userId,
            PlannerChatSendPayload payload,
            PlannerSnapshot latestSnapshot,
            List<PlannerMessage> history
    ) {
        return AgentRunRequest.builder()
                .conversationId(conversation.getId())
                .userId(userId)
                .planningMode(resolvePlanningMode(payload, latestSnapshot))
                .planningScope(resolvePlanningScope(payload, latestSnapshot))
                .targetDayIndex(payload.getTargetDayIndex())
                .targetDate(payload.getTargetDate())
                .coreSlots(conversation.getCoreSlots())
                .userMessage(payload.getMessage() == null ? "" : payload.getMessage())
                .selectedPlaceIds(selectedPlaceIdsForRequest(conversation, payload))
                .interaction(resolveInteraction(payload))
                .latestSnapshot(toAgentSnapshotRef(latestSnapshot))
                .history(toAgentHistory(history))
                .build();
    }

    private void applySelectedPlaces(PlannerConversation conversation, PlannerChatSendPayload payload) {
        if (payload.getSelectedPlaceIds() != null && !payload.getSelectedPlaceIds().isEmpty()) {
            conversation.setSelectedPlaceIds(new ArrayList<>(payload.getSelectedPlaceIds()));
            conversation.setUpdatedAt(Instant.now());
            conversationRepository.save(conversation);
        }
    }

    private List<UUID> selectedPlaceIdsForRequest(PlannerConversation conversation, PlannerChatSendPayload payload) {
        if (payload.getSelectedPlaceIds() != null && !payload.getSelectedPlaceIds().isEmpty()) {
            return new ArrayList<>(payload.getSelectedPlaceIds());
        }
        return conversation.getSelectedPlaceIds() == null ? new ArrayList<>() : new ArrayList<>(conversation.getSelectedPlaceIds());
    }

    private PlannerInteractionInput resolveInteraction(PlannerChatSendPayload payload) {
        if (payload.getInteraction() != null) {
            return payload.getInteraction();
        }
        return PlannerInteractionInput.builder()
                .selectedPlaceIds(payload.getSelectedPlaceIds() == null ? new ArrayList<>() : new ArrayList<>(payload.getSelectedPlaceIds()))
                .freeText(payload.getMessage())
                .build();
    }

    private String resolvePlanningMode(PlannerChatSendPayload payload, PlannerSnapshot latestSnapshot) {
        if (StringUtils.hasText(payload.getPlanningMode())) {
            return payload.getPlanningMode();
        }
        return latestSnapshot == null || latestSnapshot.getVersion() == null || latestSnapshot.getVersion() <= 0
                ? "INITIAL_PLAN"
                : "REFINE_WITH_SELECTION";
    }

    private String resolvePlanningScope(PlannerChatSendPayload payload, PlannerSnapshot latestSnapshot) {
        if (StringUtils.hasText(payload.getPlanningScope())) {
            return payload.getPlanningScope();
        }
        return latestSnapshot == null || latestSnapshot.getVersion() == null || latestSnapshot.getVersion() <= 0
                ? "DAY_PLAN"
                : "DAY_REFINE";
    }

    private PlannerAgentSnapshotRef toAgentSnapshotRef(PlannerSnapshot snapshot) {
        if (snapshot == null) {
            return null;
        }
        return PlannerAgentSnapshotRef.builder()
                .version(snapshot.getVersion())
                .markdown(snapshot.getMarkdown())
                .places(snapshot.getPlaces() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getPlaces()))
                .routes(snapshot.getRoutes() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getRoutes()))
                .dayPlans(snapshot.getDayPlans() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getDayPlans()))
                .currentDayIndex(snapshot.getCurrentDayIndex())
                .completedDayIndexes(snapshot.getCompletedDayIndexes() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getCompletedDayIndexes()))
                .build();
    }

    private List<PlannerAgentHistoryMessage> toAgentHistory(List<PlannerMessage> messages) {
        if (messages == null) {
            return new ArrayList<>();
        }
        return messages.stream()
                .map(message -> PlannerAgentHistoryMessage.builder()
                        .role(message.getRole() == null ? null : message.getRole().name().toLowerCase())
                        .content(message.getContent())
                        .model(message.getModel())
                        .createdAt(message.getCreatedAt() == null ? null : message.getCreatedAt().toString())
                        .build())
                .toList();
    }

    private void forwardAgentStreamEvent(UUID conversationId, PlannerStreamEvent event) {
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_TRACE_EVENT, event);
        if ("OPTIONS_READY".equals(event.getType())) {
            webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_OPTIONS_REFRESH, event.getData());
        }
    }

    private String nonBlank(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }
}
