package org.microarchitecturovisco.aiarrangeservice.service;

import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
public class InternalOfferHotelMatcher {

    public Optional<UUID> tryMatch(String city, PlannerPlaceSuggestion suggestion) {
        return Optional.empty();
    }
}
