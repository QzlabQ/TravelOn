package org.microarchitecturovisco.aiarrangeservice.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.config.PlannerAgentProperties;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerStreamEvent;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

@Component
public class PythonPlannerAgentClient implements PlannerAgentClient {

    private static final ParameterizedTypeReference<ServerSentEvent<PlannerStreamEvent>> STREAM_EVENT_TYPE =
            new ParameterizedTypeReference<>() {
            };

    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final PlannerAgentProperties properties;

    public PythonPlannerAgentClient(
            @Qualifier("plannerAgentWebClient") WebClient webClient,
            ObjectMapper objectMapper,
            PlannerAgentProperties properties
    ) {
        this.webClient = webClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public AgentRunResponse runPlanner(AgentRunRequest request) {
        return webClient.post()
                .uri("/agent/planner/run")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .retrieve()
                .bodyToMono(AgentRunResponse.class)
                .block(timeout());
    }

    @Override
    public CompletableFuture<AgentRunResponse> streamPlanner(AgentRunRequest request, Consumer<PlannerStreamEvent> onEvent) {
        return webClient.post()
                .uri("/agent/planner/stream")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(request)
                .retrieve()
                .bodyToFlux(STREAM_EVENT_TYPE)
                .map(ServerSentEvent::data)
                .filter(event -> event != null)
                .doOnNext(onEvent)
                .filter(this::isTerminalEvent)
                .next()
                .map(this::responseFromTerminalEvent)
                .toFuture();
    }

    private Duration timeout() {
        int timeoutSeconds = properties.getTimeoutSeconds() == null ? 150 : properties.getTimeoutSeconds();
        return Duration.ofSeconds(timeoutSeconds);
    }

    private boolean isTerminalEvent(PlannerStreamEvent event) {
        return "RUN_FINISHED".equals(event.getType()) || "RUN_FAILED".equals(event.getType());
    }

    private AgentRunResponse responseFromTerminalEvent(PlannerStreamEvent event) {
        Map<String, Object> data = event.getData();
        Object response = data == null ? null : data.get("response");
        if (response == null) {
            throw new IllegalStateException("Planner Agent 流式响应缺少最终结果");
        }
        return objectMapper.convertValue(response, AgentRunResponse.class);
    }
}
