package org.microarchitecturovisco.reservationservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.commands.CreateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.commands.UpdateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.dto.HotelInfo;
import org.microarchitecturovisco.reservationservice.domain.dto.PaymentRequestDto;
import org.microarchitecturovisco.reservationservice.domain.dto.PaymentResponseDto;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateHotelOnlyReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateTicketReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.ReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.UpdateReservationPaymentStatus;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.ReservationResponse;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;
import org.microarchitecturovisco.reservationservice.domain.exceptions.PaymentProcessException;
import org.microarchitecturovisco.reservationservice.domain.exceptions.PurchaseFailedException;
import org.microarchitecturovisco.reservationservice.domain.exceptions.ReservationFailException;
import org.microarchitecturovisco.reservationservice.domain.exceptions.ReservationNotFoundAfterPaymentException;
import org.microarchitecturovisco.reservationservice.domain.model.LocationReservationResponse;
import org.microarchitecturovisco.reservationservice.domain.model.ReservationConfirmationResponse;
import org.microarchitecturovisco.reservationservice.domain.model.TransportReservationResponse;
import org.microarchitecturovisco.reservationservice.queues.config.QueuesReservationConfig;
import org.microarchitecturovisco.reservationservice.repositories.ReservationRepository;
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
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class ReservationService {

    private static final org.slf4j.Logger log = LoggerFactory.getLogger(ReservationService.class);

    public static Logger logger = Logger.getLogger(ReservationService.class.getName());

    private final ReservationRepository reservationRepository;
    private final ReservationAggregate reservationAggregate;

    private final BookHotelsSaga bookHotelsSaga;
    private final BookTransportsSaga bookTransportsSaga;

    private final RabbitTemplate rabbitTemplate;

    private final ReservationWebSocketHandler reservationWebSocketHandler;

    private final InvalidPaymentHandler invalidPaymentHandler;

    public Reservation createReservation(LocalDateTime hotelTimeFrom, LocalDateTime hotelTimeTo,
                                                      int infantsQuantity, int kidsQuantity, int teensQuantity, int adultsQuantity,
                                                      float price, UUID hotelId, List<UUID> roomReservationsIds,
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
                .build();
        reservationAggregate.handleCreateReservationCommand(command);
        return reservationRepository.findById(reservationId).orElseThrow(RuntimeException::new);
    }

    public List<ReservationResponse> getReservationsForUser(UUID userId) {
        return reservationRepository.findByUserIdOrderByHotelTimeFromDesc(userId).stream()
                .map(ReservationResponse::from)
                .toList();
    }

    public ReservationResponse getReservation(UUID reservationId) {
        return reservationRepository.findById(reservationId)
                .map(ReservationResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
    }

    public ReservationResponse cancelReservation(UUID reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));

        if (reservation.getStatus() == ReservationStatus.CANCELLED) {
            return ReservationResponse.from(reservation);
        }

        if (reservation.isPaid() || reservation.getStatus() == ReservationStatus.PAID) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Paid reservations cannot be cancelled here");
        }

        reservationAggregate.handleReservationUpdateCommand(UpdateReservationCommand.builder()
                .reservationId(reservationId)
                .paid(false)
                .status(ReservationStatus.CANCELLED)
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
        UUID reservationId = UUID.randomUUID();
        UUID transportReservationId = UUID.nameUUIDFromBytes(
                (bookingType + request.bookingCode() + request.routeFrom() + request.routeTo() + departureAt)
                        .getBytes(StandardCharsets.UTF_8)
        );

        CreateReservationCommand command = CreateReservationCommand.builder()
                .id(reservationId)
                .hotelTimeFrom(departureAt)
                .hotelTimeTo(arrivalAt)
                .infantsQuantity(0)
                .kidsQuantity(0)
                .teensQuantity(0)
                .adultsQuantity(request.passengerCount())
                .price(request.price())
                .paid(false)
                .status(ReservationStatus.PENDING_PAYMENT)
                .bookingType(bookingType)
                .roomReservationsIds(Collections.emptyList())
                .transportReservationsIds(List.of(transportReservationId))
                .userId(request.userId())
                .title((bookingType.equals("FLIGHT") ? "机票预订 " : "火车票预订 ") + request.bookingCode())
                .routeFrom(request.routeFrom())
                .routeTo(request.routeTo())
                .provider(request.provider())
                .bookingCode(request.bookingCode())
                .build();

        reservationAggregate.handleCreateReservationCommand(command);
        return getReservation(reservationId);
    }

    public ReservationResponse createHotelOnlyReservation(CreateHotelOnlyReservationRequest request) {
        if (!request.dateTo().isAfter(request.dateFrom())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateTo must be after dateFrom");
        }

        UUID reservationId = UUID.randomUUID();
        String roomName = hasText(request.roomName()) ? request.roomName().trim() : "标准房";
        UUID roomReservationId = UUID.nameUUIDFromBytes(
                (request.hotelId() + roomName + request.dateFrom() + request.dateTo() + request.userId())
                        .getBytes(StandardCharsets.UTF_8)
        );

        CreateReservationCommand command = CreateReservationCommand.builder()
                .id(reservationId)
                .hotelTimeFrom(request.dateFrom().atTime(14, 0))
                .hotelTimeTo(request.dateTo().atTime(12, 0))
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
                .build();

        reservationAggregate.handleCreateReservationCommand(command);
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
        if (existingReservation.getStatus() == ReservationStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cancelled reservations cannot be paid");
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

            if (reservationOptional.isPresent()) {
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
            throw new PurchaseFailedException(failedPaymentMessage);
        }

        updateReservationPaymentStatus(reservationId);

        Reservation reservation = reservationRepository.findById(UUID.fromString(reservationId)).orElseThrow(ReservationNotFoundAfterPaymentException::new);
        HotelInfo hotelInfo = getHotelInformation(reservation.getHotelId());
        TransportReservationResponse transportInfo = getTransportInformation(reservation.getTransportReservationsIds().stream().map(UUID::toString).toList());

        logger.info("Purchased reservation: " + reservation);

        sendBoughtOfferWebsocketMessages("Ktoś kupił wycieczkę do aktualnie przeglądanego hotelu!", String.valueOf(reservation.getHotelId()));

        return ReservationConfirmationResponse.builder()
                .hotelName(hotelInfo.getName())
                .price(reservation.getPrice())
                .dateFrom(reservation.getHotelTimeFrom())
                .dateTo(reservation.getHotelTimeTo())
                .adults(reservation.getAdultsQuantity())
                .infants(reservation.getChildrenUnder3Quantity())
                .kids(reservation.getChildrenUnder10Quantity())
                .teens(reservation.getChildrenUnder18Quantity())
                .roomTypes(hotelInfo.getRoomTypes())
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
                .build());
    }

    private void sendBoughtOfferWebsocketMessages(String message, String idHotel) {
        reservationWebSocketHandler.sendMessageToSubscribedByIdHotel(message, idHotel);
    }

    private HotelInfo getHotelInformation(UUID hotelId) {
        if (hotelId == null) {
            return HotelInfo.builder()
                    .hotelPrice(0.0f)
                    .name("票务订单")
                    .roomTypes(Collections.emptyMap())
                    .build();
        }
        return HotelInfo.builder().hotelPrice(1500.0f).name("Hotel testowy").roomTypes(Map.of("Pokój dwuosobowy", 1)).build();
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

    private LocalTime parseTime(String value) {
        try {
            return LocalTime.parse(value.trim());
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Time must use HH:mm format");
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

    private List<UUID> emptyIfNull(List<UUID> values) {
        return values == null ? Collections.emptyList() : values;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

}
