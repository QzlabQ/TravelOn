package org.microarchitecturovisco.aiarrangeservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.client.AiChatMessage;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerDayRevision;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerDayPlanRef;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.microarchitecturovisco.aiarrangeservice.domain.model.agent.AgentRunResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerDayVersionResponse;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerSnapshotDiffItem;
import org.microarchitecturovisco.aiarrangeservice.domain.model.response.PlannerSnapshotDiffResponse;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerDayRevisionRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerMessageRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerSnapshotRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PlannerSnapshotService {

    private final PlannerAiClient plannerAiClient;
    private final PlannerPromptFactory promptFactory;
    private final PlannerMarkdownBuilder markdownBuilder;
    private final PlaceEnrichmentService placeEnrichmentService;
    private final PlannerMessageRepository messageRepository;
    private final PlannerSnapshotRepository snapshotRepository;
    private final PlannerDayRevisionRepository dayRevisionRepository;

    public PlannerSnapshot createSnapshot(PlannerConversation conversation, String assistantText) {
        List<PlannerMessage> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversation.getId());
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversation.getId()).orElse(null);
        List<AiChatMessage> prompt = promptFactory.buildExtractionPrompt(conversation, latestSnapshot, history, assistantText);
        String fallbackNextQuestion = defaultNextQuestion(conversation);

        PlannerSnapshotDraft draft = plannerAiClient.extractSnapshotDraft(prompt)
                .orElseGet(() -> PlannerSnapshotDraft.builder()
                        .title(defaultTitle(conversation))
                        .summary(assistantText)
                        .nextQuestion(fallbackNextQuestion)
                        .markdown(markdownBuilder.buildFallbackMarkdown(conversation, assistantText, fallbackNextQuestion, List.of(), List.of()))
                        .build());

        List<PlannerPlaceSuggestion> stableDraftPlaces = carryForwardPlaceIdentity(
                draft.getPlaces() == null ? List.of() : draft.getPlaces(),
                latestSnapshot == null || latestSnapshot.getPlaces() == null ? List.of() : latestSnapshot.getPlaces()
        );
        List<PlannerPlaceSuggestion> places = placeEnrichmentService.enrichPlaces(conversation, stableDraftPlaces);
        List<PlannerRouteSegment> routes = buildRoutes(places, conversation.getSelectedPlaceIds(), draft.getRoutes() == null ? List.of() : draft.getRoutes());
        String markdown = markdownBuilder.normalizeMarkdown(
                PlannerSnapshotDraft.builder()
                        .title(draft.getTitle())
                        .summary(draft.getSummary())
                        .markdown(draft.getMarkdown())
                        .nextQuestion(draft.getNextQuestion())
                        .places(places)
                        .routes(routes)
                        .build(),
                conversation,
                assistantText
        );

        Integer version = (latestSnapshot == null || latestSnapshot.getVersion() == null ? 0 : latestSnapshot.getVersion()) + 1;

        PlannerSnapshot snapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversation.getId())
                .userId(conversation.getUserId())
                .version(version)
                .title(nonBlankOrDefault(draft.getTitle(), defaultTitle(conversation)))
                .summary(draft.getSummary() == null ? assistantText : draft.getSummary())
                .markdown(markdown)
                .nextQuestion(nonBlankOrDefault(draft.getNextQuestion(), fallbackNextQuestion))
                .assistantText(assistantText)
                .places(places)
                .routes(routes)
                .selectedPlaceIds(new ArrayList<>(conversation.getSelectedPlaceIds()))
                .createdAt(Instant.now())
                .build();

        return snapshotRepository.save(snapshot);
    }

    public PlannerSnapshot updateSelectionSnapshot(PlannerConversation conversation, List<UUID> selectedPlaceIds) {
        PlannerSnapshot latest = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversation.getId())
                .orElseGet(() -> PlannerSnapshot.builder()
                        .id(UUID.randomUUID())
                        .conversationId(conversation.getId())
                        .userId(conversation.getUserId())
                        .version(0)
                        .title(defaultTitle(conversation))
                        .summary("")
                        .nextQuestion(defaultNextQuestion(conversation))
                        .markdown(markdownBuilder.buildFallbackMarkdown(conversation, "", defaultNextQuestion(conversation), List.of(), List.of()))
                        .assistantText("")
                        .createdAt(Instant.now())
                        .build());

        List<PlannerPlaceSuggestion> places = placeEnrichmentService.syncSelectedFlags(
                latest.getPlaces() == null ? List.of() : latest.getPlaces(),
                selectedPlaceIds == null ? List.of() : selectedPlaceIds
        );
        List<PlannerRouteSegment> routes = buildRoutes(places, selectedPlaceIds == null ? List.of() : selectedPlaceIds, latest.getRoutes() == null ? List.of() : latest.getRoutes());
        Integer version = latest.getVersion() == null ? 1 : latest.getVersion() + 1;

        PlannerSnapshot snapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversation.getId())
                .userId(conversation.getUserId())
                .version(version)
                .title(latest.getTitle())
                .summary(latest.getSummary())
                .markdown(latest.getMarkdown())
                .nextQuestion(latest.getNextQuestion())
                .assistantText(latest.getAssistantText())
                .places(places)
                .routes(routes)
                .selectedPlaceIds(selectedPlaceIds == null ? new ArrayList<>() : new ArrayList<>(selectedPlaceIds))
                .createdAt(Instant.now())
                .build();

        return snapshotRepository.save(snapshot);
    }

    public PlannerSnapshot createSnapshotFromAgentResponse(PlannerConversation conversation, AgentRunResponse response) {
        if (response == null || response.getSnapshotDraft() == null) {
            throw new IllegalArgumentException("Planner Agent 响应缺少 snapshotDraft");
        }

        PlannerSnapshotDraft draft = response.getSnapshotDraft();
        if (hasText(draft.getChecksum())) {
            Optional<PlannerSnapshot> existingSnapshot = snapshotRepository
                    .findFirstByConversationIdAndChecksumOrderByVersionDesc(conversation.getId(), draft.getChecksum());
            if (existingSnapshot.isPresent()) {
                return existingSnapshot.get();
            }
        }

        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversation.getId()).orElse(null);
        assertDraftBaseVersionIsCurrent(conversation, draft, latestSnapshot);
        Integer version = (latestSnapshot == null || latestSnapshot.getVersion() == null ? 0 : latestSnapshot.getVersion()) + 1;
        List<PlannerDayPlanRef> dayPlans = mergeDayPlans(latestSnapshot, safeList(draft.getDayPlans()), draft.getCurrentDayPlan());
        PlannerDayPlanRef currentDayPlan = resolveCurrentDayPlan(draft, dayPlans);
        List<PlannerPlaceSuggestion> places = !safeList(response.getPlaces()).isEmpty()
                ? safeList(response.getPlaces())
                : !safeList(draft.getPlaces()).isEmpty()
                ? safeList(draft.getPlaces())
                : currentDayPlan == null ? new ArrayList<>() : safeList(currentDayPlan.getPlaces());
        List<PlannerRouteSegment> routes = !safeList(response.getRoutes()).isEmpty()
                ? safeList(response.getRoutes())
                : !safeList(draft.getRoutes()).isEmpty()
                ? safeList(draft.getRoutes())
                : currentDayPlan == null ? new ArrayList<>() : safeList(currentDayPlan.getRoutes());

        PlannerSnapshot snapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversation.getId())
                .userId(conversation.getUserId())
                .version(version)
                .baseVersion(draft.getBaseVersion())
                .scope(draft.getScope())
                .targetDayIndex(draft.getTargetDayIndex())
                .currentDayIndex(resolveCurrentDayIndex(draft, latestSnapshot))
                .completedDayIndexes(resolveCompletedDayIndexes(dayPlans, latestSnapshot))
                .title(firstNonBlank(response.getTitle(), draft.getTitle(), defaultTitle(conversation)))
                .summary(firstNonBlank(response.getSummary(), draft.getSummary(), response.getAssistantText()))
                .markdown(firstNonBlank(response.getMarkdown(), draft.getMarkdown(), ""))
                .nextQuestion(firstNonBlank(response.getNextQuestion(), draft.getNextQuestion(), defaultNextQuestion(conversation)))
                .assistantText(response.getAssistantText())
                .places(places)
                .routes(routes)
                .currentDayPlan(currentDayPlan)
                .dayPlans(dayPlans)
                .selectedPlaceIds(safeList(draft.getSelectedPlaceIds()))
                .rejectedPlaceIds(safeList(draft.getRejectedPlaceIds()))
                .changeSummary(draft.getChangeSummary())
                .patchOps(safeList(draft.getPatchOps()))
                .checksum(draft.getChecksum())
                .traceId(response.getTraceId())
                .agentToolCalls(safeList(response.getToolCalls()))
                .agentWarnings(safeList(response.getWarnings()))
                .createdAt(Instant.now())
                .build();

        PlannerSnapshot savedSnapshot = snapshotRepository.save(snapshot);
        return recordDayRevisionsForSnapshot(conversation, savedSnapshot);
    }

    public PlannerSnapshot getSnapshot(UUID conversationId, Integer version) {
        return findSnapshotOrThrow(conversationId, version);
    }

    public List<PlannerDayVersionResponse> listDayVersions(PlannerConversation conversation, Integer dayIndex) {
        validateDayIndex(dayIndex);
        ensureDayRevisions(conversation);
        UUID currentRevisionId = currentDayRevisionIds(conversation).get(dayKey(dayIndex));
        return dayRevisionRepository.findByConversationIdAndDayIndexOrderByDayVersionDesc(conversation.getId(), dayIndex)
                .stream()
                .map(revision -> PlannerDayVersionResponse.from(revision, revision.getId().equals(currentRevisionId)))
                .toList();
    }

    public PlannerSnapshot activateDayVersion(PlannerConversation conversation, Integer dayIndex, Integer dayVersion) {
        validateDayIndex(dayIndex);
        if (dayVersion == null || dayVersion < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Day version must be greater than zero");
        }

        ensureDayRevisions(conversation);
        PlannerDayRevision revision = dayRevisionRepository
                .findByConversationIdAndDayIndexAndDayVersion(conversation.getId(), dayIndex, dayVersion)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Planner day " + dayIndex + " version " + dayVersion + " was not found"));
        currentDayRevisionIds(conversation).put(dayKey(dayIndex), revision.getId());

        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversation.getId()).orElse(null);
        Integer nextVersion = (latestSnapshot == null || latestSnapshot.getVersion() == null ? 0 : latestSnapshot.getVersion()) + 1;
        PlannerDayPlanRef currentDayPlan = toDayPlan(revision);
        List<PlannerDayPlanRef> dayPlans = currentDayPlans(conversation);
        if (dayPlans.isEmpty()) {
            dayPlans = List.of(currentDayPlan);
        }

        PlannerSnapshot snapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversation.getId())
                .userId(conversation.getUserId())
                .version(nextVersion)
                .baseVersion(latestSnapshot == null ? null : latestSnapshot.getVersion())
                .scope("DAY_VERSION_ACTIVATE")
                .targetDayIndex(dayIndex)
                .currentDayIndex(dayIndex)
                .completedDayIndexes(completedDayIndexesFromDayPlans(dayPlans))
                .title(dayTitle(conversation, currentDayPlan, dayIndex))
                .summary("已将第 " + dayIndex + " 天切换到 v" + dayVersion)
                .markdown(nonBlankOrDefault(currentDayPlan.getMarkdown(), latestSnapshot == null ? "" : latestSnapshot.getMarkdown()))
                .nextQuestion("可以继续优化当天，或在确认所有日期后汇总完整行程。")
                .assistantText(latestSnapshot == null ? "" : latestSnapshot.getAssistantText())
                .places(safeList(currentDayPlan.getPlaces()))
                .routes(safeList(currentDayPlan.getRoutes()))
                .currentDayPlan(currentDayPlan)
                .dayPlans(dayPlans)
                .selectedPlaceIds(safeList(currentDayPlan.getSelectedPlaceIds()))
                .rejectedPlaceIds(safeList(currentDayPlan.getRejectedPlaceIds()))
                .changeSummary("Activated day " + dayIndex + " version " + dayVersion)
                .patchOps(List.of(Map.of(
                        "op", "activate-day-version",
                        "dayIndex", dayIndex,
                        "dayVersion", dayVersion,
                        "baseVersion", latestSnapshot == null ? 0 : latestSnapshot.getVersion(),
                        "toVersion", nextVersion
                )))
                .checksum(currentDayPlan.getChecksum())
                .traceId(latestSnapshot == null ? null : latestSnapshot.getTraceId())
                .agentToolCalls(latestSnapshot == null ? new ArrayList<>() : safeList(latestSnapshot.getAgentToolCalls()))
                .agentWarnings(latestSnapshot == null ? new ArrayList<>() : safeList(latestSnapshot.getAgentWarnings()))
                .createdAt(Instant.now())
                .build();

        return snapshotRepository.save(snapshot);
    }

    public PlannerSnapshot rollbackSnapshot(PlannerConversation conversation, Integer version) {
        PlannerSnapshot source = findSnapshotOrThrow(conversation.getId(), version);
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversation.getId()).orElse(null);
        Integer nextVersion = (latestSnapshot == null || latestSnapshot.getVersion() == null ? 0 : latestSnapshot.getVersion()) + 1;

        PlannerSnapshot restoredSnapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversation.getId())
                .userId(conversation.getUserId())
                .version(nextVersion)
                .baseVersion(source.getVersion())
                .scope("ROLLBACK")
                .targetDayIndex(source.getTargetDayIndex())
                .currentDayIndex(source.getCurrentDayIndex())
                .completedDayIndexes(safeList(source.getCompletedDayIndexes()))
                .title(source.getTitle())
                .summary(source.getSummary())
                .markdown(source.getMarkdown())
                .nextQuestion(source.getNextQuestion())
                .assistantText(source.getAssistantText())
                .places(safeList(source.getPlaces()))
                .routes(safeList(source.getRoutes()))
                .currentDayPlan(source.getCurrentDayPlan())
                .dayPlans(safeList(source.getDayPlans()))
                .selectedPlaceIds(safeList(source.getSelectedPlaceIds()))
                .rejectedPlaceIds(safeList(source.getRejectedPlaceIds()))
                .changeSummary("Restored from version " + source.getVersion())
                .patchOps(List.of(Map.of(
                        "op", "rollback",
                        "fromVersion", source.getVersion(),
                        "toVersion", nextVersion
                )))
                .checksum(source.getChecksum())
                .traceId(source.getTraceId())
                .agentToolCalls(safeList(source.getAgentToolCalls()))
                .agentWarnings(safeList(source.getAgentWarnings()))
                .createdAt(Instant.now())
                .build();

        return snapshotRepository.save(restoredSnapshot);
    }

    public PlannerSnapshot restoreDaySnapshot(PlannerConversation conversation, Integer dayIndex, Integer version) {
        validateDayIndex(dayIndex);
        ensureDayRevisions(conversation);

        PlannerSnapshot sourceSnapshot = findSnapshotOrThrow(conversation.getId(), version);
        PlannerDayPlanRef sourceDayPlan = findDayPlan(sourceSnapshot, dayIndex)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Planner day " + dayIndex + " was not found in snapshot version " + version));
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversation.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Cannot restore a day before a planner snapshot exists"));
        recordSnapshotDayRevisions(conversation, latestSnapshot);
        PlannerDayRevision revision = recordDayRevision(conversation, sourceDayPlan, sourceSnapshot);
        currentDayRevisionIds(conversation).put(dayKey(dayIndex), revision.getId());
        Integer nextVersion = (latestSnapshot.getVersion() == null ? 0 : latestSnapshot.getVersion()) + 1;
        List<PlannerDayPlanRef> mergedDayPlans = currentDayPlans(conversation);

        PlannerSnapshot snapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversation.getId())
                .userId(conversation.getUserId())
                .version(nextVersion)
                .baseVersion(latestSnapshot.getVersion())
                .scope("DAY_RESTORE")
                .targetDayIndex(dayIndex)
                .currentDayIndex(dayIndex)
                .completedDayIndexes(completedDayIndexesFromDayPlans(mergedDayPlans))
                .title(dayTitle(conversation, sourceDayPlan, dayIndex))
                .summary("已将第 " + dayIndex + " 天恢复到日版本来源 v" + sourceSnapshot.getVersion())
                .markdown(nonBlankOrDefault(sourceDayPlan.getMarkdown(), latestSnapshot.getMarkdown()))
                .nextQuestion("可以继续优化当天，或在确认所有日期后汇总完整行程。")
                .assistantText(sourceSnapshot.getAssistantText())
                .places(safeList(sourceDayPlan.getPlaces()))
                .routes(safeList(sourceDayPlan.getRoutes()))
                .currentDayPlan(sourceDayPlan)
                .dayPlans(mergedDayPlans)
                .selectedPlaceIds(safeList(sourceDayPlan.getSelectedPlaceIds()))
                .rejectedPlaceIds(safeList(sourceDayPlan.getRejectedPlaceIds()))
                .changeSummary("Restored day " + dayIndex + " from global snapshot v" + sourceSnapshot.getVersion())
                .patchOps(List.of(Map.of(
                        "op", "restore-day",
                        "dayIndex", dayIndex,
                        "fromVersion", sourceSnapshot.getVersion(),
                        "baseVersion", latestSnapshot.getVersion(),
                        "toVersion", nextVersion
                )))
                .checksum(sourceDayPlan.getChecksum())
                .traceId(sourceSnapshot.getTraceId())
                .agentToolCalls(safeList(sourceSnapshot.getAgentToolCalls()))
                .agentWarnings(safeList(sourceSnapshot.getAgentWarnings()))
                .createdAt(Instant.now())
                .build();

        return snapshotRepository.save(snapshot);
    }

    public PlannerSnapshot assembleTripSnapshot(PlannerConversation conversation) {
        PlannerSnapshot latestSnapshot = snapshotRepository.findFirstByConversationIdOrderByVersionDesc(conversation.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Cannot assemble a trip before a planner snapshot exists"));
        ensureDayRevisions(conversation);
        List<PlannerDayPlanRef> dayPlans = currentDayPlans(conversation);
        if (dayPlans.isEmpty()) {
            dayPlans = resolveLatestDayPlans(conversation.getId(), latestSnapshot);
        }
        if (dayPlans.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot assemble a trip before day plans exist");
        }

        Integer nextVersion = (latestSnapshot.getVersion() == null ? 0 : latestSnapshot.getVersion()) + 1;
        List<PlannerPlaceSuggestion> places = flattenDayPlaces(dayPlans);
        List<PlannerRouteSegment> routes = flattenDayRoutes(dayPlans);
        List<UUID> selectedPlaceIds = flattenSelectedPlaceIds(dayPlans);
        String markdown = buildTripMarkdown(conversation, dayPlans);

        PlannerSnapshot snapshot = PlannerSnapshot.builder()
                .id(UUID.randomUUID())
                .conversationId(conversation.getId())
                .userId(conversation.getUserId())
                .version(nextVersion)
                .baseVersion(latestSnapshot.getVersion())
                .scope("TRIP_ASSEMBLE")
                .currentDayIndex(latestSnapshot.getCurrentDayIndex())
                .completedDayIndexes(completedDayIndexesFromDayPlans(dayPlans))
                .title(conversation.getCoreSlots().getCity() + dayPlans.size() + "日完整行程")
                .summary("已根据当前日计划汇总完整行程")
                .markdown(markdown)
                .nextQuestion("完整行程已汇总，可以继续微调某一天或进入预订/发布流程。")
                .assistantText(markdown)
                .places(places)
                .routes(routes)
                .currentDayPlan(latestSnapshot.getCurrentDayPlan())
                .dayPlans(dayPlans)
                .selectedPlaceIds(selectedPlaceIds)
                .rejectedPlaceIds(safeList(latestSnapshot.getRejectedPlaceIds()))
                .changeSummary("Assembled trip from day plans")
                .patchOps(List.of(Map.of(
                        "op", "assemble-trip",
                        "baseVersion", latestSnapshot.getVersion(),
                        "toVersion", nextVersion
                )))
                .checksum(latestSnapshot.getChecksum())
                .traceId(latestSnapshot.getTraceId())
                .agentToolCalls(safeList(latestSnapshot.getAgentToolCalls()))
                .agentWarnings(safeList(latestSnapshot.getAgentWarnings()))
                .createdAt(Instant.now())
                .build();

        return snapshotRepository.save(snapshot);
    }

    public PlannerSnapshotDiffResponse diffSnapshots(UUID conversationId, Integer fromVersion, Integer toVersion) {
        PlannerSnapshot fromSnapshot = findSnapshotOrThrow(conversationId, fromVersion);
        PlannerSnapshot toSnapshot = findSnapshotOrThrow(conversationId, toVersion);
        List<PlannerSnapshotDiffItem> changes = new ArrayList<>();

        addValueChange(changes, "title", "Title", fromSnapshot.getTitle(), toSnapshot.getTitle());
        addValueChange(changes, "summary", "Summary", fromSnapshot.getSummary(), toSnapshot.getSummary());
        addMarkdownChange(changes, fromSnapshot.getMarkdown(), toSnapshot.getMarkdown());
        addCollectionDiff(changes, "places", "Places", placeLabels(fromSnapshot.getPlaces()), placeLabels(toSnapshot.getPlaces()));
        addCollectionDiff(changes, "selectedPlaceIds", "Selected places",
                uuidStrings(fromSnapshot.getSelectedPlaceIds()),
                uuidStrings(toSnapshot.getSelectedPlaceIds()));
        addCollectionDiff(changes, "rejectedPlaceIds", "Rejected places",
                uuidStrings(fromSnapshot.getRejectedPlaceIds()),
                uuidStrings(toSnapshot.getRejectedPlaceIds()));
        addValueChange(changes, "currentDayIndex", "Current day", fromSnapshot.getCurrentDayIndex(), toSnapshot.getCurrentDayIndex());
        addCollectionDiff(changes, "completedDayIndexes", "Completed days",
                integerStrings(fromSnapshot.getCompletedDayIndexes()),
                integerStrings(toSnapshot.getCompletedDayIndexes()));
        addDayPlanDiff(changes, fromSnapshot.getDayPlans(), toSnapshot.getDayPlans());
        addValueChange(changes, "scope", "Planning scope", fromSnapshot.getScope(), toSnapshot.getScope());
        addValueChange(changes, "changeSummary", "Change summary", fromSnapshot.getChangeSummary(), toSnapshot.getChangeSummary());

        return PlannerSnapshotDiffResponse.builder()
                .conversationId(conversationId)
                .fromVersion(fromSnapshot.getVersion())
                .toVersion(toSnapshot.getVersion())
                .fromTitle(fromSnapshot.getTitle())
                .toTitle(toSnapshot.getTitle())
                .changes(changes)
                .build();
    }

    private PlannerSnapshot findSnapshotOrThrow(UUID conversationId, Integer version) {
        if (version == null || version < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Snapshot version must be a non-negative integer");
        }

        return snapshotRepository.findByConversationIdAndVersion(conversationId, version)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Planner snapshot version " + version + " was not found"));
    }

    private void addValueChange(List<PlannerSnapshotDiffItem> changes, String field, String label, Object beforeValue, Object afterValue) {
        if (Objects.equals(beforeValue, afterValue)) {
            return;
        }
        changes.add(PlannerSnapshotDiffItem.builder()
                .field(field)
                .label(label)
                .type(changeType(beforeValue, afterValue))
                .beforeValue(beforeValue)
                .afterValue(afterValue)
                .summary(label + " changed")
                .build());
    }

    private void addMarkdownChange(List<PlannerSnapshotDiffItem> changes, String beforeMarkdown, String afterMarkdown) {
        if (Objects.equals(beforeMarkdown, afterMarkdown)) {
            return;
        }
        Map<String, Object> beforeStats = markdownStats(beforeMarkdown);
        Map<String, Object> afterStats = markdownStats(afterMarkdown);
        changes.add(PlannerSnapshotDiffItem.builder()
                .field("markdown")
                .label("Markdown")
                .type(changeType(beforeMarkdown, afterMarkdown))
                .beforeValue(beforeStats)
                .afterValue(afterStats)
                .summary("Markdown changed from " + beforeStats.get("lineCount") + " to " + afterStats.get("lineCount") + " lines")
                .build());
    }

    private Map<String, Object> markdownStats(String markdown) {
        String safeMarkdown = markdown == null ? "" : markdown;
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("lineCount", safeMarkdown.isBlank() ? 0 : safeMarkdown.split("\\R", -1).length);
        stats.put("characterCount", safeMarkdown.length());
        return stats;
    }

    private void addCollectionDiff(List<PlannerSnapshotDiffItem> changes, String field, String label, List<String> beforeValues, List<String> afterValues) {
        List<String> beforeSafeValues = beforeValues == null ? List.of() : beforeValues;
        List<String> afterSafeValues = afterValues == null ? List.of() : afterValues;
        List<String> added = afterSafeValues.stream()
                .filter(value -> !beforeSafeValues.contains(value))
                .toList();
        List<String> removed = beforeSafeValues.stream()
                .filter(value -> !afterSafeValues.contains(value))
                .toList();
        if (added.isEmpty() && removed.isEmpty()) {
            return;
        }

        Map<String, Object> beforeValue = new LinkedHashMap<>();
        beforeValue.put("removed", removed);
        beforeValue.put("count", beforeSafeValues.size());
        Map<String, Object> afterValue = new LinkedHashMap<>();
        afterValue.put("added", added);
        afterValue.put("count", afterSafeValues.size());

        changes.add(PlannerSnapshotDiffItem.builder()
                .field(field)
                .label(label)
                .type(collectionChangeType(added, removed))
                .beforeValue(beforeValue)
                .afterValue(afterValue)
                .summary(label + ": +" + added.size() + " / -" + removed.size())
                .build());
    }

    private void addDayPlanDiff(List<PlannerSnapshotDiffItem> changes, List<PlannerDayPlanRef> beforeDayPlans, List<PlannerDayPlanRef> afterDayPlans) {
        Map<Integer, PlannerDayPlanRef> beforeByIndex = dayPlansByIndex(beforeDayPlans);
        Map<Integer, PlannerDayPlanRef> afterByIndex = dayPlansByIndex(afterDayPlans);

        List<Integer> added = afterByIndex.keySet().stream()
                .filter(dayIndex -> !beforeByIndex.containsKey(dayIndex))
                .sorted()
                .toList();
        List<Integer> removed = beforeByIndex.keySet().stream()
                .filter(dayIndex -> !afterByIndex.containsKey(dayIndex))
                .sorted()
                .toList();
        List<Integer> changed = afterByIndex.keySet().stream()
                .filter(beforeByIndex::containsKey)
                .filter(dayIndex -> dayPlanChanged(beforeByIndex.get(dayIndex), afterByIndex.get(dayIndex)))
                .sorted()
                .toList();

        if (added.isEmpty() && removed.isEmpty() && changed.isEmpty()) {
            return;
        }

        Map<String, Object> beforeValue = new LinkedHashMap<>();
        beforeValue.put("removed", removed);
        beforeValue.put("changed", changed);
        beforeValue.put("count", beforeByIndex.size());
        Map<String, Object> afterValue = new LinkedHashMap<>();
        afterValue.put("added", added);
        afterValue.put("changed", changed);
        afterValue.put("count", afterByIndex.size());

        changes.add(PlannerSnapshotDiffItem.builder()
                .field("dayPlans")
                .label("Day plans")
                .type(collectionChangeType(added.stream().map(String::valueOf).toList(), removed.stream().map(String::valueOf).toList()))
                .beforeValue(beforeValue)
                .afterValue(afterValue)
                .summary("Day plans: +" + added.size() + " / -" + removed.size() + " / changed " + changed.size())
                .build());
    }

    private Map<Integer, PlannerDayPlanRef> dayPlansByIndex(List<PlannerDayPlanRef> dayPlans) {
        if (dayPlans == null) {
            return Map.of();
        }
        return dayPlans.stream()
                .filter(dayPlan -> dayPlan.getDayIndex() != null)
                .collect(Collectors.toMap(PlannerDayPlanRef::getDayIndex, dayPlan -> dayPlan, (first, ignored) -> first, LinkedHashMap::new));
    }

    private boolean dayPlanChanged(PlannerDayPlanRef beforeDayPlan, PlannerDayPlanRef afterDayPlan) {
        return !Objects.equals(beforeDayPlan.getStatus(), afterDayPlan.getStatus())
                || !Objects.equals(beforeDayPlan.getTitle(), afterDayPlan.getTitle())
                || !Objects.equals(beforeDayPlan.getMarkdown(), afterDayPlan.getMarkdown())
                || !Objects.equals(beforeDayPlan.getSelectedPlaceIds(), afterDayPlan.getSelectedPlaceIds())
                || !Objects.equals(beforeDayPlan.getRejectedPlaceIds(), afterDayPlan.getRejectedPlaceIds())
                || !Objects.equals(beforeDayPlan.getChecksum(), afterDayPlan.getChecksum());
    }

    private String changeType(Object beforeValue, Object afterValue) {
        if (isEmptyValue(beforeValue)) {
            return "ADDED";
        }
        if (isEmptyValue(afterValue)) {
            return "REMOVED";
        }
        return "CHANGED";
    }

    private String collectionChangeType(List<String> added, List<String> removed) {
        if (!added.isEmpty() && removed.isEmpty()) {
            return "ADDED";
        }
        if (added.isEmpty() && !removed.isEmpty()) {
            return "REMOVED";
        }
        return "CHANGED";
    }

    private boolean isEmptyValue(Object value) {
        return value == null || value instanceof String text && text.isBlank();
    }

    private List<String> placeLabels(List<PlannerPlaceSuggestion> places) {
        if (places == null) {
            return List.of();
        }
        return places.stream()
                .map(place -> firstNonBlank(place.getName(), place.getPlaceId() == null ? "" : place.getPlaceId().toString()))
                .filter(this::hasText)
                .collect(Collectors.collectingAndThen(
                        Collectors.toCollection(LinkedHashSet::new),
                        ArrayList::new
                ));
    }

    private List<String> uuidStrings(List<UUID> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream().map(UUID::toString).toList();
    }

    private List<String> integerStrings(List<Integer> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream().map(String::valueOf).toList();
    }

    private Optional<PlannerDayPlanRef> findDayPlan(PlannerSnapshot snapshot, Integer dayIndex) {
        if (snapshot == null || dayIndex == null) {
            return Optional.empty();
        }
        if (snapshot.getCurrentDayPlan() != null && dayIndex.equals(snapshot.getCurrentDayPlan().getDayIndex())) {
            return Optional.of(snapshot.getCurrentDayPlan());
        }
        if (snapshot.getDayPlans() != null) {
            Optional<PlannerDayPlanRef> dayPlan = snapshot.getDayPlans().stream()
                    .filter(item -> dayIndex.equals(item.getDayIndex()))
                    .findFirst();
            if (dayPlan.isPresent()) {
                return dayPlan;
            }
        }
        return fallbackTopLevelDayPlan(snapshot)
                .filter(dayPlan -> dayIndex.equals(dayPlan.getDayIndex()));
    }

    private void validateDayIndex(Integer dayIndex) {
        if (dayIndex == null || dayIndex < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Day index must be greater than zero");
        }
    }

    private List<PlannerDayPlanRef> replaceDayPlan(List<PlannerDayPlanRef> latestDayPlans, PlannerDayPlanRef sourceDayPlan) {
        Map<Integer, PlannerDayPlanRef> dayPlansByIndex = new LinkedHashMap<>();
        safeList(latestDayPlans).stream()
                .filter(dayPlan -> dayPlan.getDayIndex() != null)
                .forEach(dayPlan -> dayPlansByIndex.put(dayPlan.getDayIndex(), dayPlan));
        dayPlansByIndex.put(sourceDayPlan.getDayIndex(), sourceDayPlan);
        return dayPlansByIndex.values().stream()
                .sorted(Comparator.comparing(PlannerDayPlanRef::getDayIndex))
                .toList();
    }

    private PlannerSnapshot recordDayRevisionsForSnapshot(PlannerConversation conversation, PlannerSnapshot snapshot) {
        recordSnapshotDayRevisions(conversation, snapshot);
        List<PlannerDayPlanRef> currentDayPlans = currentDayPlans(conversation);
        if (!currentDayPlans.isEmpty()) {
            snapshot.setDayPlans(currentDayPlans);
            Integer currentDayIndex = snapshot.getCurrentDayIndex();
            PlannerDayPlanRef currentDayPlan = currentDayPlans.stream()
                    .filter(dayPlan -> Objects.equals(dayPlan.getDayIndex(), currentDayIndex))
                    .findFirst()
                    .orElse(snapshot.getCurrentDayPlan());
            snapshot.setCurrentDayPlan(currentDayPlan);
            snapshot = snapshotRepository.save(snapshot);
        }
        return snapshot;
    }

    private void ensureDayRevisions(PlannerConversation conversation) {
        List<PlannerDayRevision> existingRevisions = safeList(dayRevisionRepository.findByConversationId(conversation.getId()));
        if (existingRevisions.isEmpty()) {
            safeList(snapshotRepository.findByConversationIdOrderByVersionDesc(conversation.getId())).stream()
                    .sorted(Comparator.comparing(snapshot -> snapshot.getVersion() == null ? 0 : snapshot.getVersion()))
                    .forEach(snapshot -> recordSnapshotDayRevisions(conversation, snapshot));
            return;
        }

        Map<String, UUID> currentRevisionIds = currentDayRevisionIds(conversation);
        existingRevisions.stream()
                .sorted(Comparator
                        .comparing(PlannerDayRevision::getDayIndex, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(PlannerDayRevision::getDayVersion, Comparator.nullsLast(Comparator.reverseOrder())))
                .forEach(revision -> currentRevisionIds.putIfAbsent(dayKey(revision.getDayIndex()), revision.getId()));
    }

    private void recordSnapshotDayRevisions(PlannerConversation conversation, PlannerSnapshot snapshot) {
        dayPlansFromSnapshot(snapshot).forEach(dayPlan -> recordDayRevision(conversation, dayPlan, snapshot));
    }

    private PlannerDayRevision recordDayRevision(PlannerConversation conversation, PlannerDayPlanRef dayPlan, PlannerSnapshot sourceSnapshot) {
        if (dayPlan == null || dayPlan.getDayIndex() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Day revision requires a day index");
        }

        String contentHash = contentHash(dayPlan);
        Optional<PlannerDayRevision> existingRevision = dayRevisionRepository
                .findFirstByConversationIdAndDayIndexAndContentHashOrderByDayVersionDesc(conversation.getId(), dayPlan.getDayIndex(), contentHash);
        if (existingRevision.isPresent()) {
            currentDayRevisionIds(conversation).put(dayKey(dayPlan.getDayIndex()), existingRevision.get().getId());
            return existingRevision.get();
        }

        PlannerDayRevision latestRevision = dayRevisionRepository
                .findFirstByConversationIdAndDayIndexOrderByDayVersionDesc(conversation.getId(), dayPlan.getDayIndex())
                .orElse(null);
        Integer nextDayVersion = latestRevision == null || latestRevision.getDayVersion() == null
                ? 1
                : latestRevision.getDayVersion() + 1;

        PlannerDayRevision revision = PlannerDayRevision.builder()
                .id(UUID.randomUUID())
                .conversationId(conversation.getId())
                .userId(conversation.getUserId())
                .dayIndex(dayPlan.getDayIndex())
                .dayVersion(nextDayVersion)
                .date(dayPlan.getDate())
                .status(nonBlankOrDefault(dayPlan.getStatus(), "DRAFT"))
                .title(dayPlan.getTitle())
                .markdown(nonBlankOrDefault(dayPlan.getMarkdown(), ""))
                .places(safeList(dayPlan.getPlaces()))
                .routes(safeList(dayPlan.getRoutes()))
                .selectedPlaceIds(safeList(dayPlan.getSelectedPlaceIds()))
                .rejectedPlaceIds(safeList(dayPlan.getRejectedPlaceIds()))
                .changeSummary(dayPlan.getChangeSummary())
                .checksum(dayPlan.getChecksum())
                .contentHash(contentHash)
                .sourceSnapshotVersion(sourceSnapshot == null ? null : sourceSnapshot.getVersion())
                .baseDayRevisionId(latestRevision == null ? null : latestRevision.getId())
                .createdAt(sourceSnapshot != null && sourceSnapshot.getCreatedAt() != null ? sourceSnapshot.getCreatedAt() : Instant.now())
                .build();
        PlannerDayRevision savedRevision = dayRevisionRepository.save(revision);
        currentDayRevisionIds(conversation).put(dayKey(dayPlan.getDayIndex()), savedRevision.getId());
        return savedRevision;
    }

    private List<PlannerDayPlanRef> currentDayPlans(PlannerConversation conversation) {
        return currentDayRevisionIds(conversation).entrySet().stream()
                .map(entry -> dayRevisionRepository.findById(entry.getValue()).orElse(null))
                .filter(Objects::nonNull)
                .map(this::toDayPlan)
                .sorted(Comparator.comparing(PlannerDayPlanRef::getDayIndex))
                .toList();
    }

    private PlannerDayPlanRef toDayPlan(PlannerDayRevision revision) {
        return PlannerDayPlanRef.builder()
                .dayIndex(revision.getDayIndex())
                .date(revision.getDate())
                .status(revision.getStatus())
                .title(revision.getTitle())
                .markdown(revision.getMarkdown())
                .places(safeList(revision.getPlaces()))
                .routes(safeList(revision.getRoutes()))
                .selectedPlaceIds(safeList(revision.getSelectedPlaceIds()))
                .rejectedPlaceIds(safeList(revision.getRejectedPlaceIds()))
                .changeSummary(revision.getChangeSummary())
                .checksum(revision.getChecksum())
                .build();
    }

    private Map<String, UUID> currentDayRevisionIds(PlannerConversation conversation) {
        if (conversation.getCurrentDayRevisionIds() == null) {
            conversation.setCurrentDayRevisionIds(new LinkedHashMap<>());
        }
        return conversation.getCurrentDayRevisionIds();
    }

    private String dayKey(Integer dayIndex) {
        return String.valueOf(dayIndex);
    }

    private List<PlannerDayPlanRef> resolveLatestDayPlans(UUID conversationId, PlannerSnapshot latestSnapshot) {
        Map<Integer, PlannerDayPlanRef> dayPlansByIndex = new LinkedHashMap<>();
        List<PlannerSnapshot> snapshots = safeList(snapshotRepository.findByConversationIdOrderByVersionDesc(conversationId));
        if (snapshots.isEmpty() && latestSnapshot != null) {
            snapshots.add(latestSnapshot);
        }

        for (PlannerSnapshot snapshot : snapshots) {
            for (PlannerDayPlanRef dayPlan : dayPlansFromSnapshot(snapshot)) {
                if (dayPlan.getDayIndex() != null) {
                    dayPlansByIndex.putIfAbsent(dayPlan.getDayIndex(), dayPlan);
                }
            }
        }

        return dayPlansByIndex.values().stream()
                .sorted(Comparator.comparing(PlannerDayPlanRef::getDayIndex))
                .toList();
    }

    private List<PlannerDayPlanRef> dayPlansFromSnapshot(PlannerSnapshot snapshot) {
        if (snapshot == null) {
            return new ArrayList<>();
        }

        Map<Integer, PlannerDayPlanRef> dayPlansByIndex = new LinkedHashMap<>();
        safeList(snapshot.getDayPlans()).stream()
                .filter(dayPlan -> dayPlan.getDayIndex() != null)
                .forEach(dayPlan -> dayPlansByIndex.put(dayPlan.getDayIndex(), dayPlan));
        if (snapshot.getCurrentDayPlan() != null && snapshot.getCurrentDayPlan().getDayIndex() != null) {
            dayPlansByIndex.put(snapshot.getCurrentDayPlan().getDayIndex(), snapshot.getCurrentDayPlan());
        }
        fallbackTopLevelDayPlan(snapshot).ifPresent(dayPlan -> dayPlansByIndex.putIfAbsent(dayPlan.getDayIndex(), dayPlan));

        return new ArrayList<>(dayPlansByIndex.values());
    }

    private Optional<PlannerDayPlanRef> fallbackTopLevelDayPlan(PlannerSnapshot snapshot) {
        Integer dayIndex = snapshot.getTargetDayIndex() != null ? snapshot.getTargetDayIndex() : snapshot.getCurrentDayIndex();
        if (dayIndex == null || !hasText(snapshot.getMarkdown())) {
            return Optional.empty();
        }

        return Optional.of(PlannerDayPlanRef.builder()
                .dayIndex(dayIndex)
                .status(safeList(snapshot.getCompletedDayIndexes()).contains(dayIndex) ? "CONFIRMED" : "DRAFT")
                .title(snapshot.getTitle())
                .markdown(snapshot.getMarkdown())
                .places(safeList(snapshot.getPlaces()))
                .routes(safeList(snapshot.getRoutes()))
                .selectedPlaceIds(safeList(snapshot.getSelectedPlaceIds()))
                .rejectedPlaceIds(safeList(snapshot.getRejectedPlaceIds()))
                .changeSummary(snapshot.getChangeSummary())
                .checksum(snapshot.getChecksum())
                .build());
    }

    private String contentHash(PlannerDayPlanRef dayPlan) {
        String value = String.join("|",
                String.valueOf(dayPlan.getDayIndex()),
                String.valueOf(dayPlan.getDate()),
                nullToEmpty(dayPlan.getStatus()),
                nullToEmpty(dayPlan.getTitle()),
                nullToEmpty(dayPlan.getMarkdown()),
                uuidStrings(dayPlan.getSelectedPlaceIds()).toString(),
                uuidStrings(dayPlan.getRejectedPlaceIds()).toString(),
                placeLabels(dayPlan.getPlaces()).toString(),
                routeLabels(dayPlan.getRoutes()).toString()
        );
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte item : hash) {
                builder.append(String.format("%02x", item));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private List<String> routeLabels(List<PlannerRouteSegment> routes) {
        if (routes == null) {
            return List.of();
        }
        return routes.stream()
                .map(route -> String.join(">",
                        route.getFromPlaceId() == null ? "" : route.getFromPlaceId().toString(),
                        route.getToPlaceId() == null ? "" : route.getToPlaceId().toString(),
                        nullToEmpty(route.getTransportMode()),
                        nullToEmpty(route.getSummary())
                ))
                .toList();
    }

    private List<Integer> completedDayIndexesFromDayPlans(List<PlannerDayPlanRef> dayPlans) {
        return safeList(dayPlans).stream()
                .filter(dayPlan -> "CONFIRMED".equals(dayPlan.getStatus()))
                .map(PlannerDayPlanRef::getDayIndex)
                .filter(dayIndex -> dayIndex != null)
                .sorted()
                .toList();
    }

    private String dayTitle(PlannerConversation conversation, PlannerDayPlanRef dayPlan, Integer dayIndex) {
        if (dayPlan != null && hasText(dayPlan.getTitle())) {
            return dayPlan.getTitle();
        }
        return conversation.getCoreSlots().getCity() + "第" + dayIndex + "天计划";
    }

    private String buildTripMarkdown(PlannerConversation conversation, List<PlannerDayPlanRef> dayPlans) {
        StringBuilder builder = new StringBuilder();
        builder.append("# ")
                .append(conversation.getCoreSlots().getCity())
                .append(dayPlans.size())
                .append("日完整行程")
                .append("\n\n");

        for (PlannerDayPlanRef dayPlan : dayPlans) {
            builder.append("## 第 ")
                    .append(dayPlan.getDayIndex())
                    .append(" 天");
            if (dayPlan.getDate() != null) {
                builder.append("（").append(dayPlan.getDate()).append("）");
            }
            if (hasText(dayPlan.getTitle())) {
                builder.append(" - ").append(dayPlan.getTitle());
            }
            builder.append("\n\n");
            builder.append("> 状态：")
                    .append("CONFIRMED".equals(dayPlan.getStatus()) ? "已确认" : "草稿")
                    .append("\n\n");
            builder.append(nonBlankOrDefault(dayPlan.getMarkdown(), "当天计划待补充。"))
                    .append("\n\n");
        }
        return builder.toString().trim();
    }

    private List<PlannerPlaceSuggestion> flattenDayPlaces(List<PlannerDayPlanRef> dayPlans) {
        Map<UUID, PlannerPlaceSuggestion> placesById = new LinkedHashMap<>();
        for (PlannerDayPlanRef dayPlan : safeList(dayPlans)) {
            for (PlannerPlaceSuggestion place : safeList(dayPlan.getPlaces())) {
                if (place.getPlaceId() != null) {
                    placesById.putIfAbsent(place.getPlaceId(), place);
                }
            }
        }
        return new ArrayList<>(placesById.values());
    }

    private List<PlannerRouteSegment> flattenDayRoutes(List<PlannerDayPlanRef> dayPlans) {
        return safeList(dayPlans).stream()
                .flatMap(dayPlan -> safeList(dayPlan.getRoutes()).stream())
                .toList();
    }

    private List<UUID> flattenSelectedPlaceIds(List<PlannerDayPlanRef> dayPlans) {
        return safeList(dayPlans).stream()
                .flatMap(dayPlan -> safeList(dayPlan.getSelectedPlaceIds()).stream())
                .distinct()
                .toList();
    }

    private List<PlannerRouteSegment> buildRoutes(List<PlannerPlaceSuggestion> places, List<UUID> selectedPlaceIds, List<PlannerRouteSegment> fallbackRoutes) {
        List<UUID> safeSelectedPlaceIds = selectedPlaceIds == null ? List.of() : selectedPlaceIds;
        List<PlannerPlaceSuggestion> ordered = places.stream()
                .filter(place -> place.isSelected() || safeSelectedPlaceIds.contains(place.getPlaceId()))
                .sorted(Comparator.comparingInt(place -> selectionOrder(safeSelectedPlaceIds, place.getPlaceId())))
                .collect(Collectors.toList());

        if (ordered.size() < 2) {
            return fallbackRoutes == null ? List.of() : fallbackRoutes;
        }

        List<PlannerRouteSegment> routes = new ArrayList<>();
        for (int i = 0; i < ordered.size() - 1; i++) {
            PlannerPlaceSuggestion from = ordered.get(i);
            PlannerPlaceSuggestion to = ordered.get(i + 1);
            if (from.getLatitude() == null || from.getLongitude() == null || to.getLatitude() == null || to.getLongitude() == null) {
                continue;
            }
            double distanceKm = haversineKm(from.getLatitude(), from.getLongitude(), to.getLatitude(), to.getLongitude());
            routes.add(PlannerRouteSegment.builder()
                    .fromPlaceId(from.getPlaceId())
                    .toPlaceId(to.getPlaceId())
                    .transportMode("walk")
                    .distanceKm(distanceKm)
                    .estimatedMinutes((int) Math.max(5, Math.round(distanceKm * 14)))
                    .summary(from.getName() + " 到 " + to.getName())
                    .build());
        }

        return routes;
    }

    private void assertDraftBaseVersionIsCurrent(
            PlannerConversation conversation,
            PlannerSnapshotDraft draft,
            PlannerSnapshot latestSnapshot
    ) {
        if (draft.getBaseVersion() == null) {
            return;
        }

        Integer latestVersion = latestSnapshot == null || latestSnapshot.getVersion() == null
                ? 0
                : latestSnapshot.getVersion();
        if (!draft.getBaseVersion().equals(latestVersion)) {
            throw new PlannerSnapshotVersionConflictException(
                    conversation.getId(),
                    draft.getBaseVersion(),
                    latestVersion,
                    draft.getChecksum()
            );
        }
    }

    private List<PlannerPlaceSuggestion> carryForwardPlaceIdentity(List<PlannerPlaceSuggestion> draftPlaces, List<PlannerPlaceSuggestion> previousPlaces) {
        if (draftPlaces == null || draftPlaces.isEmpty()) {
            return List.of();
        }
        if (previousPlaces == null || previousPlaces.isEmpty()) {
            return draftPlaces;
        }

        Map<String, PlannerPlaceSuggestion> previousByKey = previousPlaces.stream()
                .filter(place -> hasText(place.getName()))
                .collect(Collectors.toMap(this::placeKey, place -> place, (first, ignored) -> first));

        draftPlaces.forEach(place -> {
            PlannerPlaceSuggestion previous = previousByKey.get(placeKey(place));
            if (previous == null) {
                return;
            }

            place.setPlaceId(previous.getPlaceId());
            if (place.getLatitude() == null) {
                place.setLatitude(previous.getLatitude());
            }
            if (place.getLongitude() == null) {
                place.setLongitude(previous.getLongitude());
            }
            if (!hasText(place.getAddress())) {
                place.setAddress(previous.getAddress());
            }
            if (!hasText(place.getImageUrl())) {
                place.setImageUrl(previous.getImageUrl());
            }
            if (!hasText(place.getAmapPoiId())) {
                place.setAmapPoiId(previous.getAmapPoiId());
            }
            if (place.getInternalOfferId() == null) {
                place.setInternalOfferId(previous.getInternalOfferId());
            }
            if (previous.getSource() != null) {
                place.setSource(previous.getSource());
            }
        });

        return draftPlaces;
    }

    private int selectionOrder(List<UUID> selectedPlaceIds, UUID placeId) {
        if (selectedPlaceIds == null || selectedPlaceIds.isEmpty()) {
            return Integer.MAX_VALUE;
        }
        int index = selectedPlaceIds.indexOf(placeId);
        return index < 0 ? Integer.MAX_VALUE : index;
    }

    private String placeKey(PlannerPlaceSuggestion place) {
        String name = place.getName() == null ? "" : place.getName().trim().toLowerCase(Locale.ROOT);
        String type = place.getType() == null ? "" : place.getType().name();
        return name + "|" + type;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
    }

    private String defaultTitle(PlannerConversation conversation) {
        return conversation.getCoreSlots().getCity() + " \u884C\u524D\u89C4\u5212";
    }

    private String defaultNextQuestion(PlannerConversation conversation) {
        return "你想先从酒店区域、核心景点，还是餐厅偏好开始？";
    }

    private String nonBlankOrDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value;
            }
        }
        return "";
    }

    private Integer resolveCurrentDayIndex(PlannerSnapshotDraft draft, PlannerSnapshot latestSnapshot) {
        if (draft.getTargetDayIndex() != null) {
            return draft.getTargetDayIndex();
        }
        return latestSnapshot == null ? null : latestSnapshot.getCurrentDayIndex();
    }

    private PlannerDayPlanRef resolveCurrentDayPlan(PlannerSnapshotDraft draft, List<PlannerDayPlanRef> dayPlans) {
        if (draft.getCurrentDayPlan() != null) {
            return draft.getCurrentDayPlan();
        }
        if (draft.getTargetDayIndex() == null || dayPlans == null) {
            return null;
        }
        return dayPlans.stream()
                .filter(dayPlan -> draft.getTargetDayIndex().equals(dayPlan.getDayIndex()))
                .findFirst()
                .orElse(null);
    }

    private List<PlannerDayPlanRef> mergeDayPlans(
            PlannerSnapshot latestSnapshot,
            List<PlannerDayPlanRef> draftDayPlans,
            PlannerDayPlanRef currentDayPlan
    ) {
        Map<Integer, PlannerDayPlanRef> mergedByIndex = new LinkedHashMap<>();
        if (latestSnapshot != null && latestSnapshot.getDayPlans() != null) {
            latestSnapshot.getDayPlans().stream()
                    .filter(dayPlan -> dayPlan.getDayIndex() != null)
                    .forEach(dayPlan -> mergedByIndex.put(dayPlan.getDayIndex(), dayPlan));
        }
        if (draftDayPlans != null) {
            draftDayPlans.stream()
                    .filter(dayPlan -> dayPlan.getDayIndex() != null)
                    .forEach(dayPlan -> mergedByIndex.put(dayPlan.getDayIndex(), dayPlan));
        }
        if (currentDayPlan != null && currentDayPlan.getDayIndex() != null) {
            mergedByIndex.put(currentDayPlan.getDayIndex(), currentDayPlan);
        }
        return mergedByIndex.values().stream()
                .sorted(Comparator.comparing(PlannerDayPlanRef::getDayIndex))
                .toList();
    }

    private List<Integer> resolveCompletedDayIndexes(List<PlannerDayPlanRef> dayPlans, PlannerSnapshot latestSnapshot) {
        if (dayPlans == null || dayPlans.isEmpty()) {
            return latestSnapshot == null ? new ArrayList<>() : safeList(latestSnapshot.getCompletedDayIndexes());
        }

        return dayPlans.stream()
                .filter(dayPlan -> "CONFIRMED".equals(dayPlan.getStatus()))
                .map(PlannerDayPlanRef::getDayIndex)
                .filter(dayIndex -> dayIndex != null)
                .sorted()
                .toList();
    }

    private <T> List<T> safeList(List<T> values) {
        return values == null ? new ArrayList<>() : new ArrayList<>(values);
    }
}
