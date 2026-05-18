package org.microarchitecturovisco.aiarrangeservice.config;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.websocket.PlannerWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final PlannerWebSocketHandler plannerWebSocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(plannerWebSocketHandler, "/ai-arrange/ws/planner").setAllowedOrigins("*");
    }
}
