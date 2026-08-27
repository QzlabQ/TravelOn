package org.microarchitecturovisco.reservationservice.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.repositories.ReservationRepository;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isA;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReservationAuthorizationServiceTest {

    private static final UUID OWNER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID OTHER_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID RESERVATION_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");

    @Mock
    private RestTemplate restTemplate;

    @Mock
    private ReservationRepository reservationRepository;

    private ReservationAuthorizationService authorizationService;

    @BeforeEach
    void setUp() {
        authorizationService = new ReservationAuthorizationService(restTemplate, reservationRepository);
    }

    @Test
    void missingTokenIsUnauthorizedBeforeLookingUpReservation() {
        assertStatus(401, () -> authorizationService.requireReservationOwnerOrAdmin(null, RESERVATION_ID));
    }

    @Test
    void ownerCanAccessReservation() {
        mockUser(OWNER_ID, "USER");
        mockReservationOwner(OWNER_ID);

        assertThatCode(() -> authorizationService.requireReservationOwnerOrAdmin("owner-token", RESERVATION_ID))
                .doesNotThrowAnyException();
    }

    @Test
    void anotherUserCannotAccessReservation() {
        mockUser(OTHER_ID, "USER");
        mockReservationOwner(OWNER_ID);

        assertStatus(403, () -> authorizationService.requireReservationOwnerOrAdmin("other-token", RESERVATION_ID));
    }

    @Test
    void adminCanAccessAnotherUsersReservationAndCompleteRefunds() {
        mockUser(OTHER_ID, "ADMIN");
        mockReservationOwner(OWNER_ID);

        assertThatCode(() -> authorizationService.requireReservationOwnerOrAdmin("admin-token", RESERVATION_ID))
                .doesNotThrowAnyException();
        assertThatCode(() -> authorizationService.requireAdmin("admin-token"))
                .doesNotThrowAnyException();
    }

    @Test
    void ordinaryUserCannotCompleteRefunds() {
        mockUser(OWNER_ID, "USER");

        assertStatus(403, () -> authorizationService.requireAdmin("owner-token"));
    }

    @Test
    void rejectedTokenIsUnauthorized() {
        when(restTemplate.exchange(
                eq("http://user-service/users/me"),
                eq(HttpMethod.GET),
                isA(HttpEntity.class),
                eq(Map.class)
        )).thenThrow(HttpClientErrorException.create(HttpStatus.UNAUTHORIZED, "Unauthorized", null, null, null));

        assertStatus(401, () -> authorizationService.requireAdmin("bad-token"));
    }

    @Test
    void userServiceFailureReturnsServiceUnavailable() {
        when(restTemplate.exchange(
                eq("http://user-service/users/me"),
                eq(HttpMethod.GET),
                isA(HttpEntity.class),
                eq(Map.class)
        )).thenThrow(new ResourceAccessException("connection failed"));

        assertStatus(503, () -> authorizationService.requireAdmin("owner-token"));
    }

    private void mockUser(UUID userId, String role) {
        when(restTemplate.exchange(
                eq("http://user-service/users/me"),
                eq(HttpMethod.GET),
                isA(HttpEntity.class),
                eq(Map.class)
        )).thenReturn(ResponseEntity.ok(Map.of("id", userId.toString(), "role", role)));
    }

    private void mockReservationOwner(UUID ownerId) {
        when(reservationRepository.findById(RESERVATION_ID))
                .thenReturn(Optional.of(Reservation.builder().id(RESERVATION_ID).userId(ownerId).build()));
    }

    private void assertStatus(int expectedStatus, Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        exception -> assertThat(exception.getStatusCode().value()).isEqualTo(expectedStatus));
    }
}
