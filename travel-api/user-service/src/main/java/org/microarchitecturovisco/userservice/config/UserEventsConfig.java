package org.microarchitecturovisco.userservice.config;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class UserEventsConfig {

    public static final String USER_EVENTS_EXCHANGE = "community.user.events";
    public static final String USER_PROFILE_CHANGED_ROUTING_KEY = "user.profile.changed";

    @Bean
    public TopicExchange userEventsExchange() {
        // durable, non-auto-delete so events are not lost across restarts
        return new TopicExchange(USER_EVENTS_EXCHANGE, true, false);
    }
}
