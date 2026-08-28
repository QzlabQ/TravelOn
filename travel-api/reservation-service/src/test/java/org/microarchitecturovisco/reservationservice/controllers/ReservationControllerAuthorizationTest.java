package org.microarchitecturovisco.reservationservice.controllers;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.reservationservice.services.ReservationCommandOperations;
import org.microarchitecturovisco.reservationservice.services.ReservationAuthorizationOperations;
import org.microarchitecturovisco.reservationservice.services.ReservationOperations;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class ReservationControllerAuthorizationTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID RESERVATION_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");
    private static final String TOKEN = "session-token";

    private final ReservationOperations reservationService = mock(ReservationOperations.class);
    private final ReservationAuthorizationOperations authorizationService = mock(ReservationAuthorizationOperations.class);
    private final ReservationController controller = new ReservationController(
            reservationService,
            mock(ReservationCommandOperations.class),
            authorizationService
    );

    @Test
    void userReservationListRequiresOwnerOrAdmin() {
        controller.getReservationsForUser(USER_ID, TOKEN);

        verify(authorizationService).requireOwnerOrAdmin(TOKEN, USER_ID);
    }

    @Test
    void reservationReadsAndCancellationRequireReservationOwnerOrAdmin() {
        controller.getReservation(RESERVATION_ID, TOKEN);
        controller.getPaymentTransactions(RESERVATION_ID, TOKEN);
        controller.getRefundRecords(RESERVATION_ID, TOKEN);
        controller.cancelReservation(RESERVATION_ID, TOKEN, null);

        verify(authorizationService, times(4)).requireReservationOwnerOrAdmin(TOKEN, RESERVATION_ID);
    }

    @Test
    void completingRefundRequiresAdmin() {
        controller.completeRefund(RESERVATION_ID, TOKEN);

        verify(authorizationService).requireAdmin(TOKEN);
    }
}
