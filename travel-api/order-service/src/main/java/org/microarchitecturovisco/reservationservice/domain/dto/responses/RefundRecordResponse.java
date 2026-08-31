package org.microarchitecturovisco.reservationservice.domain.dto.responses;

import org.microarchitecturovisco.reservationservice.domain.entity.RefundRecord;
import org.microarchitecturovisco.reservationservice.domain.entity.RefundStatus;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.math.BigDecimal;

public record RefundRecordResponse(
        UUID id,
        UUID reservationId,
        BigDecimal amount,
        String reason,
        RefundStatus status,
        String requestedAt,
        String completedAt
) {
    private static final ZoneId RESPONSE_ZONE = ZoneId.systemDefault();

    public static RefundRecordResponse from(RefundRecord refund) {
        return new RefundRecordResponse(
                refund.getId(),
                refund.getReservationId(),
                refund.getAmount(),
                refund.getReason(),
                refund.getStatus(),
                format(refund.getRequestedAt()),
                format(refund.getCompletedAt())
        );
    }

    private static String format(LocalDateTime value) {
        return value == null ? null : value.atZone(RESPONSE_ZONE).toOffsetDateTime().toString();
    }
}
