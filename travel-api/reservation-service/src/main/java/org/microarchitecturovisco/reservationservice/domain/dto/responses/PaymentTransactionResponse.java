package org.microarchitecturovisco.reservationservice.domain.dto.responses;

import org.microarchitecturovisco.reservationservice.domain.entity.PaymentTransaction;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

public record PaymentTransactionResponse(
        UUID id,
        UUID reservationId,
        float amount,
        String cardLast4,
        boolean approved,
        String status,
        String failureReason,
        String createdAt
) {
    private static final ZoneId RESPONSE_ZONE = ZoneId.systemDefault();

    public static PaymentTransactionResponse from(PaymentTransaction transaction) {
        return new PaymentTransactionResponse(
                transaction.getId(),
                transaction.getReservationId(),
                transaction.getAmount(),
                transaction.getCardLast4(),
                transaction.isApproved(),
                transaction.getStatus(),
                transaction.getFailureReason(),
                format(transaction.getCreatedAt())
        );
    }

    private static String format(LocalDateTime value) {
        return value == null ? null : value.atZone(RESPONSE_ZONE).toOffsetDateTime().toString();
    }
}
