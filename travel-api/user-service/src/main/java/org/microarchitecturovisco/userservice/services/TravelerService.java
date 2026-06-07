package org.microarchitecturovisco.userservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.userservice.domain.Traveler;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.dto.TravelerRequest;
import org.microarchitecturovisco.userservice.dto.TravelerResponse;
import org.microarchitecturovisco.userservice.repositories.TravelerRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TravelerService {

    private final UserService userService;
    private final TravelerRepository travelerRepository;

    public List<TravelerResponse> list(String token) {
        User user = userService.requireUserByToken(token);
        return travelerRepository.findByUserIdOrderByDefaultTravelerDescNameAsc(user.getId()).stream()
                .map(TravelerResponse::from)
                .toList();
    }

    public TravelerResponse create(String token, TravelerRequest request) {
        User user = userService.requireUserByToken(token);
        Traveler traveler = Traveler.builder()
                .id(UUID.randomUUID())
                .userId(user.getId())
                .build();
        applyRequest(traveler, request);
        return TravelerResponse.from(travelerRepository.save(traveler));
    }

    public TravelerResponse update(String token, UUID travelerId, TravelerRequest request) {
        User user = userService.requireUserByToken(token);
        Traveler traveler = requireTraveler(travelerId, user.getId());
        applyRequest(traveler, request);
        return TravelerResponse.from(travelerRepository.save(traveler));
    }

    public void delete(String token, UUID travelerId) {
        User user = userService.requireUserByToken(token);
        travelerRepository.delete(requireTraveler(travelerId, user.getId()));
    }

    private void applyRequest(Traveler traveler, TravelerRequest request) {
        traveler.setName(request.name().trim());
        traveler.setTravelerType(normalizeTravelerType(request.travelerType()));
        traveler.setDocumentType(normalizeOptional(request.documentType()));
        traveler.setDocumentNumber(normalizeOptional(request.documentNumber()));
        traveler.setPhone(normalizeOptional(request.phone()));
        traveler.setStudent(request.student());
        traveler.setDefaultTraveler(request.defaultTraveler());

        if (request.defaultTraveler()) {
            travelerRepository.findByUserIdAndDefaultTravelerTrue(traveler.getUserId()).stream()
                    .filter(existing -> !existing.getId().equals(traveler.getId()))
                    .forEach(existing -> {
                        existing.setDefaultTraveler(false);
                        travelerRepository.save(existing);
                    });
        }
    }

    private Traveler requireTraveler(UUID travelerId, UUID userId) {
        return travelerRepository.findByIdAndUserId(travelerId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Traveler not found"));
    }

    private String normalizeTravelerType(String value) {
        String normalized = value.trim().toUpperCase();
        if (!List.of("ADULT", "CHILD", "STUDENT").contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported traveler type");
        }
        return normalized;
    }

    private String normalizeOptional(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
