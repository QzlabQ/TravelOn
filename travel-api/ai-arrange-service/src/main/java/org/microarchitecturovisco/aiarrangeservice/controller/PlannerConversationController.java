package org.microarchitecturovisco.aiarrangeservice.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.CreatePlannerConversationRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.RunPlannerAgentRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.UpdatePlannerCoreSlotsRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.UpdatePlannerSelectionRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerConversationResponse;
import org.microarchitecturovisco.aiarrangeservice.service.PlannerConversationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/ai-arrange/api/conversations")
public class PlannerConversationController {

    private final PlannerConversationService plannerConversationService;

    @PostMapping
    public PlannerConversationResponse create(@Valid @RequestBody CreatePlannerConversationRequest request) {
        return plannerConversationService.createConversation(request.getUserId(), request.getCoreSlots());
    }

    @GetMapping
    public List<PlannerConversationResponse> list(@RequestParam UUID userId) {
        return plannerConversationService.listConversations(userId);
    }

    @GetMapping("/{conversationId}")
    public PlannerConversationResponse get(@PathVariable UUID conversationId, @RequestParam UUID userId) {
        return plannerConversationService.getConversation(conversationId, userId);
    }

    @PutMapping("/{conversationId}/core-slots")
    public PlannerConversationResponse updateCoreSlots(@PathVariable UUID conversationId, @Valid @RequestBody UpdatePlannerCoreSlotsRequest request) {
        return plannerConversationService.updateCoreSlots(conversationId, request.getUserId(), request.getCoreSlots());
    }

    @PutMapping("/{conversationId}/selection")
    public PlannerConversationResponse updateSelection(@PathVariable UUID conversationId, @Valid @RequestBody UpdatePlannerSelectionRequest request) {
        return plannerConversationService.updateSelection(conversationId, request.getUserId(), request.getSelectedPlaceIds());
    }

    @GetMapping("/{conversationId}/snapshots")
    public List<PlannerSnapshot> listSnapshots(@PathVariable UUID conversationId, @RequestParam UUID userId) {
        return plannerConversationService.listSnapshots(conversationId, userId);
    }

    @PostMapping("/{conversationId}/planner/run")
    public PlannerSnapshot runPlanner(@PathVariable UUID conversationId, @Valid @RequestBody RunPlannerAgentRequest request) {
        return plannerConversationService.runPlannerAgent(conversationId, request.getUserId(), request.toChatPayload());
    }
}
