package org.microarchitecturovisco.reservationservice.domain.dto.responses;

import org.microarchitecturovisco.reservationservice.domain.entity.BookingPersonSnapshot;

public record BookingPersonResponse(
        String travelerId,
        String name,
        String travelerType,
        String documentType,
        String maskedDocumentNumber,
        String maskedPhone
) {
    public static BookingPersonResponse from(BookingPersonSnapshot person) {
        return new BookingPersonResponse(
                person.getTravelerId(),
                person.getName(),
                person.getTravelerType(),
                person.getDocumentType(),
                mask(person.getDocumentNumber(), 4),
                mask(person.getPhone(), 4)
        );
    }

    private static String mask(String value, int visibleSuffixLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.length() <= visibleSuffixLength) {
            return "*".repeat(value.length());
        }
        return "*".repeat(value.length() - visibleSuffixLength) + value.substring(value.length() - visibleSuffixLength);
    }
}
