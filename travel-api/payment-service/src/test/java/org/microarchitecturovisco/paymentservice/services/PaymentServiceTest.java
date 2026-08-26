package org.microarchitecturovisco.paymentservice.services;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.paymentservice.models.dto.HandlePaymentRequestDto;

import static org.assertj.core.api.Assertions.assertThat;

class PaymentServiceTest {
    private final PaymentService service = new PaymentService();

    @Test
    void approvesValidUnionPayLuhnCardAndPreservesReservationId() {
        var response = service.verifyTransaction(HandlePaymentRequestDto.builder()
                .idReservation("reservation-1").cardNumber("6222021234567894").build());

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

    private HandlePaymentRequestDto request(String cardNumber) {
        return HandlePaymentRequestDto.builder().idReservation("reservation-2").cardNumber(cardNumber).build();
    }
}
