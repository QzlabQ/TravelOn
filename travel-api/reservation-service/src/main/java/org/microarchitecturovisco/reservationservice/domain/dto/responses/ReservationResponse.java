package org.microarchitecturovisco.reservationservice.domain.dto.responses;

import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;

public record ReservationResponse(
        UUID id,
        String hotelTimeFrom,
        String hotelTimeTo,
        int adultsQuantity,
        int childrenUnder3Quantity,
        int childrenUnder10Quantity,
        int childrenUnder18Quantity,
        BigDecimal price,
        boolean paid,
        ReservationStatus status,
        String bookingType,
        Integer hotelId,
        List<Long> roomReservationsIds,
        List<UUID> transportReservationsIds,
        UUID userId,
        String title,
        String provider,
        String bookingCode,
        List<BookingPersonResponse> travelers,
        String createdAt,
        String paymentDeadline,
        String paidAt,
        String cancelledAt,
        String refundRequestedAt,
        String refundedAt,
        String cancellationReason
) {
    private static final ZoneId RESPONSE_ZONE = ZoneId.systemDefault();

    public static ReservationResponse from(Reservation reservation) {
        return new ReservationResponse(
                reservation.getId(),
                format(reservation.getHotelTimeFrom()),
                format(reservation.getHotelTimeTo()),
                reservation.getAdultsQuantity(),
                reservation.getChildrenUnder3Quantity(),
                reservation.getChildrenUnder10Quantity(),
                reservation.getChildrenUnder18Quantity(),
                reservation.getPrice(),
                reservation.isPaid(),
                reservation.getStatus(),
                reservation.getBookingType(),
                reservation.getHotelId(),
                reservation.getRoomReservationsIds(),
                reservation.getTransportReservationsIds(),
                reservation.getUserId(),
                reservation.getTitle(),
                reservation.getProvider(),
                reservation.getBookingCode(),
                reservation.getTravelers() == null ? List.of() : reservation.getTravelers().stream().map(BookingPersonResponse::from).toList(),
                format(reservation.getCreatedAt()),
                format(reservation.getPaymentDeadline()),
                format(reservation.getPaidAt()),
                format(reservation.getCancelledAt()),
                format(reservation.getRefundRequestedAt()),
                format(reservation.getRefundedAt()),
                reservation.getCancellationReason()
        );
    }

    private static String format(LocalDateTime value) {
        return value == null ? null : value.atZone(RESPONSE_ZONE).toOffsetDateTime().toString();
    }
}
