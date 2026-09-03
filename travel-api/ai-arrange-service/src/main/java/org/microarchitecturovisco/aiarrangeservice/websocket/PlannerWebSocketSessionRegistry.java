package org.microarchitecturovisco.aiarrangeservice.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageType;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.logging.Logger;

@Component
@RequiredArgsConstructor
public class PlannerWebSocketSessionRegistry {

    private static final Logger logger = Logger.getLogger(PlannerWebSocketSessionRegistry.class.getName());

    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<UUID, CopyOnWriteArraySet<WebSocketSession>> sessionsByConversation = new ConcurrentHashMap<>();

    public void register(UUID conversationId, WebSocketSession session) {
        sessionsByConversation.computeIfAbsent(conversationId, key -> new CopyOnWriteArraySet<>()).add(session);
    }

    public void unregister(WebSocketSession session) {
        sessionsByConversation.values().forEach(set -> set.remove(session));
        sessionsByConversation.entrySet().removeIf(entry -> entry.getValue().isEmpty());
    }

    public void send(UUID conversationId, PlannerMessageType type, Object payload) {
        if (conversationId == null) {
            return;
        }
        sessionsByConversation.getOrDefault(conversationId, new CopyOnWriteArraySet<>()).forEach(session -> sendToSession(session, conversationId, type, payload));
    }

    public void sendError(UUID conversationId, String code, String message) {
        sendError(conversationId, code, message, null);
    }

    public void sendError(UUID conversationId, String code, String message, String detail) {
        sendError(conversationId, null, code, message, detail);
    }

    public void sendError(UUID conversationId, UUID runId, String code, String message, String detail) {
        if (conversationId == null) {
            logger.warning(code + ": " + message);
            return;
        }
        Map<String, Object> errorPayload = new java.util.LinkedHashMap<>();
        errorPayload.put("code", String.valueOf(code));
        errorPayload.put("message", String.valueOf(message));
        if (runId != null) {
            errorPayload.put("runId", runId);
        }
        if (detail != null && !detail.isBlank()) {
            errorPayload.put("detail", detail);
        }
        send(conversationId, PlannerMessageType.PLANNER_ERROR, errorPayload);
    }

    private void sendToSession(WebSocketSession session, UUID conversationId, PlannerMessageType type, Object payload) {
        if (!session.isOpen()) {
            unregister(session);
            return;
        }

        try {
            Map<String, Object> envelope = new java.util.LinkedHashMap<>();
            envelope.put("type", type);
            envelope.put("conversationId", conversationId);
            envelope.put("payload", payload);
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(envelope)));
        } catch (IOException e) {
            logger.warning("Cannot send websocket message: " + e.getMessage());
        }
    }
}
