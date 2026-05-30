package org.microarchitecturovisco.aiarrangeservice.client;

import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.PlannerStreamEvent;

import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

public interface PlannerAgentClient {

    AgentRunResponse runPlanner(AgentRunRequest request);

    CompletableFuture<AgentRunResponse> streamPlanner(AgentRunRequest request, Consumer<PlannerStreamEvent> onEvent);
}
