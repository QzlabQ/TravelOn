package org.microarchitecturovisco.aiarrangeservice.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.aiarrangeservice.config.PlannerAgentClientConfig;
import org.microarchitecturovisco.aiarrangeservice.config.PlannerAgentProperties;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerStreamEvent;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletionException;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PythonPlannerAgentClientTest {

    private static final UUID CONVERSATION_ID = UUID.fromString("00000000-0000-0000-0000-000000000019");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Test
    void streamPlannerReadsRunFinishedResponse() {
        String body = """
                event: RUN_STARTED
                data: {"traceId":"trace-1","conversationId":"00000000-0000-0000-0000-000000000019","userId":"00000000-0000-0000-0000-000000000001","type":"RUN_STARTED","status":"RUNNING","message":"started","data":{}}

                event: RUN_FINISHED
                data: {"traceId":"trace-1","conversationId":"00000000-0000-0000-0000-000000000019","userId":"00000000-0000-0000-0000-000000000001","type":"RUN_FINISHED","status":"SUCCESS","message":"done","data":{"response":{"traceId":"trace-1","status":"SUCCESS","assistantText":"Plan ready.","title":"Shanghai plan","markdown":"# Shanghai plan","nextAction":"ASK_USER_SELECTION","snapshotDraft":{"baseVersion":0,"proposedVersion":1,"scope":"DAY_PLAN","targetDayIndex":1,"markdown":"# Shanghai plan","checksum":"checksum-1"}}}}

                """;
        PythonPlannerAgentClient client = clientFor(body);
        List<PlannerStreamEvent> events = new ArrayList<>();

        AgentRunResponse response = client.streamPlanner(request(), events::add).join();

        assertThat(events).extracting(PlannerStreamEvent::getType).containsExactly("RUN_STARTED", "RUN_FINISHED");
        assertThat(response.getTraceId()).isEqualTo("trace-1");
        assertThat(response.getSnapshotDraft()).isNotNull();
        assertThat(response.getSnapshotDraft().getChecksum()).isEqualTo("checksum-1");
    }

    @Test
    void streamPlannerFailsWithRunFailedEventDetail() {
        String body = """
                event: RUN_FAILED
                data: {"traceId":"trace-2","conversationId":"00000000-0000-0000-0000-000000000019","userId":"00000000-0000-0000-0000-000000000001","type":"RUN_FAILED","status":"FAILED","message":"agent failed","data":{"error":"tool timeout"}}

                """;
        PythonPlannerAgentClient client = clientFor(body);

        assertThatThrownBy(() -> client.streamPlanner(request(), ignored -> {
        }).join())
                .isInstanceOf(CompletionException.class)
                .hasCauseInstanceOf(PlannerAgentStreamException.class)
                .hasMessageContaining("tool timeout");
    }

    @Test
    void streamPlannerFailsWhenTerminalEventIsMissing() {
        String body = """
                event: RUN_STARTED
                data: {"traceId":"trace-3","conversationId":"00000000-0000-0000-0000-000000000019","userId":"00000000-0000-0000-0000-000000000001","type":"RUN_STARTED","status":"RUNNING","message":"started","data":{}}

                """;
        PythonPlannerAgentClient client = clientFor(body);

        assertThatThrownBy(() -> client.streamPlanner(request(), ignored -> {
        }).join())
                .isInstanceOf(CompletionException.class)
                .hasCauseInstanceOf(PlannerAgentStreamException.class)
                .hasMessageContaining("缺少终止事件");
    }

    @Test
    void streamPlannerFailsWhenAgentConnectionClosesBeforeTerminalEvent() {
        ExchangeFunction exchange = request -> Mono.error(new RuntimeException("connection reset by peer"));
        PlannerAgentProperties properties = new PlannerAgentProperties();
        properties.setTimeoutSeconds(5);
        PythonPlannerAgentClient client = new PythonPlannerAgentClient(
                WebClient.builder().baseUrl("http://agent").exchangeFunction(exchange).build(),
                new ObjectMapper().findAndRegisterModules(),
                properties
        );

        assertThatThrownBy(() -> client.streamPlanner(request(), ignored -> {
        }).join())
                .isInstanceOf(CompletionException.class)
                .hasRootCauseMessage("connection reset by peer");
    }

    @Test
    void configuredWebClientSerializesLocalDatesAsIsoStrings() throws IOException {
        AtomicReference<String> capturedBody = new AtomicReference<>("");
        String responseBody = """
                event: RUN_FINISHED
                data: {"traceId":"trace-4","conversationId":"00000000-0000-0000-0000-000000000019","userId":"00000000-0000-0000-0000-000000000001","type":"RUN_FINISHED","status":"SUCCESS","message":"done","data":{"response":{"traceId":"trace-4","status":"SUCCESS","assistantText":"Plan ready.","title":"Shanghai plan","markdown":"# Shanghai plan","nextAction":"ASK_USER_SELECTION","snapshotDraft":{"baseVersion":0,"proposedVersion":1,"scope":"DAY_PLAN","targetDayIndex":1,"markdown":"# Shanghai plan","checksum":"checksum-4"}}}}

                """;
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/agent/planner/stream", exchange -> {
            capturedBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            sendSseResponse(exchange, responseBody);
        });
        server.start();

        try {
            PlannerAgentProperties properties = new PlannerAgentProperties();
            properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
            properties.setTimeoutSeconds(5);
            ObjectMapper objectMapper = Jackson2ObjectMapperBuilder.json().build();
            WebClient webClient = new PlannerAgentClientConfig().plannerAgentWebClient(properties, objectMapper);
            PythonPlannerAgentClient client = new PythonPlannerAgentClient(webClient, objectMapper, properties);

            client.streamPlanner(request(), ignored -> {
            }).join();

            assertThat(capturedBody.get()).contains("\"travelStartDate\":\"2026-06-01\"");
            assertThat(capturedBody.get()).contains("\"travelEndDate\":\"2026-06-03\"");
            assertThat(capturedBody.get()).doesNotContain("\"travelStartDate\":[2026,6,1]");
        } finally {
            server.stop(0);
        }
    }

    private PythonPlannerAgentClient clientFor(String body) {
        ExchangeFunction exchange = request -> Mono.just(ClientResponse.create(HttpStatus.OK)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_EVENT_STREAM_VALUE)
                .body(body)
                .build());
        PlannerAgentProperties properties = new PlannerAgentProperties();
        properties.setTimeoutSeconds(5);
        return new PythonPlannerAgentClient(
                WebClient.builder().baseUrl("http://agent").exchangeFunction(exchange).build(),
                new ObjectMapper().findAndRegisterModules(),
                properties
        );
    }

    private AgentRunRequest request() {
        return AgentRunRequest.builder()
                .conversationId(CONVERSATION_ID)
                .userId(USER_ID)
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .travelStartDate(LocalDate.of(2026, 6, 1))
                        .travelEndDate(LocalDate.of(2026, 6, 3))
                        .peopleCount(2)
                        .build())
                .userMessage("Plan a trip.")
                .build();
    }

    private void sendSseResponse(HttpExchange exchange, String responseBody) throws IOException {
        byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add(HttpHeaders.CONTENT_TYPE, "text/event-stream; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
