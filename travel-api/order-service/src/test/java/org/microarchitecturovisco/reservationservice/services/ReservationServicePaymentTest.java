package org.microarchitecturovisco.reservationservice.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.microarchitecturovisco.reservationservice.domain.entity.PaymentTransaction;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;
import org.microarchitecturovisco.reservationservice.domain.exceptions.PurchaseFailedException;
import org.microarchitecturovisco.reservationservice.domain.model.ReservationConfirmationResponse;
import org.microarchitecturovisco.reservationservice.payment.PaymentService;
import org.microarchitecturovisco.reservationservice.repositories.PaymentTransactionRepository;
import org.microarchitecturovisco.reservationservice.repositories.RefundRecordRepository;
import org.microarchitecturovisco.reservationservice.repositories.ReservationRepository;
import org.microarchitecturovisco.reservationservice.services.saga.BookHotelsSaga;
import org.microarchitecturovisco.reservationservice.services.saga.BookTransportsSaga;
import org.microarchitecturovisco.reservationservice.services.saga.InvalidPaymentHandler;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReservationServicePaymentTest {

    private static final UUID RESERVATION_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final String VALID_CARD = "6222021234567894";

    private final ReservationRepository reservationRepository = mock(ReservationRepository.class);
    private final PaymentTransactionRepository paymentTransactionRepository = mock(PaymentTransactionRepository.class);
    private final RefundRecordRepository refundRecordRepository = mock(RefundRecordRepository.class);
    private final ReservationAggregate reservationAggregate = mock(ReservationAggregate.class);
    private final BookHotelsSaga bookHotelsSaga = mock(BookHotelsSaga.class);
    private final BookTransportsSaga bookTransportsSaga = mock(BookTransportsSaga.class);
    private final RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
    private final InvalidPaymentHandler invalidPaymentHandler = mock(InvalidPaymentHandler.class);

    private ReservationService reservationService;
    private Reservation reservation;

    @BeforeEach
    void setUp() {
        reservationService = new ReservationService(
                reservationRepository,
                paymentTransactionRepository,
                refundRecordRepository,
                reservationAggregate,
                new PaymentService(),
                bookHotelsSaga,
                bookTransportsSaga,
                rabbitTemplate,
                invalidPaymentHandler
        );
        reservation = pendingPackageReservation();
        when(reservationRepository.findById(RESERVATION_ID)).thenReturn(Optional.of(reservation));
    }

    @Test
    void validPaymentIsProcessedLocallyAndRecorded() {
        ReservationConfirmationResponse confirmation = reservationService.purchaseReservation(
                RESERVATION_ID.toString(), VALID_CARD);

        assertThat(confirmation.getPrice()).isEqualByComparingTo("1200.00");
        ArgumentCaptor<PaymentTransaction> transaction = ArgumentCaptor.forClass(PaymentTransaction.class);
        verify(paymentTransactionRepository).save(transaction.capture());
        assertThat(transaction.getValue().isApproved()).isTrue();
        assertThat(transaction.getValue().getCardLast4()).isEqualTo("7894");
        verify(invalidPaymentHandler, never()).rollbackReservation(any());
    }

    @Test
    void rejectedPaymentStillRunsPackageCompensationAndRecordsFailure() {
        assertThatThrownBy(() -> reservationService.purchaseReservation(
                RESERVATION_ID.toString(), "4111111111111111"))
                .isInstanceOf(PurchaseFailedException.class)
                .hasMessage("支付未通过，请检查银联卡号或换用其他支付方式。");

        verify(invalidPaymentHandler).rollbackReservation(any());
        ArgumentCaptor<PaymentTransaction> transaction = ArgumentCaptor.forClass(PaymentTransaction.class);
        verify(paymentTransactionRepository).save(transaction.capture());
        assertThat(transaction.getValue().isApproved()).isFalse();
        assertThat(transaction.getValue().getFailureReason()).isEqualTo("Transaction was not approved");
    }

    private Reservation pendingPackageReservation() {
        return Reservation.builder()
                .id(RESERVATION_ID)
                .hotelTimeFrom(LocalDateTime.now().plusDays(3))
                .hotelTimeTo(LocalDateTime.now().plusDays(5))
                .adultsQuantity(2)
                .price(new BigDecimal("1200.00"))
                .paid(false)
                .status(ReservationStatus.PENDING_PAYMENT)
                .bookingType("PACKAGE")
                .hotelId(42)
                .roomReservationsIds(List.of(7L))
                .transportReservationsIds(List.of(UUID.fromString("22222222-2222-2222-2222-222222222222")))
                .userId(UUID.fromString("33333333-3333-3333-3333-333333333333"))
                .title("测试套餐")
                .paymentDeadline(LocalDateTime.now().plusMinutes(30))
                .build();
    }
}
