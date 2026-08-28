package org.microarchitecturovisco.communityservice.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.config.UserEventsConfig;
import org.microarchitecturovisco.communityservice.service.AuthorNameService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.util.logging.Logger;

@Component
@RequiredArgsConstructor
public class UserProfileChangedListener {

    private static final Logger logger = Logger.getLogger(UserProfileChangedListener.class.getName());

    private final ObjectMapper objectMapper;
    private final AuthorNameService authorNameService;

    @RabbitListener(queues = UserEventsConfig.USER_PROFILE_CHANGED_QUEUE)
    public void onUserProfileChanged(String message) {
        try {
            UserProfileChangedEvent event = objectMapper.readValue(message, UserProfileChangedEvent.class);
            authorNameService.refreshAuthorName(event.userId(), event.displayName());
        } catch (Exception e) {
            logger.warning("Failed to process UserProfileChangedEvent: " + e.getMessage());
        }
    }
}
