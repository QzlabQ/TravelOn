package org.microarchitecturovisco.aiarrangeservice.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerMessageType;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.PlannerChatSendPayload;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.PlannerPlaceSelectionPayload;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.PlannerSocketEnvelope;
import org.microarchitecturovisco.aiarrangeservice.service.PlannerConversationService;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;

@Component
@RequiredArgsConstructor
public class PlannerWebSocketHandler extends TextWebSocketHandler {

    private static final Logger logger = Logger.getLogger(PlannerWebSocketHandler.class.getName());

    private final ObjectMapper objectMapper;
    private final PlannerConversationService plannerConversationService;
    private final PlannerWebSocketSessionRegistry sessionRegistry;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        URI uri = session.getUri();
        if (uri == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }

        Map<String, List<String>> queryParams = UriComponentsBuilder.fromUri(uri).build().getQueryParams();
        String conversationIdValue = first(queryParams, "conversationId");
        String userIdValue = first(queryParams, "userId");
        if (!StringUtils.hasText(conversationIdValue) || !StringUtils.hasText(userIdValue)) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }

        try {
            UUID conversationId = UUID.fromString(conversationIdValue);
            UUID userId = UUID.fromString(userIdValue);
            plannerConversationService.assertAccess(conversationId, userId);

            session.getAttributes().put("conversationId", conversationId);
            session.getAttributes().put("userId", userId);
            sessionRegistry.register(conversationId, session);
            logger.info("Planner websocket connected for conversation " + conversationId);
        } catch (RuntimeException exception) {
            session.close(CloseStatus.POLICY_VIOLATION);
        }
    }

    @Override
    public void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            PlannerSocketEnvelope envelope = objectMapper.readValue(message.getPayload(), PlannerSocketEnvelope.class);
            UUID conversationId = envelope.getConversationId() != null
                    ? envelope.getConversationId()
                    : (UUID) session.getAttributes().get("conversationId");
            UUID userId = envelope.getUserId() != null
                    ? envelope.getUserId()
                    : (UUID) session.getAttributes().get("userId");

            if (conversationId == null || userId == null || envelope.getType() == null) {
                sessionRegistry.sendError(conversationId, "INVALID_MESSAGE", "Missing conversationId, userId or type");
                return;
            }

            if (envelope.getType() == PlannerMessageType.PLANNER_CHAT_SEND) {
                PlannerChatSendPayload payload = objectMapper.treeToValue(envelope.getPayload(), PlannerChatSendPayload.class);
                plannerConversationService.handleChatMessage(conversationId, userId, payload);
                return;
            }

            if (envelope.getType() == PlannerMessageType.PLANNER_PLACE_SELECTION) {
                PlannerPlaceSelectionPayload payload = objectMapper.treeToValue(envelope.getPayload(), PlannerPlaceSelectionPayload.class);
                plannerConversationService.updateSelection(conversationId, userId, payload.getSelectedPlaceIds());
                return;
            }

            sessionRegistry.sendError(conversationId, "UNSUPPORTED_MESSAGE", "Unsupported planner message type");
        } catch (Exception exception) {
            Object conversationId = session.getAttributes().get("conversationId");
            if (conversationId instanceof UUID uuid) {
                sessionRegistry.sendError(uuid, "INVALID_MESSAGE", exception.getMessage());
            } else {
                sessionRegistry.sendError(null, "INVALID_MESSAGE", exception.getMessage());
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        sessionRegistry.unregister(session);
        super.afterConnectionClosed(session, status);
    }

    private String first(Map<String, List<String>> queryParams, String key) {
        List<String> values = queryParams.get(key);
        return values == null || values.isEmpty() ? null : values.getFirst();
    }
}
