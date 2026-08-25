package org.microarchitecturovisco.transport.controllers;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.transport.controllers.reservations.CreateTransportReservationRequest;
import org.microarchitecturovisco.transport.controllers.reservations.DeleteTransportReservationRequest;
import org.microarchitecturovisco.transport.model.cqrs.commands.CreateTransportReservationCommand;
import org.microarchitecturovisco.transport.model.cqrs.commands.DeleteTransportReservationCommand;
import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.model.domain.TicketType;
import org.microarchitecturovisco.transport.model.dto.LocationDto;
import org.microarchitecturovisco.transport.model.dto.TransportDto;
import org.microarchitecturovisco.transport.model.dto.TransportReservationDto;
import org.microarchitecturovisco.transport.model.dto.request.CheckTransportAvailabilityRequestDto;
import org.microarchitecturovisco.transport.model.dto.request.GetTransportsBetweenLocationsRequestDto;
import org.microarchitecturovisco.transport.model.dto.request.GetTransportsBetweenMultipleLocationsRequestDto;
import org.microarchitecturovisco.transport.model.dto.request.GetTransportsBySearchQueryRequestDto;
import org.microarchitecturovisco.transport.model.dto.response.AvailableTransportsDto;
import org.microarchitecturovisco.transport.model.dto.response.CheckTransportAvailabilityResponseDto;
import org.microarchitecturovisco.transport.model.dto.response.GetTransportsBetweenLocationsResponseDto;
import org.microarchitecturovisco.transport.model.dto.response.GetTransportsBySearchQueryResponseDto;
import org.microarchitecturovisco.transport.model.dto.response.TicketOfferDto;
import org.microarchitecturovisco.transport.model.dto.response.TicketOptionsDto;
import org.microarchitecturovisco.transport.queues.config.QueuesConfig;
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.microarchitecturovisco.transport.services.TransportCommandService;
import org.microarchitecturovisco.transport.services.TransportsQueryService;
import org.microarchitecturovisco.transport.services.AdminAuthorizationService;
import org.microarchitecturovisco.transport.utils.json.JsonConverter;
import org.microarchitecturovisco.transport.utils.json.JsonReader;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

@RestController()
@RequestMapping("/transports")
@RequiredArgsConstructor
public class TransportsQueryController {

    private final TransportsQueryService transportsQueryService;
    private final RabbitTemplate rabbitTemplate;
    public static Logger logger = Logger.getLogger(TransportsQueryController.class.getName());

    private final TransportCommandService transportCommandService;
    private final TicketOfferTemplateRepository ticketOfferTemplateRepository;
    private final AdminAuthorizationService adminAuthorizationService;

    @GetMapping("/")
    public List<TransportDto> getAllTransports() {
        return transportsQueryService.getAllTransports();
    }

    @PostMapping("/admin")
    @ResponseStatus(HttpStatus.CREATED)
    public void createTransport(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @RequestBody TransportDto transportDto
    ) {
        adminAuthorizationService.requireAdmin(token);
        throw new ResponseStatusException(HttpStatus.GONE, "Legacy package transport inventory was removed");
    }

    @PutMapping("/admin/{transportId}")
    public void updateTransport(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID transportId,
            @RequestBody TransportDto request
    ) {
        adminAuthorizationService.requireAdmin(token);
        throw new ResponseStatusException(HttpStatus.GONE, "Legacy package transport inventory was removed");
    }

    @DeleteMapping("/admin/{transportId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTransport(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID transportId
    ) {
        adminAuthorizationService.requireAdmin(token);
        throw new ResponseStatusException(HttpStatus.GONE, "Legacy package transport inventory was removed");
    }

    @GetMapping("/locations")
    public List<LocationDto> getLocations() {
        return transportsQueryService.getAllLocations();
    }

