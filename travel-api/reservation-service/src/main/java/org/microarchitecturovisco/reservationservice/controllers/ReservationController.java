package org.microarchitecturovisco.reservationservice.controllers;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.commands.DeleteReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.commands.UpdateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateHotelOnlyReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateTicketReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CancelReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.ReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.UpdateReservationPaymentStatus;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.PaymentTransactionResponse;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.RefundRecordResponse;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.ReservationResponse;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;
import org.microarchitecturovisco.reservationservice.domain.exceptions.ReservationFailException;
import org.microarchitecturovisco.reservationservice.domain.model.PurchaseRequestBody;
import org.microarchitecturovisco.reservationservice.domain.model.ReservationConfirmationResponse;
import org.microarchitecturovisco.reservationservice.services.ReservationAggregate;
import org.microarchitecturovisco.reservationservice.services.ReservationAuthorizationService;
import org.microarchitecturovisco.reservationservice.services.ReservationService;
import org.microarchitecturovisco.reservationservice.utils.json.JsonReader;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import java.util.logging.Logger;

@RestController
@RequiredArgsConstructor
@RequestMapping("/reservations")
public class ReservationController {

    private final ReservationService reservationService;
    private final ReservationAggregate reservationAggregate;
    private final ReservationAuthorizationService authorizationService;
    public static Logger logger = Logger.getLogger(ReservationController.class.getName());

    @GetMapping("/user/{userId}")
    public List<ReservationResponse> getReservationsForUser(
            @PathVariable UUID userId,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        authorizationService.requireOwnerOrAdmin(token, userId);
        return reservationService.getReservationsForUser(userId);
    }

    @GetMapping("/{reservationId}")
    public ReservationResponse getReservation(
            @PathVariable UUID reservationId,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        authorizationService.requireReservationOwnerOrAdmin(token, reservationId);
        return reservationService.getReservation(reservationId);
    }

    @PostMapping("/{reservationId}/cancel")
    public ReservationResponse cancelReservation(
            @PathVariable UUID reservationId,
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @Valid @RequestBody(required = false) CancelReservationRequest request
    ) {
        authorizationService.requireReservationOwnerOrAdmin(token, reservationId);
        return reservationService.cancelReservation(reservationId, request == null ? null : request.reason());
    }

    @GetMapping("/{reservationId}/payments")
    public List<PaymentTransactionResponse> getPaymentTransactions(
            @PathVariable UUID reservationId,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        authorizationService.requireReservationOwnerOrAdmin(token, reservationId);
        return reservationService.getPaymentTransactions(reservationId);
    }

    @GetMapping("/{reservationId}/refunds")
    public List<RefundRecordResponse> getRefundRecords(
            @PathVariable UUID reservationId,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        authorizationService.requireReservationOwnerOrAdmin(token, reservationId);
        return reservationService.getRefundRecords(reservationId);
    }

    @PostMapping("/{reservationId}/refunds/complete")
    public ReservationResponse completeRefund(
            @PathVariable UUID reservationId,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        authorizationService.requireAdmin(token);
        return reservationService.completeRefund(reservationId);
    }

    @PostMapping("/tickets")
    public ReservationResponse createTicketReservation(@Valid @RequestBody CreateTicketReservationRequest request) {
        return reservationService.createTicketReservation(request);
    }

    @PostMapping("/hotels")
    public ReservationResponse createHotelOnlyReservation(@Valid @RequestBody CreateHotelOnlyReservationRequest request) {
        return reservationService.createHotelOnlyReservation(request);
    }

    @PostMapping("/reservation")
    public String addReservation(@Valid @RequestBody ReservationRequest reservationRequest) {
        logger.info("Legacy tour product reservation shell requested; old package booking is disabled");
        return "Tour product reservation is being rebuilt";
    }

