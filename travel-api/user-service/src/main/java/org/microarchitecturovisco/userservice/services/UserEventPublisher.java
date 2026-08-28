package org.microarchitecturovisco.userservice.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.userservice.config.UserEventsConfig;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.domain.events.UserProfileChangedEvent;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class UserEventPublisher {

    private static final Logger logger = Logger.getLogger(UserEventPublisher.class.getName());

    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;

    /** Best-effort: a messaging failure must not break the profile update. */
    public void publishProfileChanged(User user) {
        try {
            UserProfileChangedEvent event = new UserProfileChangedEvent(
                    user.getId(), user.getName(), user.getSurname(), user.getEmail());
            String json = objectMapper.writeValueAsString(event);
            rabbitTemplate.convertAndSend(
                    UserEventsConfig.USER_EVENTS_EXCHANGE,
                    UserEventsConfig.USER_PROFILE_CHANGED_ROUTING_KEY,
                    json);
        } catch (Exception e) {
            logger.warning("Failed to publish UserProfileChangedEvent for " + user.getId() + ": " + e.getMessage());
        }
    }
}
