package org.microarchitecturovisco.hotelservice.transport.controllers;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.hotelservice.transport.controllers.reservations.CreateTransportReservationRequest;
import org.microarchitecturovisco.hotelservice.transport.controllers.reservations.DeleteTransportReservationRequest;
import org.microarchitecturovisco.hotelservice.transport.model.cqrs.commands.CreateTransportReservationCommand;
import org.microarchitecturovisco.hotelservice.transport.model.cqrs.commands.DeleteTransportReservationCommand;
import org.microarchitecturovisco.hotelservice.transport.model.domain.TicketType;
import org.microarchitecturovisco.hotelservice.transport.model.dto.TransportDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.TransportReservationDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.request.CheckTransportAvailabilityRequestDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.request.GetTransportsBetweenLocationsRequestDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.request.GetTransportsBetweenMultipleLocationsRequestDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.AvailableTransportsDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.CheckTransportAvailabilityResponseDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.GetTransportsBetweenLocationsResponseDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.TicketOfferDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.TicketOptionsDto;
import org.microarchitecturovisco.hotelservice.transport.queues.config.TransportQueuesConfig;
import org.microarchitecturovisco.hotelservice.transport.services.TransportCommandService;
import org.microarchitecturovisco.hotelservice.transport.services.TransportsQueryService;
import org.microarchitecturovisco.hotelservice.transport.utils.json.JsonConverter;
import org.microarchitecturovisco.hotelservice.transport.utils.json.JsonReader;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import java.util.logging.Logger;

@RestController()
@RequestMapping("/transports")
@RequiredArgsConstructor
public class TransportsQueryController {

    private final TransportsQueryService transportsQueryService;
    public static Logger logger = Logger.getLogger(TransportsQueryController.class.getName());

    private final TransportCommandService transportCommandService;

    @GetMapping("/")
    public List<TransportDto> getAllTransports() {
        return transportsQueryService.getAllTransports();
    }

    @GetMapping("/available")
    public AvailableTransportsDto getAvailableTransports() {
        return transportsQueryService.getAvailableTransports();
    }

    @GetMapping("/tickets/options")
    public TicketOptionsDto getTicketOptions(@RequestParam TicketType type) {
        return transportsQueryService.getTicketOptions(type);
    }

    @GetMapping("/tickets")
    public List<TicketOfferDto> searchTicketOffers(
            @RequestParam TicketType type,
            @RequestParam String departureCity,
            @RequestParam String arrivalCity,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate departureDate,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "false") boolean studentOnly,
            @RequestParam(defaultValue = "false") boolean onlyAvailable,
            @RequestParam(defaultValue = "departure") String sortBy
    ) {
        return transportsQueryService.searchTicketOffers(
                type,
                departureCity,
                arrivalCity,
                departureDate,
                minPrice,
                maxPrice,
                studentOnly,
                onlyAvailable,
                sortBy
        );
    }

    @RabbitListener(
            queues = "transports.requests.getTransportsBetweenLocations",
            containerFactory = "transportRabbitListenerContainerFactory")
    public String getTransportsBetweenLocations(String requestDtoJson) {
        Logger logger = Logger.getLogger("getTransportsBetweenLocations");
        logger.info("Request: " + requestDtoJson);

        GetTransportsBetweenLocationsRequestDto requestDto = JsonReader.readGetTransportsBetweenLocationsRequestDtoFromJson(requestDtoJson);
        GetTransportsBetweenLocationsResponseDto responseDto = transportsQueryService.getTransportsBetweenLocations(requestDto);
        logger.info("Response size: " + responseDto.getTransportPairs().size());
        return JsonConverter.convertGetTransportsBetweenLocationsResponseDto(responseDto);
    }

    @RabbitListener(
            queues = "transports.requests.getTransportsBetweenMultipleLocations",
            containerFactory = "transportRabbitListenerContainerFactory")
    public String getTransportsBetweenMultipleLocations(String requestDtoJson) {
        Logger logger = Logger.getLogger("getTransportsBetweenMultipleLocations");
        logger.info("Request: " + requestDtoJson);

        GetTransportsBetweenMultipleLocationsRequestDto requestDto = JsonReader.readDtoFromJson(requestDtoJson, GetTransportsBetweenMultipleLocationsRequestDto.class);
        GetTransportsBetweenLocationsResponseDto responseDto = transportsQueryService.getTransportsBetweenMultipleLocations(requestDto);
        logger.info("Response size: " + responseDto.getTransportPairs().size());
        return JsonConverter.convertGetTransportsBetweenLocationsResponseDto(responseDto);
    }

    @RabbitListener(
            queues = TransportQueuesConfig.QUEUE_TRANSPORT_CHECK_AVAILABILITY_REQ,
            containerFactory = "transportRabbitListenerContainerFactory")
    public String consumeMessageFromQueueCheckTransportAvailability(String requestDtoJson) {
        CheckTransportAvailabilityRequestDto request = JsonReader.readDtoFromJson(requestDtoJson, CheckTransportAvailabilityRequestDto.class);
        logger.info("Checking transport availability: " + request);

        CheckTransportAvailabilityResponseDto response = CheckTransportAvailabilityResponseDto.builder()
                .ifAvailable(false)
                .build();

        logger.info("Transport available:" + response.isIfAvailable());
        return JsonConverter.convertToJsonWithLocalDateTime(response);
    }

    @RabbitListener(
            queues = "#{handleCreateTransportReservationQueue.name}",
            containerFactory = "transportRabbitListenerContainerFactory")
    public void consumeMessageCreateTransportReservation(String requestDtoJson) {
        CreateTransportReservationRequest request = JsonReader.readDtoFromJson(requestDtoJson, CreateTransportReservationRequest.class);
        logger.info("Creating transport reservation: " + request);

        for (UUID idTransport : request.getTransportIds()) {
            TransportReservationDto reservationDto = TransportReservationDto.builder()
                    .numberOfSeats(request.getAmountOfQuests())
                    .idTransport(idTransport)
                    .reservationId(request.getReservationId())
                    .build();

            CreateTransportReservationCommand command = CreateTransportReservationCommand.builder()
                    .uuid(UUID.randomUUID())
                    .commandTimeStamp(LocalDateTime.now())
                    .transportReservationDto(reservationDto)
                    .build();

            transportCommandService.createReservation(command);
        }
    }

    @RabbitListener(
            queues = "#{handleDeleteTransportReservationQueue.name}",
            containerFactory = "transportRabbitListenerContainerFactory")
    public void consumeMessageDeleteTransportReservation(String requestJson) {
        DeleteTransportReservationRequest request = JsonReader.readDtoFromJson(requestJson, DeleteTransportReservationRequest.class);
        logger.info("Deleting transport reservation: " + request);

        for (UUID transportId : request.getTransportReservationsIds()) {
            DeleteTransportReservationCommand command = DeleteTransportReservationCommand.builder()
                    .commandTimeStamp(LocalDateTime.now())
                    .reservationId(request.getReservationId())
                    .transportId(transportId)
                    .numberOfSeats(request.getNumberOfSeats())
                    .build();

            transportCommandService.deleteReservation(command);
        }
    }
}
