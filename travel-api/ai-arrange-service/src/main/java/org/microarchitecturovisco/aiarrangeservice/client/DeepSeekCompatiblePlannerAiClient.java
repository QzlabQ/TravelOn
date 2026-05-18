package org.microarchitecturovisco.aiarrangeservice.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.config.AiArrangeAiProperties;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.function.Consumer;
import java.util.logging.Logger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Component
@RequiredArgsConstructor
public class DeepSeekCompatiblePlannerAiClient implements PlannerAiClient {

    private static final Logger logger = Logger.getLogger(DeepSeekCompatiblePlannerAiClient.class.getName());

    private final AiArrangeAiProperties properties;
    private final ObjectMapper objectMapper;
    private final ExecutorService plannerExecutorService;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();

    @Override
    public CompletableFuture<String> streamChatCompletion(List<AiChatMessage> messages, Consumer<String> onDelta) {
        if (!StringUtils.hasText(properties.getApiKey())) {
            String fallback = "我已经收到你的出行信息。当前环境还没有配置 DeepSeek API Key，因此先生成本地占位规划草稿；配置 DEEPSEEK_API_KEY 后会启用真实流式输出。";
            onDelta.accept(fallback);
            return CompletableFuture.completedFuture(fallback);
        }

        return CompletableFuture.supplyAsync(() -> {
            try {
                HttpRequest request = buildRequest(messages, true);
                HttpResponse<Stream<String>> response = httpClient.send(request, HttpResponse.BodyHandlers.ofLines());
                ensureSuccess(response);
                StringBuilder fullText = new StringBuilder();
                try (Stream<String> lines = response.body()) {
                    lines.forEach(line -> consumeStreamLine(line, fullText, onDelta));
                }
                return fullText.toString();
            } catch (IOException e) {
                throw new IllegalStateException("DeepSeek stream request failed", e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("DeepSeek stream request interrupted", e);
            }
        }, plannerExecutorService);
    }

    @Override
    public Optional<PlannerSnapshotDraft> extractSnapshotDraft(List<AiChatMessage> messages) {
        if (!StringUtils.hasText(properties.getApiKey())) {
            return Optional.empty();
        }

        try {
            HttpRequest request = buildRequest(messages, false);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                logger.warning("DeepSeek extraction request failed with status " + response.statusCode() + ": " + response.body());
                return Optional.empty();
            }
            String content = responseContent(response.body());
            return parseSnapshotDraft(content);
        } catch (IOException e) {
            logger.warning("DeepSeek extraction request failed: " + e.getMessage());
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.warning("DeepSeek extraction request interrupted");
            return Optional.empty();
        }
    }

    @Override
    public String model() {
        return properties.getModel();
    }

    private HttpRequest buildRequest(List<AiChatMessage> messages, boolean stream) throws JsonProcessingException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.getModel());
        body.put("messages", messages);
        body.put("temperature", properties.getTemperature());
        body.put("stream", stream);

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(chatCompletionsUri())
                .timeout(Duration.ofSeconds(properties.getTimeoutSeconds()))
                .header("Content-Type", "application/json")
                .header("Accept", stream ? "text/event-stream" : "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));

        if (StringUtils.hasText(properties.getApiKey())) {
            builder.header("Authorization", "Bearer " + properties.getApiKey());
        }

        return builder.build();
    }

    private URI chatCompletionsUri() {
        String baseUrl = properties.getBaseUrl().replaceAll("/+$", "");
        String path = properties.getChatCompletionsPath().startsWith("/")
                ? properties.getChatCompletionsPath()
                : "/" + properties.getChatCompletionsPath();
        return URI.create(baseUrl + path);
    }

    private void ensureSuccess(HttpResponse<Stream<String>> response) {
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            return;
        }

        String responseBody;
        try (Stream<String> lines = response.body()) {
            responseBody = lines.collect(Collectors.joining("\n"));
        }
        throw new IllegalStateException("DeepSeek stream request failed with status " + response.statusCode() + ": " + responseBody);
    }

    private void consumeStreamLine(String line, StringBuilder fullText, Consumer<String> onDelta) {
        if (!StringUtils.hasText(line) || !line.startsWith("data:")) {
            return;
        }
        String data = line.substring("data:".length()).trim();
        if ("[DONE]".equals(data)) {
            return;
        }

        try {
            JsonNode root = objectMapper.readTree(data);
            JsonNode contentNode = root.path("choices").path(0).path("delta").path("content");
            if (!contentNode.isMissingNode() && !contentNode.isNull()) {
                String delta = contentNode.asText();
                fullText.append(delta);
                onDelta.accept(delta);
            }
        } catch (JsonProcessingException e) {
            logger.warning("Cannot parse DeepSeek stream line: " + e.getMessage());
        }
    }

    private String responseContent(String body) throws JsonProcessingException {
        JsonNode root = objectMapper.readTree(body);
        return root.path("choices").path(0).path("message").path("content").asText();
    }

    private Optional<PlannerSnapshotDraft> parseSnapshotDraft(String content) {
        String json = stripJsonFence(content);
        try {
            return Optional.of(objectMapper.readValue(json, PlannerSnapshotDraft.class));
        } catch (JsonProcessingException e) {
            logger.warning("Cannot parse planner snapshot JSON: " + e.getMessage());
            return Optional.empty();
        }
    }

    private String stripJsonFence(String content) {
        String trimmed = content == null ? "" : content.trim();
        if (trimmed.startsWith("```")) {
            int firstNewLine = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstNewLine >= 0 && lastFence > firstNewLine) {
                return trimmed.substring(firstNewLine + 1, lastFence).trim();
            }
        }
        return trimmed;
    }
}
