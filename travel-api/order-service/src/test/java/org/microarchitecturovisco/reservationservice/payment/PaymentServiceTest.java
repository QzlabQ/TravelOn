package org.microarchitecturovisco.reservationservice.payment;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.reservationservice.domain.dto.PaymentRequestDto;

import static org.assertj.core.api.Assertions.assertThat;

class PaymentServiceTest {
    private final PaymentService service = new PaymentService();

    @Test
    void approvesValidUnionPayLuhnCardAndPreservesReservationId() {
        var response = service.verifyTransaction(PaymentRequestDto.builder()
                .idReservation("reservation-1")
                .cardNumber("6222021234567894")
                .build());

        assertThat(response.isTransactionApproved()).isTrue();
        assertThat(response.getReservationId()).isEqualTo("reservation-1");
    }

    @Test
    void rejectsMalformedNonUnionPayAndInvalidLuhnCards() {
        assertThat(service.verifyTransaction(request("1234")).isTransactionApproved()).isFalse();
        assertThat(service.verifyTransaction(request("4111111111111111")).isTransactionApproved()).isFalse();
        assertThat(service.verifyTransaction(request("6222021234567891")).isTransactionApproved()).isFalse();
        assertThat(service.verifyTransaction(request(null)).isTransactionApproved()).isFalse();
    }

    private PaymentRequestDto request(String cardNumber) {
        return PaymentRequestDto.builder()
                .idReservation("reservation-2")
                .cardNumber(cardNumber)
                .build();
    }
}
