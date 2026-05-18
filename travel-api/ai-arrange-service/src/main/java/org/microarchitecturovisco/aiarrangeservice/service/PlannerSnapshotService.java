package org.microarchitecturovisco.aiarrangeservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.client.AiChatMessage;
import org.microarchitecturovisco.aiarrangeservice.client.PlannerAiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerMessageRepository;
import org.microarchitecturovisco.aiarrangeservice.repository.PlannerSnapshotRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
                    .summary(from.getName() + " -> " + to.getName())
                    .build());
        }

        return routes;
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
}
