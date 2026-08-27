package org.microarchitecturovisco.reservationservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.repositories.ReservationRepository;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ReservationAuthorizationService {

    private final RestTemplate restTemplate;
    private final ReservationRepository reservationRepository;

    public void requireReservationOwnerOrAdmin(String token, UUID reservationId) {
        AuthenticatedUser user = requireUser(token);
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
        requireOwnerOrAdmin(user, reservation.getUserId());
    }

    public void requireOwnerOrAdmin(String token, UUID ownerUserId) {
        requireOwnerOrAdmin(requireUser(token), ownerUserId);
    }

    private void requireOwnerOrAdmin(AuthenticatedUser user, UUID ownerUserId) {
        if (!user.admin() && !user.id().equals(ownerUserId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Reservation belongs to another user");
        }
    }

    public void requireAdmin(String token) {
        if (!requireUser(token).admin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin account required");
        }
    }

    private AuthenticatedUser requireUser(String token) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing session token");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-User-Token", token);

        try {
            Map<?, ?> body = restTemplate.exchange(
                    "http://user-service/users/me",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class
            ).getBody();
            if (body == null || body.get("id") == null) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid session token");
            }
            return new AuthenticatedUser(
                    UUID.fromString(String.valueOf(body.get("id"))),
                    "ADMIN".equalsIgnoreCase(String.valueOf(body.get("role")))
            );
        } catch (HttpClientErrorException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid session token");
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user profile");
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "User service unavailable");
        }
    }

    private record AuthenticatedUser(UUID id, boolean admin) {
    }
}