    @PostMapping("/purchase")
    public ReservationConfirmationResponse purchase(@RequestBody PurchaseRequestBody requestBody) {
        return reservationService.purchaseReservation(requestBody.getReservationId(), requestBody.getCardNumber());
    }

    @RabbitListener(queues = "#{handleReservationCreateQueue.name}")
    public void consumeMessageCreateReservation(String reservationRequestJson) {

        ReservationRequest reservationRequest = JsonReader.readDtoFromJson(reservationRequestJson, ReservationRequest.class);

        Reservation reservation = reservationService.createReservation(
                reservationRequest.getHotelTimeFrom(),
                reservationRequest.getHotelTimeTo(),
                reservationRequest.getChildrenUnder3Quantity(),
                reservationRequest.getChildrenUnder10Quantity(),
                reservationRequest.getChildrenUnder18Quantity(),
                reservationRequest.getAdultsQuantity(),
                reservationRequest.getPrice(),
                reservationRequest.getHotelId(),
                reservationRequest.getRoomReservationsIds(),
                reservationRequest.getTransportReservationsIds(),
                reservationRequest.getUserId(),
                reservationRequest.getId()
        );
        logger.info("Reservation in Reservation module created successfully: " + reservation.getId());
    }
    
    @RabbitListener(queues = "#{handleReservationDeleteQueue.name}")
    public void consumeMessageDeleteReservation(String reservationRequestJson) {

        ReservationRequest reservationRequest = JsonReader.readDtoFromJson(reservationRequestJson, ReservationRequest.class);

        deleteReservation(
                reservationRequest.getHotelTimeFrom(),
                reservationRequest.getHotelTimeTo(),
                reservationRequest.getChildrenUnder3Quantity(),
                reservationRequest.getChildrenUnder10Quantity(),
                reservationRequest.getChildrenUnder18Quantity(),
                reservationRequest.getAdultsQuantity(),
                reservationRequest.getPrice(),
                reservationRequest.getHotelId(),
                reservationRequest.getRoomReservationsIds(),
                reservationRequest.getTransportReservationsIds(),
                reservationRequest.getUserId(),
                reservationRequest.getId()
        );

        logger.info("Reservation in Reservation module deleted successfully");
    }

    private void deleteReservation(LocalDateTime hotelTimeFrom, LocalDateTime hotelTimeTo,
                                   int infantsQuantity, int kidsQuantity, int teensQuantity, int adultsQuantity,
                                   BigDecimal price, Integer hotelId, List<Long> roomReservationsIds,
                                   List<UUID> transportReservationsIds, UUID userId, UUID reservationId) {

        DeleteReservationCommand command = DeleteReservationCommand.builder()
                .id(reservationId)
                .hotelTimeFrom(hotelTimeFrom)
                .hotelTimeTo(hotelTimeTo)
                .infantsQuantity(infantsQuantity)
                .kidsQuantity(kidsQuantity)
                .teensQuantity(teensQuantity)
                .adultsQuantity(adultsQuantity)
                .price(price)
                .paid(false)
                .hotelId(hotelId)
                .roomReservationsIds(roomReservationsIds)
                .transportReservationsIds(transportReservationsIds)
                .userId(userId)
                .build();
        reservationAggregate.handleDeleteReservationCommand(command);
    }


    @RabbitListener(queues = "#{handleReservationUpdateQueue.name}")
    public void consumeMessageUpdateReservationPaymentStatus(String reservationPaymentStatusJson) {
        UpdateReservationPaymentStatus reservationPaymentStatus = JsonReader.readDtoFromJson(reservationPaymentStatusJson, UpdateReservationPaymentStatus.class);
        UUID reservationId = reservationPaymentStatus.getReservationId();

        reservationAggregate.handleReservationUpdateCommand(UpdateReservationCommand.builder()
                .reservationId(reservationId)
                .paid(true)
                .status(ReservationStatus.PAID)
                .build());

        logger.info("Reservation in Reservation module updated successfully");
    }

}
