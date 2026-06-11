package org.microarchitecturovisco.reservationservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.commands.CreateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.commands.UpdateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.dto.PaymentRequestDto;
import org.microarchitecturovisco.reservationservice.domain.dto.PaymentResponseDto;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateHotelOnlyReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateTicketReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.BookingPersonRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.ReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.UpdateReservationPaymentStatus;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.PaymentTransactionResponse;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.RefundRecordResponse;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.ReservationResponse;
import org.microarchitecturovisco.reservationservice.domain.entity.PaymentTransaction;
import org.microarchitecturovisco.reservationservice.domain.entity.RefundRecord;
import org.microarchitecturovisco.reservationservice.domain.entity.RefundStatus;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;
import org.microarchitecturovisco.reservationservice.domain.entity.BookingPersonSnapshot;
import org.microarchitecturovisco.reservationservice.domain.exceptions.PaymentProcessException;
import org.microarchitecturovisco.reservationservice.domain.exceptions.PurchaseFailedException;
import org.microarchitecturovisco.reservationservice.domain.exceptions.ReservationFailException;
import org.microarchitecturovisco.reservationservice.domain.exceptions.ReservationNotFoundAfterPaymentException;
import org.microarchitecturovisco.reservationservice.domain.model.LocationReservationResponse;
import org.microarchitecturovisco.reservationservice.domain.model.ReservationConfirmationResponse;
import org.microarchitecturovisco.reservationservice.domain.model.TransportReservationResponse;
import org.microarchitecturovisco.reservationservice.queues.config.QueuesReservationConfig;
import org.microarchitecturovisco.reservationservice.repositories.ReservationRepository;
import org.microarchitecturovisco.reservationservice.repositories.PaymentTransactionRepository;
import org.microarchitecturovisco.reservationservice.repositories.RefundRecordRepository;
import org.microarchitecturovisco.reservationservice.services.saga.BookHotelsSaga;
import org.microarchitecturovisco.reservationservice.services.saga.BookTransportsSaga;
import org.microarchitecturovisco.reservationservice.services.saga.InvalidPaymentHandler;
import org.microarchitecturovisco.reservationservice.utils.json.JsonConverter;
import org.microarchitecturovisco.reservationservice.utils.json.JsonReader;
import org.microarchitecturovisco.reservationservice.websockets.ReservationWebSocketHandler;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class ReservationService {

    private static final org.slf4j.Logger log = LoggerFactory.getLogger(ReservationService.class);

    public static Logger logger = Logger.getLogger(ReservationService.class.getName());

    private final ReservationRepository reservationRepository;
    private final PaymentTransactionRepository paymentTransactionRepository;
    private final RefundRecordRepository refundRecordRepository;
    private final ReservationAggregate reservationAggregate;

    private final BookHotelsSaga bookHotelsSaga;
    private final BookTransportsSaga bookTransportsSaga;

    private final RabbitTemplate rabbitTemplate;

    private final ReservationWebSocketHandler reservationWebSocketHandler;

    private final InvalidPaymentHandler invalidPaymentHandler;

    public Reservation createReservation(LocalDateTime hotelTimeFrom, LocalDateTime hotelTimeTo,
                                                      int infantsQuantity, int kidsQuantity, int teensQuantity, int adultsQuantity,
                                                      float price, Integer hotelId, List<Long> roomReservationsIds,
                                                      List<UUID> transportReservationsIds, UUID userId, UUID reservationId) {

        CreateReservationCommand command = CreateReservationCommand.builder()
                .id(reservationId)
                .hotelTimeFrom(hotelTimeFrom)
                .hotelTimeTo(hotelTimeTo)
                .infantsQuantity(infantsQuantity)
                .kidsQuantity(kidsQuantity)
                .teensQuantity(teensQuantity)
                .adultsQuantity(adultsQuantity)
                .price(price)
                .paid(false)
                .status(ReservationStatus.PENDING_PAYMENT)
                .bookingType("PACKAGE")
                .hotelId(hotelId)
                .roomReservationsIds(emptyIfNull(roomReservationsIds))
                .transportReservationsIds(emptyIfNull(transportReservationsIds))
                .userId(userId)
                .title("套餐预订")
                .travelers(Collections.emptyList())
                .build();
        reservationAggregate.handleCreateReservationCommand(command);
        return reservationRepository.findById(reservationId).orElseThrow(RuntimeException::new);
    }

    public List<ReservationResponse> getReservationsForUser(UUID userId) {
        return reservationRepository.findByUserIdOrderByHotelTimeFromDesc(userId).stream()
                .map(this::refreshExpiredReservation)
                .map(ReservationResponse::from)
                .toList();
    }

    public ReservationResponse getReservation(UUID reservationId) {
        return reservationRepository.findById(reservationId)
                .map(this::refreshExpiredReservation)
                .map(ReservationResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
    }

    public ReservationResponse cancelReservation(UUID reservationId, String reason) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));

        if (reservation.getStatus() == ReservationStatus.REFUND_PROCESSING) {
            return ReservationResponse.from(completeProcessingRefund(reservation));
        }
        if (reservation.getStatus() == ReservationStatus.CANCELLED ||
                reservation.getStatus() == ReservationStatus.REFUNDED) {
            return ReservationResponse.from(reservation);
        }

        boolean refundRequired = reservation.isPaid() || reservation.getStatus() == ReservationStatus.PAID;
        LocalDateTime now = LocalDateTime.now();
        String normalizedReason = hasText(reason) ? reason.trim() : "用户主动取消";

        if (refundRequired) {
            refundRecordRepository.save(RefundRecord.builder()
                    .id(UUID.randomUUID())
                    .reservationId(reservationId)
                    .amount(reservation.getPrice())
                    .reason(normalizedReason)
                    .status(RefundStatus.COMPLETED)
                    .requestedAt(now)
                    .completedAt(now)
                    .build());
        }

        reservationAggregate.handleReservationUpdateCommand(UpdateReservationCommand.builder()
                .reservationId(reservationId)
                .paid(false)
                .status(refundRequired ? ReservationStatus.REFUNDED : ReservationStatus.CANCELLED)
                .cancellationReason(normalizedReason)
                .cancelledAt(now)
                .refundRequestedAt(refundRequired ? now : null)
                .refundedAt(refundRequired ? now : null)
                .build());

        return reservationRepository.findById(reservationId)
                .map(ReservationResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
    }

    public ReservationResponse createTicketReservation(CreateTicketReservationRequest request) {
        LocalDateTime departureAt = request.departureDate().atTime(parseTime(request.departureTime()));
        LocalDateTime arrivalAt = request.departureDate().atTime(parseTime(request.arrivalTime()));
        if (arrivalAt.isBefore(departureAt)) {
            arrivalAt = arrivalAt.plusDays(1);
        }

        String bookingType = normalizeTicketType(request.transportType());
        List<BookingPersonSnapshot> travelers = normalizeTravelers(request.travelers(), request.passengerCount());
        UUID reservationId = UUID.randomUUID();

        // Use the actual ticketOfferId when available so the transport-service can decrement inventory.
        // Fall back to a derived UUID for backwards compatibility when the field is absent.
        UUID transportReservationId = request.ticketOfferId() != null
                ? request.ticketOfferId()
                : UUID.nameUUIDFromBytes(
                        (bookingType + request.bookingCode() + departureAt)
                                .getBytes(StandardCharsets.UTF_8));

        int adultsCount = countTravelers(travelers, "ADULT", "STUDENT");

        CreateReservationCommand command = CreateReservationCommand.builder()
                .id(reservationId)
                .hotelTimeFrom(departureAt)
                .hotelTimeTo(arrivalAt)
                .infantsQuantity(0)
                .kidsQuantity(0)
                .teensQuantity(0)
                .adultsQuantity(adultsCount)
                .price(request.price())
                .paid(false)
                .status(ReservationStatus.PENDING_PAYMENT)
                .bookingType(bookingType)
                .roomReservationsIds(Collections.emptyList())
                .transportReservationsIds(List.of(transportReservationId))
                .userId(request.userId())
                .title((bookingType.equals("FLIGHT") ? "机票预订 " : "火车票预订 ") + request.bookingCode())
                .provider(request.provider())
                .bookingCode(request.bookingCode())
                .travelers(travelers)
                .build();

        reservationAggregate.handleCreateReservationCommand(command);

        // Wire into the saga so transport-service decrements remaining_seats and rollback works on timeout.
        ReservationRequest rollbackRequest = ReservationRequest.builder()
                .id(reservationId)
                .transportReservationsIds(List.of(transportReservationId))
                .roomReservationsIds(Collections.emptyList())
                .hotelId(null)
                .adultsQuantity(adultsCount)
                .childrenUnder3Quantity(0)
                .childrenUnder10Quantity(0)
                .childrenUnder18Quantity(0)
                .hotelTimeFrom(departureAt)
                .hotelTimeTo(arrivalAt)
                .price(request.price())
                .userId(request.userId())
                .build();
        bookTransportsSaga.createTransportReservation(rollbackRequest);
        invalidPaymentHandler.schedulePaymentTimeoutCheck(rollbackRequest);

        return getReservation(reservationId);
    }

    public ReservationResponse createHotelOnlyReservation(CreateHotelOnlyReservationRequest request) {
        if (!request.dateTo().isAfter(request.dateFrom())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateTo must be after dateFrom");
        }

        UUID reservationId = UUID.randomUUID();
        int requestedGuestCount = request.adultsQuantity() + request.childrenUnder3Quantity() +
                request.childrenUnder10Quantity() + request.childrenUnder18Quantity();
        List<BookingPersonSnapshot> travelers = normalizeTravelers(request.travelers(), requestedGuestCount);
        String roomName = hasText(request.roomName()) ? request.roomName().trim() : "标准房";
        LocalDateTime checkIn = request.dateFrom().atTime(14, 0);
        LocalDateTime checkOut = request.dateTo().atTime(12, 0);

        // Use the actual roomId from the hotel-service when provided so the hotel-service can
        // create a real RoomReservation record linked to the correct Room entity.
        // Fall back to a hash-based ID when the field is absent (backwards compat).
        long roomReservationId = request.roomId() != null
                ? request.roomId()
                : Math.abs(UUID.nameUUIDFromBytes(
                        (request.hotelId() + roomName + request.dateFrom() + request.dateTo() + request.userId())
                                .getBytes(StandardCharsets.UTF_8)
                ).getMostSignificantBits());

        CreateReservationCommand command = CreateReservationCommand.builder()
                .id(reservationId)
                .hotelTimeFrom(checkIn)
                .hotelTimeTo(checkOut)
                .infantsQuantity(request.childrenUnder3Quantity())
                .kidsQuantity(request.childrenUnder10Quantity())
                .teensQuantity(request.childrenUnder18Quantity())
                .adultsQuantity(request.adultsQuantity())
                .price(request.price())
                .paid(false)
                .status(ReservationStatus.PENDING_PAYMENT)
                .bookingType("HOTEL")
                .hotelId(request.hotelId())
                .roomReservationsIds(List.of(roomReservationId))
                .transportReservationsIds(Collections.emptyList())
                .userId(request.userId())
                .title(request.hotelName())
                .provider(roomName)
                .bookingCode("HOTEL-" + reservationId.toString().substring(0, 8).toUpperCase())
                .travelers(travelers)
                .build();

        reservationAggregate.handleCreateReservationCommand(command);

        // Wire into the saga so hotel-service creates a real RoomReservation record
        // and rollback works on payment timeout.
        ReservationRequest rollbackRequest = ReservationRequest.builder()
                .id(reservationId)
                .transportReservationsIds(Collections.emptyList())
                .roomReservationsIds(List.of(roomReservationId))
                .hotelId(request.hotelId())
                .adultsQuantity(request.adultsQuantity())
                .childrenUnder3Quantity(request.childrenUnder3Quantity())
                .childrenUnder10Quantity(request.childrenUnder10Quantity())
                .childrenUnder18Quantity(request.childrenUnder18Quantity())
                .hotelTimeFrom(checkIn)
                .hotelTimeTo(checkOut)
                .price(request.price())
                .userId(request.userId())
                .build();
        bookHotelsSaga.createHotelReservation(rollbackRequest);
        invalidPaymentHandler.schedulePaymentTimeoutCheck(rollbackRequest);

        return getReservation(reservationId);
    }

    public UUID bookOrchestration(ReservationRequest reservationRequest) throws ReservationFailException {

        checkHotelAvailability(reservationRequest);

        checkTransportAvailability(reservationRequest);

        UUID reservationId = UUID.randomUUID();
        reservationRequest.setId(reservationId);
        createReservationFromRequest(reservationRequest);

        bookHotelsSaga.createHotelReservation(reservationRequest);

        bookTransportsSaga.createTransportReservation(reservationRequest);

        invalidPaymentHandler.schedulePaymentTimeoutCheck(reservationRequest);

        return reservationId;
    }


    private void checkHotelAvailability(ReservationRequest reservationRequest) throws ReservationFailException {
        boolean hotelIsAvailable = bookHotelsSaga.checkIfHotelIsAvailable(reservationRequest);
        System.out.println("hotelIsAvailable: "+ hotelIsAvailable);
        if(!hotelIsAvailable) { throw new ReservationFailException(); }
    }

    private void checkTransportAvailability(ReservationRequest reservationRequest) throws ReservationFailException {
        boolean transportIsAvailable = bookTransportsSaga.checkIfTransportIsAvailable(reservationRequest);
        System.out.println("transportIsAvailable: " + transportIsAvailable);
        if(!transportIsAvailable) { throw new ReservationFailException(); }
    }

    public void createReservationFromRequest(ReservationRequest reservationRequest) {
        String reservationRequestJson = JsonConverter.convert(reservationRequest);

        System.out.println("reservationRequestJson: " + reservationRequestJson);

        rabbitTemplate.convertAndSend(QueuesReservationConfig.EXCHANGE_CREATE_RESERVATION, "", reservationRequestJson);

        System.out.println("reservationCreated: " + reservationRequest.getId());
    }

    public ReservationConfirmationResponse purchaseReservation(String reservationId, String cardNumber) {
        Reservation existingReservation = reservationRepository.findById(UUID.fromString(reservationId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
        if (existingReservation.getStatus() == ReservationStatus.PAID) {
            return buildConfirmation(existingReservation);
        }
        if (existingReservation.getStatus() != ReservationStatus.PENDING_PAYMENT) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only pending reservations can be paid");
        }
        if (existingReservation.getPaymentDeadline() != null &&
                existingReservation.getPaymentDeadline().isBefore(LocalDateTime.now())) {
            reservationAggregate.handleReservationUpdateCommand(UpdateReservationCommand.builder()
                    .reservationId(existingReservation.getId())
                    .paid(false)
                    .status(ReservationStatus.EXPIRED)
                    .build());
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Payment deadline has expired");
        }

        boolean successfulPayment = false;
        String failedPaymentMessage = "";
        try {
            successfulPayment = processPaymentWithPaymentModule(reservationId, cardNumber);
        } catch (PaymentProcessException e) {
            logger.warning("Exception thrown in payment process:" + e.getMessage());
            failedPaymentMessage = e.getMessage();
        }

        // ROLLBACK here
        if(!successfulPayment) {
            Optional<Reservation> reservationOptional = reservationRepository.findById(UUID.fromString(reservationId));

            if (reservationOptional.isPresent() && "PACKAGE".equals(reservationOptional.get().getBookingType())) {
                // If the reservation is present, get its value and build ReservationRequest
                Reservation reservation = reservationOptional.get();
                ReservationRequest reservationRequest = ReservationRequest.builder()
                        .id(reservation.getId())
                        .hotelTimeFrom(reservation.getHotelTimeFrom())
                        .hotelTimeTo(reservation.getHotelTimeTo())
                        .adultsQuantity(reservation.getAdultsQuantity())
                        .childrenUnder18Quantity(reservation.getChildrenUnder18Quantity())
                        .childrenUnder10Quantity(reservation.getChildrenUnder10Quantity())
                        .childrenUnder3Quantity(reservation.getChildrenUnder3Quantity())
                        .transportReservationsIds(reservation.getTransportReservationsIds())
                        .hotelId(reservation.getHotelId())
                        .roomReservationsIds(reservation.getRoomReservationsIds())
                        .userId(reservation.getUserId())
                        .build();

                invalidPaymentHandler.rollbackReservation(reservationRequest);
            }

            logger.severe("Payment failed: " + failedPaymentMessage);
            savePaymentTransaction(existingReservation, cardNumber, false, failedPaymentMessage);
            throw new PurchaseFailedException(failedPaymentMessage);
        }

        savePaymentTransaction(existingReservation, cardNumber, true, null);
        updateReservationPaymentStatus(reservationId);

        Reservation reservation = reservationRepository.findById(UUID.fromString(reservationId)).orElseThrow(ReservationNotFoundAfterPaymentException::new);
        return buildConfirmation(reservation);
    }

    private ReservationConfirmationResponse buildConfirmation(Reservation reservation) {
        TransportReservationResponse transportInfo = getTransportInformation(
                reservation.getTransportReservationsIds().stream().map(UUID::toString).toList());

        logger.info("Purchased reservation: " + reservation);

        if (reservation.getHotelId() != null) {
            sendBoughtOfferWebsocketMessages(
                    "Ktoś kupił wycieczkę do aktualnie przeglądanego hotelu!",
                    String.valueOf(reservation.getHotelId()));
        }

        // Use the title already stored on the reservation (set at booking time) as the hotel name snapshot.
        String displayName = hasText(reservation.getTitle()) ? reservation.getTitle() : "订单确认";

        return ReservationConfirmationResponse.builder()
                .hotelName(displayName)
                .price(reservation.getPrice())
                .dateFrom(reservation.getHotelTimeFrom())
                .dateTo(reservation.getHotelTimeTo())
                .adults(reservation.getAdultsQuantity())
                .infants(reservation.getChildrenUnder3Quantity())
                .kids(reservation.getChildrenUnder10Quantity())
                .teens(reservation.getChildrenUnder18Quantity())
                .roomTypes(Collections.emptyMap())
                .transport(transportInfo)
                .build();
    }

    private void updateReservationPaymentStatus(String reservationId) {
        UpdateReservationPaymentStatus updateReservationPaymentStatus = new UpdateReservationPaymentStatus();
        updateReservationPaymentStatus.setReservationId(UUID.fromString(reservationId));

        String requestJson = JsonConverter.convert(updateReservationPaymentStatus);

        logger.info("Updating reservation object: " + requestJson);

        rabbitTemplate.convertAndSend(
                QueuesReservationConfig.EXCHANGE_UPDATE_RESERVATION,
                "", // Routing key is ignored for FanoutExchange
                requestJson
        );

        reservationAggregate.handleReservationUpdateCommand(UpdateReservationCommand.builder()
                .reservationId(UUID.fromString(reservationId))
                .paid(true)
                .status(ReservationStatus.PAID)
                .paidAt(LocalDateTime.now())
                .build());
    }

    public List<PaymentTransactionResponse> getPaymentTransactions(UUID reservationId) {
        requireReservation(reservationId);
        return paymentTransactionRepository.findByReservationIdOrderByCreatedAtDesc(reservationId).stream()
                .map(PaymentTransactionResponse::from)
                .toList();
    }

    public List<RefundRecordResponse> getRefundRecords(UUID reservationId) {
        requireReservation(reservationId);
        return refundRecordRepository.findByReservationIdOrderByRequestedAtDesc(reservationId).stream()
                .map(RefundRecordResponse::from)
                .toList();
    }

    public ReservationResponse completeRefund(UUID reservationId) {
        Reservation reservation = requireReservation(reservationId);
        if (reservation.getStatus() == ReservationStatus.REFUNDED) {
            return ReservationResponse.from(reservation);
        }
        if (reservation.getStatus() != ReservationStatus.REFUND_PROCESSING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only processing refunds can be completed");
        }

        return ReservationResponse.from(completeProcessingRefund(reservation));
    }

    private void sendBoughtOfferWebsocketMessages(String message, String idHotel) {
        reservationWebSocketHandler.sendMessageToSubscribedByIdHotel(message, idHotel);
    }

    private TransportReservationResponse getTransportInformation(List<String> transportIds) {
        if (transportIds == null || transportIds.isEmpty()) {
            return TransportReservationResponse.builder()
                    .type("None")
                    .departureFrom(LocationReservationResponse.builder().country("").region("").build())
                    .departureTo(LocationReservationResponse.builder().region("").country("").build())
                    .build();
        }
        return TransportReservationResponse.builder().type("Plane").departureFrom(LocationReservationResponse.builder().country("Polska").region("Gdańsk").build()).departureTo(LocationReservationResponse.builder().region("Marsa Alam").country("Egipt").build()).build();
    }

    private boolean processPaymentWithPaymentModule(String reservationId, String cardNumber) throws PaymentProcessException {
        PaymentRequestDto requestDto = PaymentRequestDto.builder()
                .idReservation(reservationId)
                .cardNumber(cardNumber)
                .build();

        String transportMessageJson = JsonConverter.convert(requestDto);
        logger.info("Request to payments.requests.handle " + transportMessageJson);
        try {
            String responseMessage = (String) rabbitTemplate.convertSendAndReceive("payments.requests.handle", "payments.handlePayment", transportMessageJson);

            if(responseMessage != null) {

                PaymentResponseDto paymentResponseDto = JsonReader.readDtoFromJson(responseMessage, PaymentResponseDto.class);
                if(!paymentResponseDto.getReservationId().equals(reservationId)) {
                    throw new PaymentProcessException("Requested payment id is different than returned from payment module");
                }
                if(!paymentResponseDto.isTransactionApproved()) {
                    throw new PaymentProcessException("Transaction was not approved");
                }

                return true;
            }
            else {
                throw new PaymentProcessException("Null message at: purchaseReservation()");
            }

        }
        catch (AmqpException e) {
            throw new PaymentProcessException("Amqp exception was thrown");
        }
    }

    private void savePaymentTransaction(Reservation reservation, String cardNumber, boolean approved, String failureReason) {
        paymentTransactionRepository.save(PaymentTransaction.builder()
                .id(UUID.randomUUID())
                .reservationId(reservation.getId())
                .amount(reservation.getPrice())
                .cardLast4(maskCardLast4(cardNumber))
                .approved(approved)
                .status(approved ? "SUCCESS" : "FAILED")
                .failureReason(failureReason)
                .createdAt(LocalDateTime.now())
                .build());
    }

    private String maskCardLast4(String cardNumber) {
        if (cardNumber == null || cardNumber.length() < 4) {
            return null;
        }
        return cardNumber.substring(cardNumber.length() - 4);
    }

    private LocalTime parseTime(String value) {
        String normalized = value == null ? "" : value.trim();
        try {
            return LocalTime.parse(normalized);
        } catch (RuntimeException ignored) {
        }
        try {
            return LocalDateTime.parse(normalized).toLocalTime();
        } catch (RuntimeException ignored) {
        }
        try {
            return OffsetDateTime.parse(normalized).toLocalTime();
        } catch (RuntimeException ignored) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Time must use HH:mm format or ISO datetime format");
        }
    }

    private String normalizeTicketType(String transportType) {
        String value = transportType.trim().toUpperCase();
        if (value.equals("FLIGHT") || value.equals("PLANE") || value.equals("SAMOLOT")) {
            return "FLIGHT";
        }
        if (value.equals("TRAIN") || value.equals("POCIAG") || value.equals("RAIL")) {
            return "TRAIN";
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported transport type");
    }

    private <T> List<T> emptyIfNull(List<T> values) {
        return values == null ? Collections.emptyList() : values;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private List<BookingPersonSnapshot> normalizeTravelers(List<BookingPersonRequest> travelers, int fallbackCount) {
        if (travelers == null || travelers.isEmpty()) {
            List<BookingPersonSnapshot> generated = new ArrayList<>();
            for (int index = 0; index < Math.max(1, fallbackCount); index++) {
                generated.add(BookingPersonSnapshot.builder()
                        .name("旅客 " + (index + 1))
                        .travelerType("ADULT")
                        .build());
            }
            return generated;
        }
        return travelers.stream()
                .map(person -> BookingPersonSnapshot.builder()
                        .travelerId(normalizeOptional(person.travelerId()))
                        .name(person.name().trim())
                        .travelerType(normalizeTravelerType(person.travelerType()))
                        .documentType(normalizeOptional(person.documentType()))
                        .documentNumber(normalizeOptional(person.documentNumber()))
                        .phone(normalizeOptional(person.phone()))
                        .build())
                .toList();
    }

    private int countTravelers(List<BookingPersonSnapshot> travelers, String... types) {
        List<String> acceptedTypes = List.of(types);
        return (int) travelers.stream()
                .filter(person -> acceptedTypes.contains(person.getTravelerType()))
                .count();
    }

    private String normalizeTravelerType(String value) {
        String normalized = hasText(value) ? value.trim().toUpperCase() : "ADULT";
        return List.of("ADULT", "CHILD", "STUDENT").contains(normalized) ? normalized : "ADULT";
    }

    private String normalizeOptional(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private Reservation refreshExpiredReservation(Reservation reservation) {
        if (reservation.getStatus() == ReservationStatus.REFUND_PROCESSING) {
            return completeProcessingRefund(reservation);
        }
        if (reservation.getStatus() == ReservationStatus.PENDING_PAYMENT &&
                reservation.getPaymentDeadline() != null &&
                reservation.getPaymentDeadline().isBefore(LocalDateTime.now())) {
            reservationAggregate.handleReservationUpdateCommand(UpdateReservationCommand.builder()
                    .reservationId(reservation.getId())
                    .paid(false)
                    .status(ReservationStatus.EXPIRED)
                    .build());
            return reservationRepository.findById(reservation.getId()).orElse(reservation);
        }
        return reservation;
    }

    private Reservation completeProcessingRefund(Reservation reservation) {
        LocalDateTime now = LocalDateTime.now();
        UUID reservationId = reservation.getId();
        RefundRecord refund = refundRecordRepository
                .findFirstByReservationIdAndStatusOrderByRequestedAtDesc(reservationId, RefundStatus.PROCESSING)
                .orElseGet(() -> refundRecordRepository.save(RefundRecord.builder()
                        .id(UUID.randomUUID())
                        .reservationId(reservationId)
                        .amount(reservation.getPrice())
                        .reason(hasText(reservation.getCancellationReason()) ? reservation.getCancellationReason() : "退款完成")
                        .status(RefundStatus.PROCESSING)
                        .requestedAt(reservation.getRefundRequestedAt() == null ? now : reservation.getRefundRequestedAt())
                        .build()));
        refund.setStatus(RefundStatus.COMPLETED);
        refund.setCompletedAt(now);
        refundRecordRepository.save(refund);

        reservationAggregate.handleReservationUpdateCommand(UpdateReservationCommand.builder()
                .reservationId(reservationId)
                .paid(false)
                .status(ReservationStatus.REFUNDED)
                .refundedAt(now)
                .build());

        return reservationRepository.findById(reservationId).orElse(reservation);
    }

    private Reservation requireReservation(UUID reservationId) {
        return reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
    }

}