    @GetMapping("/locations/{region}")
    public LocationDto getLocationByRegionName(@PathVariable String region) {
        return transportsQueryService.getLocationByRegionName(region);
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
            @RequestParam(required = false) Integer minPrice,
            @RequestParam(required = false) Integer maxPrice,
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

    @PostMapping("/tickets/templates")
    @ResponseStatus(HttpStatus.CREATED)
    public TicketOfferTemplate createTicketOfferTemplate(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @RequestBody TicketOfferTemplate template
    ) {
        adminAuthorizationService.requireAdmin(token);
        if (template.getId() == null) {
            template.setId(UUID.randomUUID());
        }
        return ticketOfferTemplateRepository.save(template);
    }

    @PutMapping("/tickets/templates/{templateId}")
    public TicketOfferTemplate updateTicketOfferTemplate(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID templateId,
            @RequestBody TicketOfferTemplate template
    ) {
        adminAuthorizationService.requireAdmin(token);
        template.setId(templateId);
        return ticketOfferTemplateRepository.save(template);
    }

    @DeleteMapping("/tickets/templates/{templateId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTicketOfferTemplate(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID templateId
    ) {
        adminAuthorizationService.requireAdmin(token);
        ticketOfferTemplateRepository.deleteById(templateId);
    }

    @GetMapping("/test")
    public String test() {
        return "test";
    }

    @RabbitListener(queues = "transports.requests.getTransportsBySearchQuery")
    public String consumeGetTransportsRequest(String requestDtoJson) {
        Logger logger = Logger.getLogger("getTransportsBySearchQuery");
        logger.info("Request: " + requestDtoJson);

        GetTransportsBySearchQueryRequestDto requestDto = JsonReader.readGetTransportsBySearchQueryRequestFromJson(requestDtoJson);
        GetTransportsBySearchQueryResponseDto responseDto = transportsQueryService.getTransportsBySearchQuery(requestDto);
        logger.info("Response size: " + responseDto.getTransportDtoList().size());
        return JsonConverter.convertGetTransportsBySearchQueryResponseDto(responseDto);
    }

    @RabbitListener(queues = "transports.requests.getTransportsBetweenLocations")
    public String getTransportsBetweenLocations(String requestDtoJson) {
        Logger logger = Logger.getLogger("getTransportsBetweenLocations");
        logger.info("Request: " + requestDtoJson);

        GetTransportsBetweenLocationsRequestDto requestDto = JsonReader.readGetTransportsBetweenLocationsRequestDtoFromJson(requestDtoJson);
        GetTransportsBetweenLocationsResponseDto responseDto = transportsQueryService.getTransportsBetweenLocations(requestDto);
        logger.info("Response size: " + responseDto.getTransportPairs().size());
        return JsonConverter.convertGetTransportsBetweenLocationsResponseDto(responseDto);
    }

    @RabbitListener(queues = "transports.requests.getTransportsBetweenMultipleLocations")
    public String getTransportsBetweenMultipleLocations(String requestDtoJson) {
        Logger logger = Logger.getLogger("getTransportsBetweenMultipleLocations");
        logger.info("Request: " + requestDtoJson);

        GetTransportsBetweenMultipleLocationsRequestDto requestDto = JsonReader.readDtoFromJson(requestDtoJson, GetTransportsBetweenMultipleLocationsRequestDto.class);
        GetTransportsBetweenLocationsResponseDto responseDto = transportsQueryService.getTransportsBetweenMultipleLocations(requestDto);
        logger.info("Response size: " + responseDto.getTransportPairs().size());
        return JsonConverter.convertGetTransportsBetweenLocationsResponseDto(responseDto);
    }

    @RabbitListener(queues = QueuesConfig.QUEUE_TRANSPORT_CHECK_AVAILABILITY_REQ)
    public String consumeMessageFromQueueCheckTransportAvailability(String requestDtoJson) {
        CheckTransportAvailabilityRequestDto request = JsonReader.readDtoFromJson(requestDtoJson, CheckTransportAvailabilityRequestDto.class);
        logger.info("Checking transport availability: " + request);

        CheckTransportAvailabilityResponseDto response = CheckTransportAvailabilityResponseDto.builder()
                .ifAvailable(false)
                .build();

        logger.info("Transport available:" + response.isIfAvailable());
        return JsonConverter.convertToJsonWithLocalDateTime(response);
    }

    @RabbitListener(queues = "#{handleCreateTransportReservationQueue.name}")
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

    @RabbitListener(queues = "#{handleDeleteTransportReservationQueue.name}")
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
