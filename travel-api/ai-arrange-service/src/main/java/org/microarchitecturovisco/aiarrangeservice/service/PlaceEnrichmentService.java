package org.microarchitecturovisco.aiarrangeservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.client.AmapPoiClient;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceSource;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceType;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class PlaceEnrichmentService {

    private final AmapPoiClient amapPoiClient;
    private final InternalOfferHotelMatcher internalOfferHotelMatcher;

    public List<PlannerPlaceSuggestion> enrichPlaces(PlannerConversation conversation, List<PlannerPlaceSuggestion> rawPlaces) {
        List<PlannerPlaceSuggestion> enriched = new ArrayList<>();
        Set<UUID> selectedIds = new HashSet<>(conversation.getSelectedPlaceIds() == null ? List.of() : conversation.getSelectedPlaceIds());

        if (rawPlaces == null || rawPlaces.isEmpty()) {
            return enriched;
        }

        for (PlannerPlaceSuggestion place : rawPlaces) {
            if (place.getPlaceId() == null) {
                place.setPlaceId(UUID.randomUUID());
            }
            place.setSelected(selectedIds.contains(place.getPlaceId()));

            if (place.getType() == PlannerPlaceType.HOTEL && StringUtils.hasText(place.getName())) {
                internalOfferHotelMatcher.tryMatch(conversation.getCoreSlots().getCity(), place).ifPresent(match -> {
                    place.setSource(PlannerPlaceSource.INTERNAL_OFFER);
                    place.setInternalOfferId(match);
                });
            }

            if ((place.getLatitude() == null || place.getLongitude() == null) && StringUtils.hasText(conversation.getCoreSlots().getCity())) {
                amapPoiClient.searchFirst(conversation.getCoreSlots().getCity(), place);
            }

            enriched.add(place);
        }

        return enriched;
    }

    public List<PlannerPlaceSuggestion> syncSelectedFlags(List<PlannerPlaceSuggestion> places, List<UUID> selectedPlaceIds) {
        if (places == null || places.isEmpty()) {
            return new ArrayList<>();
        }
        Set<UUID> selected = new HashSet<>(selectedPlaceIds);
        return places.stream()
                .peek(place -> place.setSelected(selected.contains(place.getPlaceId())))
                .collect(Collectors.toList());
    }
}
