package org.microarchitecturovisco.reservationservice.services;

import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateHotelOnlyReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateTicketReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.PaymentTransactionResponse;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.RefundRecordResponse;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.ReservationResponse;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.model.ReservationConfirmationResponse;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ReservationOperations {

    Reservation createReservation(LocalDateTime hotelTimeFrom, LocalDateTime hotelTimeTo,
                                  int infantsQuantity, int kidsQuantity, int teensQuantity, int adultsQuantity,
                                  BigDecimal price, Integer hotelId, List<Long> roomReservationsIds,
                                  List<UUID> transportReservationsIds, UUID userId, UUID reservationId);

    List<ReservationResponse> getReservationsForUser(UUID userId);

    ReservationResponse getReservation(UUID reservationId);

    ReservationResponse cancelReservation(UUID reservationId, String reason);

    ReservationResponse createTicketReservation(CreateTicketReservationRequest request, UUID userId);

    ReservationResponse createHotelOnlyReservation(CreateHotelOnlyReservationRequest request, UUID userId);

    ReservationConfirmationResponse purchaseReservation(String reservationId, String cardNumber);

    List<PaymentTransactionResponse> getPaymentTransactions(UUID reservationId);

    List<RefundRecordResponse> getRefundRecords(UUID reservationId);

    ReservationResponse completeRefund(UUID reservationId);
}
