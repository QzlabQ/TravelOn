package org.microarchitecturovisco.aiarrangeservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.client.AiChatMessage;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAgentStreamException;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAgentClient;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageRole;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageType;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerRunStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerActiveRun;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentToolCall;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentWarning;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentHistoryMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerAgentSnapshotRef;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerInteractionInput;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerStreamEvent;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.CreatePlannerMarkdownSnapshotRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.PlannerChatSendPayload;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerChatStreamPayload;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerConversationResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerDayVersionResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerDataRefreshPayload;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerSnapshotDiffResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerRunStatePayload;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerConversationRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerMessageRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerSnapshotRepository;
import org.microarchitecturovisco.aiarrangeservice.websocket.PlannerWebSocketSessionRegistry;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.dao.DataAccessException;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.net.ConnectException;
import java.net.UnknownHostException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ExecutionException;
import java.util.logging.Level;
import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class PlannerConversationService {

    private static final Logger logger = Logger.getLogger(PlannerConversationService.class.getName());

    private final PlannerConversationRepository conversationRepository;
    private final PlannerMessageRepository messageRepository;
    private final PlannerSnapshotRepository snapshotRepository;
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

    public PlannerSnapshot getSnapshot(UUID conversationId, UUID userId, Integer version) {
        getOwnedConversation(conversationId, userId);
        return snapshotService.getSnapshot(conversationId, version);
    }

    public List<PlannerDayVersionResponse> listDayVersions(UUID conversationId, UUID userId, Integer dayIndex) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        List<PlannerDayVersionResponse> versions = snapshotService.listDayVersions(conversation, dayIndex);
        conversationRepository.save(conversation);
        return versions;
    }

    public PlannerSnapshot activateDayVersion(UUID conversationId, UUID userId, Integer dayIndex, Integer dayVersion) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        PlannerSnapshot snapshot = snapshotService.activateDayVersion(conversation, dayIndex, dayVersion);
        conversation.setSelectedPlaceIds(snapshot.getSelectedPlaceIds() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getSelectedPlaceIds()));
        refreshConversationFromSnapshot(conversation, snapshot);
        conversationRepository.save(conversation);
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(conversation.getStatus(), snapshot));
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                Map.of("version", snapshot.getVersion(), "activatedDayIndex", dayIndex, "activatedDayVersion", dayVersion));
        return snapshot;
    }

    public PlannerSnapshot rollbackSnapshot(UUID conversationId, UUID userId, Integer version) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        PlannerSnapshot snapshot = snapshotService.rollbackSnapshot(conversation, version);
        conversation.setSelectedPlaceIds(snapshot.getSelectedPlaceIds() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getSelectedPlaceIds()));
        refreshConversationFromSnapshot(conversation, snapshot);
        conversationRepository.save(conversation);
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(conversation.getStatus(), snapshot));
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                Map.of("version", snapshot.getVersion(), "restoredFromVersion", version));
        return snapshot;
    }

    public PlannerSnapshot restoreDaySnapshot(UUID conversationId, UUID userId, Integer dayIndex, Integer version) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        PlannerSnapshot snapshot = snapshotService.restoreDaySnapshot(conversation, dayIndex, version);
        conversation.setSelectedPlaceIds(snapshot.getSelectedPlaceIds() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getSelectedPlaceIds()));
        refreshConversationFromSnapshot(conversation, snapshot);
        conversationRepository.save(conversation);
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(conversation.getStatus(), snapshot));
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                Map.of("version", snapshot.getVersion(), "restoredDayIndex", dayIndex, "restoredFromVersion", version));
        return snapshot;
    }

    public PlannerSnapshot assembleTripSnapshot(UUID conversationId, UUID userId) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        PlannerSnapshot snapshot = snapshotService.assembleTripSnapshot(conversation);
        conversation.setSelectedPlaceIds(snapshot.getSelectedPlaceIds() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getSelectedPlaceIds()));
        refreshConversationFromSnapshot(conversation, snapshot);
        conversationRepository.save(conversation);
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(conversation.getStatus(), snapshot));
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                Map.of("version", snapshot.getVersion(), "scope", "TRIP_ASSEMBLE"));
        return snapshot;
    }

    public PlannerSnapshot createMarkdownSnapshot(UUID conversationId, CreatePlannerMarkdownSnapshotRequest request) {
        if (request == null || request.getUserId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Markdown snapshot request requires userId");
        }
        PlannerConversation conversation = getOwnedConversation(conversationId, request.getUserId());
        PlannerSnapshot snapshot = snapshotService.createMarkdownSnapshot(conversation, request);
        conversation.setSelectedPlaceIds(snapshot.getSelectedPlaceIds() == null ? new ArrayList<>() : new ArrayList<>(snapshot.getSelectedPlaceIds()));
        refreshConversationFromSnapshot(conversation, snapshot);
        conversationRepository.save(conversation);
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(conversation.getStatus(), snapshot));
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                Map.of("version", snapshot.getVersion(), "scope", snapshot.getScope()));
        return snapshot;
    }

    public PlannerSnapshotDiffResponse diffSnapshots(UUID conversationId, UUID userId, Integer fromVersion, Integer toVersion) {
        getOwnedConversation(conversationId, userId);
        return snapshotService.diffSnapshots(conversationId, fromVersion, toVersion);
    }

    public PlannerSnapshot runPlannerAgent(UUID conversationId, UUID userId, PlannerChatSendPayload payload) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        PlannerChatSendPayload safePayload = payload == null ? new PlannerChatSendPayload() : payload;
        if (isDuplicateRun(conversation, safePayload)) {
            Integer version = conversation.getLatestSnapshotVersion();
            return version == null ? null : snapshotService.getSnapshot(conversationId, version);
        }
        UUID runId = prepareRun(conversation, safePayload);
        safePayload.setRunId(runId);
        applySelectedPlaces(conversation, safePayload);

        if (StringUtils.hasText(safePayload.getMessage())) {
            saveMessage(conversationId, userId, PlannerMessageRole.USER, safePayload.getMessage(), null, Map.of("source", "planner-agent-rest"));
        }

        List<PlannerMessage> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId).orElse(null);
        AgentRunRequest request = buildAgentRunRequest(conversation, userId, safePayload, latestSnapshot, history);
        try {
            AgentRunResponse response = plannerAgentClient.runPlanner(request);
        PlannerSnapshot snapshot = finalizeAgentTurnFromAgent(conversation, userId, response, "planner-agent-rest");
        if (snapshot == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Planner Agent 未返回快照草稿，无法保存正式规划快照");
        }
        markRunSucceeded(conversation, runId, response, safePayload.getTargetDayIndex());
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(conversation.getStatus(), snapshot, response.getRecommendationGroups()));
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                Map.of("version", snapshot.getVersion(), "traceId", response.getTraceId()));
        return snapshot;
        } catch (RuntimeException exception) {
            markRunFailed(conversation, runId, plannerErrorCode(exception), plannerErrorMessage(exception));
            throw exception;
        }
    }

    public void handleChatMessage(UUID conversationId, UUID userId, PlannerChatSendPayload payload) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        PlannerChatSendPayload safePayload = payload == null ? new PlannerChatSendPayload() : payload;
        if (conversation.getStatus() == PlannerConversationStatus.COLLECTING_CORE_SLOTS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "开始对话前请先补充必要出行信息");
        }
        if (safePayload.getMessage() == null || safePayload.getMessage().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "消息内容不能为空");
        }

        if (isDuplicateRun(conversation, safePayload)) {
            return;
        }
        UUID runId = prepareRun(conversation, safePayload);
        applySelectedPlaces(conversation, safePayload);

        saveMessage(conversationId, userId, PlannerMessageRole.USER, safePayload.getMessage(), null, Map.of("source", "websocket", "runId", runId.toString()));

        List<PlannerMessage> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        PlannerConversation activeConversation = conversation;
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId).orElse(null);
        AgentRunRequest agentRequest = buildAgentRunRequest(activeConversation, userId, safePayload, latestSnapshot, history);

        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_CHAT_STREAM,
                PlannerChatStreamPayload.builder().delta("").done(false).runId(runId).build());

        plannerAgentClient.streamPlanner(agentRequest, event -> forwardAgentStreamEvent(conversationId, runId, event))
                .thenApplyAsync(response -> {
                    PlannerSnapshot snapshot = finalizeAgentTurnFromAgent(activeConversation, userId, response, "planner-agent-stream");
                    markRunSucceeded(activeConversation, runId, response, safePayload.getTargetDayIndex());
                    return new AgentTurnResult(response, snapshot);
                }, plannerExecutorService)
                .thenAccept(result -> {
                    webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_CHAT_STREAM,
                            PlannerChatStreamPayload.builder().delta("").done(true).runId(runId).build());
                    if (result.snapshot() != null) {
                        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                                PlannerDataRefreshPayload.from(activeConversation.getStatus(), result.snapshot(), result.response().getRecommendationGroups(), runId));
                        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                                Map.of("version", result.snapshot().getVersion(), "traceId", result.response().getTraceId(), "runId", runId));
                    }
                    sendAgentFallbackTrace(conversationId, result.response());
                })
                .exceptionally(error -> {
                    Throwable rootCause = unwrapFailure(error);
                    logger.log(Level.WARNING, "Planner chat failed", rootCause);
                    markRunFailed(activeConversation, runId, plannerErrorCode(rootCause), plannerErrorMessage(rootCause));
                    webSocketSessionRegistry.sendError(
                            conversationId,
                            runId,
                            plannerErrorCode(rootCause),
                            plannerErrorMessage(rootCause),
                            plannerErrorDetail(rootCause)
                    );
                    return null;
                });
    }

    public void syncPlannerRun(UUID conversationId, UUID userId, UUID requestedRunId) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        PlannerActiveRun activeRun = conversation.getActiveRun();
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_RUN_STATE,
                PlannerRunStatePayload.builder()
                        .conversationId(conversationId)
                        .requestedRunId(requestedRunId)
                        .activeRun(activeRun)
                        .latestSnapshotVersion(conversation.getLatestSnapshotVersion())
                        .status(activeRun == null ? null : activeRun.getStatus())
                        .build());

        if (activeRun == null || activeRun.getStatus() != PlannerRunStatus.SUCCEEDED) {
            return;
        }
        Integer version = conversation.getLatestSnapshotVersion();
        if (version == null) {
            return;
        }
        PlannerSnapshot snapshot = snapshotService.getSnapshot(conversationId, version);
        if (snapshot == null) {
            return;
        }
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                PlannerDataRefreshPayload.from(conversation.getStatus(), snapshot, null, activeRun.getRunId()));
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_SNAPSHOT_SAVED,
                Map.of("version", snapshot.getVersion(), "runId", activeRun.getRunId()));
    }

    public PlannerConversation getOwnedConversation(UUID conversationId, UUID userId) {
        return conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "未找到对应规划会话"));
    }

    public void assertAccess(UUID conversationId, UUID userId) {
        getOwnedConversation(conversationId, userId);
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

    private void sendAgentFallbackTrace(UUID conversationId, AgentRunResponse response) {
        if (response == null || !isFallbackUsed(response)) {
            return;
        }
        webSocketSessionRegistry.send(
                conversationId,
                PlannerMessageType.PLANNER_TRACE_EVENT,
                PlannerStreamEvent.builder()
                        .traceId(response.getTraceId())
                        .conversationId(conversationId)
                        .type("FALLBACK_USED")
                        .status("PARTIAL_SUCCESS")
                        .message("模型不可用，已返回本地兜底规划。")
                        .phase("fallback")
                        .tool("fallback_plan_builder")
                        .data(Map.of(
                                "code", "PLANNER_AGENT_FALLBACK_USED",
                                "detail", agentFallbackDetail(response)
                        ))
                        .build()
        );
    }

    private boolean isFallbackUsed(AgentRunResponse response) {
        if (response.getToolCalls() == null) {
            return false;
        }
        return response.getToolCalls().stream()
                .anyMatch(toolCall -> "fallback_plan_builder".equals(toolCall.getTool()));
    }

    private String agentFallbackDetail(AgentRunResponse response) {
        List<String> details = new ArrayList<>();
        if (StringUtils.hasText(response.getTraceId())) {
            details.add("traceId=" + response.getTraceId());
        }
        firstFailedToolCall(response).ifPresent(toolCall -> {
            String detail = toolCall.getTool() + " 失败";
            if (StringUtils.hasText(toolCall.getDetail())) {
                detail = detail + ": " + toolCall.getDetail();
            }
            details.add(detail);
        });
        if (response.getWarnings() != null) {
            response.getWarnings().stream()
                    .filter(warning -> !"MOCK_DATA_USED".equals(warning.getCode()))
                    .limit(3)
                    .map(this::warningDetail)
                    .filter(StringUtils::hasText)
                    .forEach(details::add);
        }
        details.add("已启用 fallback_plan_builder 本地兜底模板。");
        return sanitizeErrorDetail(String.join("；", details));
    }

    private java.util.Optional<PlannerAgentToolCall> firstFailedToolCall(AgentRunResponse response) {
        if (response.getToolCalls() == null) {
            return java.util.Optional.empty();
        }
        return response.getToolCalls().stream()
                .filter(toolCall -> "FAILED".equals(toolCall.getStatus()) || "PARTIAL_SUCCESS".equals(toolCall.getStatus()))
                .findFirst();
    }

    private String warningDetail(PlannerAgentWarning warning) {
        if (warning == null || !StringUtils.hasText(warning.getCode())) {
            return "";
        }
        if (StringUtils.hasText(warning.getMessage())) {
            return warning.getCode() + ": " + warning.getMessage();
        }
        return warning.getCode();
    }

    private Throwable unwrapFailure(Throwable error) {
        Throwable current = error;
        while (current instanceof CompletionException || current instanceof ExecutionException) {
            Throwable cause = current.getCause();
            if (cause == null) {
                break;
            }
            current = cause;
        }
        return current == null ? new IllegalStateException("未知规划失败") : current;
    }

    private String plannerErrorCode(Throwable rootCause) {
        if (isAgentRequestValidationFailure(rootCause)) {
            return "PLANNER_AGENT_REQUEST_INVALID";
        }
        if (isAgentConnectivityFailure(rootCause)) {
            return "PLANNER_AGENT_UNAVAILABLE";
        }
        if (rootCause instanceof PlannerAgentStreamException) {
            return "PLANNER_AGENT_STREAM_FAILED";
        }
        if (rootCause instanceof DataAccessException) {
            return "PLANNER_SNAPSHOT_SAVE_FAILED";
        }
        return "PLANNER_CHAT_FAILED";
    }

    private String plannerErrorMessage(Throwable rootCause) {
        if (isAgentRequestValidationFailure(rootCause)) {
            return "规划请求参数与 Python Agent 协议不匹配，请检查 planningMode、planningScope、targetDayIndex 等字段。";
        }
        if (isAgentConnectivityFailure(rootCause)) {
            return "规划引擎暂时不可用，请确认 Python Agent 已启动，并检查 AI_ARRANGE_AGENT_BASE_URL 配置。";
        }
        if (rootCause instanceof PlannerAgentStreamException) {
            return "规划引擎流式执行失败，请查看详情后重试。";
        }
        if (rootCause instanceof DataAccessException) {
            return "规划已生成，但快照保存失败，请确认 MongoDB 已启动。";
        }
        return "规划生成失败，请稍后重试或补充更明确的偏好。";
    }

    private String plannerErrorDetail(Throwable rootCause) {
        String detail = rootCause.getClass().getSimpleName();
        if (StringUtils.hasText(rootCause.getMessage())) {
            detail = detail + ": " + rootCause.getMessage();
        }
        return sanitizeErrorDetail(detail);
    }

    private String sanitizeErrorDetail(String detail) {
        String sanitized = detail
                .replaceAll("(?i)(Bearer\\s+)[^\\s,;]+", "$1***")
                .replaceAll("(?i)(api[-_]?key=)[^\\s&]+", "$1***")
                .replaceAll("(?i)(token=)[^\\s&]+", "$1***");
        int maxLength = 320;
        if (sanitized.length() <= maxLength) {
            return sanitized;
        }
        return sanitized.substring(0, maxLength) + "...";
    }

    private boolean isAgentRequestValidationFailure(Throwable rootCause) {
        return rootCause instanceof WebClientResponseException responseException
                && responseException.getStatusCode().is4xxClientError();
    }

    private boolean isAgentConnectivityFailure(Throwable rootCause) {
        return rootCause instanceof WebClientRequestException
                || rootCause instanceof WebClientResponseException responseException && responseException.getStatusCode().is5xxServerError()
                || rootCause instanceof ConnectException
                || rootCause instanceof UnknownHostException
                || rootCause instanceof java.net.SocketTimeoutException;
    }

    private AgentRunRequest buildAgentRunRequest(
            PlannerConversation conversation,
            UUID userId,
            PlannerChatSendPayload payload,
            PlannerSnapshot latestSnapshot,
            List<PlannerMessage> history
    ) {
        return AgentRunRequest.builder()
                .runId(payload.getRunId())
                .conversationId(conversation.getId())
                .userId(userId)
                .planningMode(resolvePlanningMode(payload, latestSnapshot))
                .planningScope(resolvePlanningScope(payload, latestSnapshot))
                .modelVariant(resolveModelVariant(payload))
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

    private UUID prepareRun(PlannerConversation conversation, PlannerChatSendPayload payload) {
        UUID runId = payload.getRunId() == null ? UUID.randomUUID() : payload.getRunId();
        PlannerActiveRun currentRun = conversation.getActiveRun();
        if (currentRun != null && runId.equals(currentRun.getRunId())) {
            return runId;
        }
        if (currentRun != null && currentRun.getStatus() == PlannerRunStatus.RUNNING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "当前已有 AI 规划任务正在执行");
        }

        Instant now = Instant.now();
        conversation.setActiveRun(PlannerActiveRun.builder()
                .runId(runId)
                .status(PlannerRunStatus.RUNNING)
                .targetDayIndex(payload.getTargetDayIndex())
                .startedAt(now)
                .updatedAt(now)
                .build());
        conversation.setUpdatedAt(now);
        conversationRepository.save(conversation);
        return runId;
    }

    private boolean isDuplicateRun(PlannerConversation conversation, PlannerChatSendPayload payload) {
        PlannerActiveRun currentRun = conversation.getActiveRun();
        return currentRun != null
                && payload.getRunId() != null
                && payload.getRunId().equals(currentRun.getRunId());
    }

    private void markRunSucceeded(PlannerConversation conversation, UUID runId, AgentRunResponse response, Integer targetDayIndex) {
        PlannerActiveRun activeRun = conversation.getActiveRun();
        if (activeRun == null || !runId.equals(activeRun.getRunId())) {
            return;
        }
        activeRun.setStatus(PlannerRunStatus.SUCCEEDED);
        activeRun.setTraceId(response == null ? null : response.getTraceId());
        activeRun.setTargetDayIndex(targetDayIndex == null ? activeRun.getTargetDayIndex() : targetDayIndex);
        activeRun.setUpdatedAt(Instant.now());
        activeRun.setErrorCode(null);
        activeRun.setErrorMessage(null);
        conversation.setUpdatedAt(activeRun.getUpdatedAt());
        conversationRepository.save(conversation);
    }

    private void markRunFailed(PlannerConversation conversation, UUID runId, String errorCode, String errorMessage) {
        PlannerActiveRun activeRun = conversation.getActiveRun();
        if (activeRun == null || !runId.equals(activeRun.getRunId())) {
            return;
        }
        activeRun.setStatus(PlannerRunStatus.FAILED);
        activeRun.setUpdatedAt(Instant.now());
        activeRun.setErrorCode(errorCode);
        activeRun.setErrorMessage(errorMessage);
        conversation.setUpdatedAt(activeRun.getUpdatedAt());
        conversationRepository.save(conversation);
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

    private String resolveModelVariant(PlannerChatSendPayload payload) {
        return "PRO".equalsIgnoreCase(payload.getModelVariant()) ? "PRO" : "FLASH";
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

    private void forwardAgentStreamEvent(UUID conversationId, UUID runId, PlannerStreamEvent event) {
        if (event != null && event.getRunId() == null) {
            event.setRunId(runId);
        }
        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_TRACE_EVENT, event);
        if ("OPTIONS_READY".equals(event.getType())) {
            webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_OPTIONS_REFRESH, event.getData());
        }
    }

    private String nonBlank(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }

    private record AgentTurnResult(AgentRunResponse response, PlannerSnapshot snapshot) {
    }
}
