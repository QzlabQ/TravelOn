package org.microarchitecturovisco.aiarrangeservice.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.CreatePlannerConversationRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.RunPlannerAgentRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.UpdatePlannerCoreSlotsRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.request.UpdatePlannerSelectionRequest;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerConversationResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerDayVersionResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerSnapshotDiffResponse;
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

    @GetMapping("/{conversationId}/snapshots/{version}")
    public PlannerSnapshot getSnapshot(@PathVariable UUID conversationId, @PathVariable Integer version, @RequestParam UUID userId) {
        return plannerConversationService.getSnapshot(conversationId, userId, version);
    }

    @GetMapping("/{conversationId}/day-plans/{dayIndex}/versions")
    public List<PlannerDayVersionResponse> listDayVersions(
            @PathVariable UUID conversationId,
            @PathVariable Integer dayIndex,
            @RequestParam UUID userId
    ) {
        return plannerConversationService.listDayVersions(conversationId, userId, dayIndex);
    }

    @PostMapping("/{conversationId}/day-plans/{dayIndex}/versions/{dayVersion}/activate")
    public PlannerSnapshot activateDayVersion(
            @PathVariable UUID conversationId,
            @PathVariable Integer dayIndex,
            @PathVariable Integer dayVersion,
            @RequestParam UUID userId
    ) {
        return plannerConversationService.activateDayVersion(conversationId, userId, dayIndex, dayVersion);
    }

    @PostMapping("/{conversationId}/snapshots/{version}/rollback")
    public PlannerSnapshot rollbackSnapshot(@PathVariable UUID conversationId, @PathVariable Integer version, @RequestParam UUID userId) {
        return plannerConversationService.rollbackSnapshot(conversationId, userId, version);
    }

    @PostMapping("/{conversationId}/day-plans/{dayIndex}/snapshots/{version}/restore")
    public PlannerSnapshot restoreDaySnapshot(
            @PathVariable UUID conversationId,
            @PathVariable Integer dayIndex,
            @PathVariable Integer version,
            @RequestParam UUID userId
    ) {
        return plannerConversationService.restoreDaySnapshot(conversationId, userId, dayIndex, version);
    }

    @PostMapping("/{conversationId}/day-plans/assemble")
    public PlannerSnapshot assembleTripSnapshot(@PathVariable UUID conversationId, @RequestParam UUID userId) {
        return plannerConversationService.assembleTripSnapshot(conversationId, userId);
    }

    @GetMapping("/{conversationId}/snapshots/{fromVersion}/diff/{toVersion}")
    public PlannerSnapshotDiffResponse diffSnapshots(
            @PathVariable UUID conversationId,
            @PathVariable Integer fromVersion,
            @PathVariable Integer toVersion,
            @RequestParam UUID userId
    ) {
        return plannerConversationService.diffSnapshots(conversationId, userId, fromVersion, toVersion);
    }

    @PostMapping("/{conversationId}/planner/run")
    public PlannerSnapshot runPlanner(@PathVariable UUID conversationId, @Valid @RequestBody RunPlannerAgentRequest request) {
        return plannerConversationService.runPlannerAgent(conversationId, request.getUserId(), request.toChatPayload());
    }
}
