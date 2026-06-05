package org.microarchitecturovisco.reservationservice.domain.dto.responses;

import org.microarchitecturovisco.reservationservice.domain.entity.RefundRecord;
import org.microarchitecturovisco.reservationservice.domain.entity.RefundStatus;

import java.util.UUID;

public record RefundRecordResponse(
        UUID id,
        UUID reservationId,
        float amount,
        String reason,
        RefundStatus status,
        String requestedAt,
        String completedAt
) {
    public static RefundRecordResponse from(RefundRecord refund) {
        return new RefundRecordResponse(
                refund.getId(),
                refund.getReservationId(),
                refund.getAmount(),
                refund.getReason(),
                refund.getStatus(),
                refund.getRequestedAt() == null ? null : refund.getRequestedAt().toString(),
                refund.getCompletedAt() == null ? null : refund.getCompletedAt().toString()
        );
    }
}
