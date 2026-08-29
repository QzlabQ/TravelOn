package org.microarchitecturovisco.communityservice.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class UserEventsConfig {

    // Must match user-service's UserEventsConfig.
    public static final String USER_EVENTS_EXCHANGE = "community.user.events";
    public static final String USER_PROFILE_CHANGED_ROUTING_KEY = "user.profile.changed";
    public static final String USER_PROFILE_CHANGED_QUEUE = "community.user-profile-changed";

    @Bean
    public TopicExchange userEventsExchange() {
        return new TopicExchange(USER_EVENTS_EXCHANGE, true, false);
    }

    @Bean
    public Queue userProfileChangedQueue() {
        // durable so events buffer while this service is down and are processed on restart
        return new Queue(USER_PROFILE_CHANGED_QUEUE, true);
    }

    @Bean
    public Binding userProfileChangedBinding(Queue userProfileChangedQueue, TopicExchange userEventsExchange) {
        return BindingBuilder.bind(userProfileChangedQueue).to(userEventsExchange).with(USER_PROFILE_CHANGED_ROUTING_KEY);
    }
}
