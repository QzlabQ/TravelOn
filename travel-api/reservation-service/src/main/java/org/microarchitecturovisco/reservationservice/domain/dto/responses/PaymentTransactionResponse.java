package org.microarchitecturovisco.reservationservice.domain.dto.responses;

import org.microarchitecturovisco.reservationservice.domain.entity.PaymentTransaction;

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
    public static PaymentTransactionResponse from(PaymentTransaction transaction) {
        return new PaymentTransactionResponse(
                transaction.getId(),
                transaction.getReservationId(),
                transaction.getAmount(),
                transaction.getCardLast4(),
                transaction.isApproved(),
                transaction.getStatus(),
                transaction.getFailureReason(),
                transaction.getCreatedAt() == null ? null : transaction.getCreatedAt().toString()
        );
    }
}
