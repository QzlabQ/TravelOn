package org.microarchitecturovisco.aiarrangeservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.client.AiChatMessage;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerConversationStatus;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageRole;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageType;
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

    public void handleChatMessage(UUID conversationId, UUID userId, PlannerChatSendPayload payload) {
        PlannerConversation conversation = getOwnedConversation(conversationId, userId);
        if (conversation.getStatus() == PlannerConversationStatus.COLLECTING_CORE_SLOTS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Core slots are required before chat starts");
        }
        if (payload.getMessage() == null || payload.getMessage().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message cannot be blank");
        }

        if (payload.getSelectedPlaceIds() != null && !payload.getSelectedPlaceIds().isEmpty()) {
            conversation.setSelectedPlaceIds(new ArrayList<>(payload.getSelectedPlaceIds()));
            conversation.setUpdatedAt(Instant.now());
            conversation = conversationRepository.save(conversation);
        }

        saveMessage(conversationId, userId, PlannerMessageRole.USER, payload.getMessage(), null, Map.of("source", "websocket"));

        List<PlannerMessage> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        PlannerConversation activeConversation = conversation;
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversationId).orElse(null);
        List<AiChatMessage> prompt = promptFactory.buildChatPrompt(activeConversation, latestSnapshot, history);

        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_CHAT_STREAM,
                PlannerChatStreamPayload.builder().delta("").done(false).build());

        plannerAiClient.streamChatCompletion(prompt, delta ->
                        webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_CHAT_STREAM,
                                PlannerChatStreamPayload.builder().delta(delta).done(false).build()))
                .thenApplyAsync(assistantText -> finalizeAssistantTurn(activeConversation, userId, assistantText), plannerExecutorService)
                .thenAccept(snapshot -> {
                    webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_CHAT_STREAM,
                            PlannerChatStreamPayload.builder().delta("").done(true).build());
                    webSocketSessionRegistry.send(conversationId, PlannerMessageType.PLANNER_DATA_REFRESH,
                            PlannerDataRefreshPayload.from(activeConversation.getStatus(), snapshot));
                })
                .exceptionally(error -> {
                    logger.warning("Planner chat failed: " + error.getMessage());
                    webSocketSessionRegistry.sendError(conversationId, "PLANNER_CHAT_FAILED", String.valueOf(error.getMessage()));
                    return null;
                });
    }

    public PlannerConversation getOwnedConversation(UUID conversationId, UUID userId) {
        return conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));
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
}
