package org.microarchitecturovisco.reservationservice.domain.dto.responses;

import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;

import java.util.List;
import java.util.UUID;

public record ReservationResponse(
        UUID id,
        String hotelTimeFrom,
        String hotelTimeTo,
        int adultsQuantity,
        int childrenUnder3Quantity,
        int childrenUnder10Quantity,
        int childrenUnder18Quantity,
        float price,
        boolean paid,
        ReservationStatus status,
        String bookingType,
        UUID hotelId,
        List<UUID> roomReservationsIds,
        List<UUID> transportReservationsIds,
        UUID userId,
        String title,
        String routeFrom,
        String routeTo,
        String provider,
        String bookingCode
) {
    public static ReservationResponse from(Reservation reservation) {
        return new ReservationResponse(
                reservation.getId(),
                reservation.getHotelTimeFrom() == null ? null : reservation.getHotelTimeFrom().toString(),
                reservation.getHotelTimeTo() == null ? null : reservation.getHotelTimeTo().toString(),
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
                reservation.getRouteFrom(),
                reservation.getRouteTo(),
                reservation.getProvider(),
                reservation.getBookingCode()
        );
    }
}
