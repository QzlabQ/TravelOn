package org.microarchitecturovisco.aiarrangeservice.client;

import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

public interface PlannerAiClient {

    CompletableFuture<String> streamChatCompletion(List<AiChatMessage> messages, Consumer<String> onDelta);

    Optional<PlannerSnapshotDraft> extractSnapshotDraft(List<AiChatMessage> messages);

    String model();
}
