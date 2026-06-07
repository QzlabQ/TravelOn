package org.microarchitecturovisco.hotelservice.controllers;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.hotelservice.controllers.reservations.CheckHotelAvailabilityRequest;
import org.microarchitecturovisco.hotelservice.controllers.reservations.CreateHotelReservationRequest;
import org.microarchitecturovisco.hotelservice.controllers.reservations.DeleteHotelReservationRequest;
import org.microarchitecturovisco.hotelservice.model.cqrs.commands.CreateRoomReservationCommand;
import org.microarchitecturovisco.hotelservice.model.cqrs.commands.DeleteRoomReservationCommand;
import org.microarchitecturovisco.hotelservice.model.domain.Hotel;
import org.microarchitecturovisco.hotelservice.model.domain.Room;
import org.microarchitecturovisco.hotelservice.model.dto.LocationDto;
import org.microarchitecturovisco.hotelservice.model.dto.RoomReservationDto;
import org.microarchitecturovisco.hotelservice.model.dto.HotelResponseDto;
import org.microarchitecturovisco.hotelservice.model.dto.data_generator.DataUpdateType;
import org.microarchitecturovisco.hotelservice.model.dto.data_generator.RoomUpdateRequest;
import org.microarchitecturovisco.hotelservice.model.dto.request.CheckHotelAvailabilityQueryRequestDto;
import org.microarchitecturovisco.hotelservice.model.dto.request.GetHotelDetailsRequestDto;
import org.microarchitecturovisco.hotelservice.model.dto.request.GetHotelsBySearchQueryRequestDto;
import org.microarchitecturovisco.hotelservice.model.dto.response.CheckHotelAvailabilityResponseDto;
import org.microarchitecturovisco.hotelservice.model.dto.response.GetHotelDetailsResponseDto;
import org.microarchitecturovisco.hotelservice.model.dto.response.GetHotelsBySearchQueryResponseDto;
import org.microarchitecturovisco.hotelservice.model.exceptions.HotelNoFoundException;
import org.microarchitecturovisco.hotelservice.queues.config.QueuesConfig;
import org.microarchitecturovisco.hotelservice.services.HotelsCommandService;
import org.microarchitecturovisco.hotelservice.services.HotelsService;
import org.microarchitecturovisco.hotelservice.utils.JsonConverter;
import org.microarchitecturovisco.hotelservice.utils.JsonReader;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.http.HttpStatus;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

@RestController()
@RequestMapping("/hotels")
@RequiredArgsConstructor
public class HotelsController {

    private final HotelsService hotelsService;
    private final HotelsCommandService hotelsCommandService;

    @GetMapping("/destinations")
    public List<LocationDto> getDestinations() {
        return hotelsService.getDestinations();
    }

    @PostMapping("/admin")
    @ResponseStatus(HttpStatus.CREATED)
    public void createHotel(@RequestBody org.microarchitecturovisco.hotelservice.model.dto.HotelDto hotelDto) {
        hotelsCommandService.createHotel(org.microarchitecturovisco.hotelservice.model.cqrs.commands.CreateHotelCommand.builder()
                .uuid(hotelDto.getHotelId())
                .commandTimeStamp(LocalDateTime.now())
                .hotelDto(hotelDto)
                .build());
    }

    @PutMapping("/admin/{hotelId}")
    public Hotel updateHotel(
            @PathVariable UUID hotelId,
            @RequestBody org.microarchitecturovisco.hotelservice.model.dto.HotelDto hotelDto
    ) {
        return hotelsService.updateHotel(hotelId, hotelDto);
    }

    @DeleteMapping("/admin/{hotelId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteHotel(@PathVariable UUID hotelId) {
        hotelsService.deleteHotel(hotelId);
    }

    @PostMapping("/admin/{hotelId}/rooms")
    @ResponseStatus(HttpStatus.CREATED)
    public void createRoom(
            @PathVariable UUID hotelId,
            @RequestBody org.microarchitecturovisco.hotelservice.model.dto.RoomDto roomDto
    ) {
        UUID roomId = roomDto.getRoomId() == null ? UUID.randomUUID() : roomDto.getRoomId();
        hotelsService.createRoomFromHotel(hotelId, roomId, roomDto.getName(),
                roomDto.getGuestCapacity(), roomDto.getPricePerAdult(), roomDto.getDescription());
    }

    @PutMapping("/admin/{hotelId}/rooms/{roomId}")
    public void updateRoom(
            @PathVariable UUID hotelId,
            @PathVariable UUID roomId,
            @RequestBody org.microarchitecturovisco.hotelservice.model.dto.RoomDto roomDto
    ) {
        hotelsService.updateRoomFromHotel(hotelId, roomId, roomDto.getName(),
                roomDto.getGuestCapacity(), roomDto.getPricePerAdult(), roomDto.getDescription());
    }

    @DeleteMapping("/admin/rooms/{roomId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRoom(@PathVariable UUID roomId) {
        hotelsService.deleteRoom(roomId);
    }

    @GetMapping("/{hotelId}")
    public GetHotelDetailsResponseDto getHotelDetails(
            @PathVariable UUID hotelId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(defaultValue = "2") int adults,
            @RequestParam(defaultValue = "0") int childrenUnder3,
            @RequestParam(defaultValue = "0") int childrenUnder10,
            @RequestParam(defaultValue = "0") int childrenUnder18
    ) {
        return hotelsService.getHotelDetails(GetHotelDetailsRequestDto.builder()
                .hotelId(hotelId)
                .dateFrom(dateFrom.atStartOfDay())
                .dateTo(dateTo.atTime(23, 59, 59))
                .adults(adults)
                .childrenUnderThree(childrenUnder3)
                .childrenUnderTen(childrenUnder10)
                .childrenUnderEighteen(childrenUnder18)
                .build());
    }

    @GetMapping("/search")
    public List<HotelResponseDto> searchHotels(
            @RequestParam UUID destinationId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(defaultValue = "2") int adults,
            @RequestParam(required = false) String hotelName,
            @RequestParam(required = false) Float minPrice,
            @RequestParam(required = false) Float maxPrice,
            @RequestParam(required = false) Float minRating,
            @RequestParam(defaultValue = "ALL") String hotelType,
            @RequestParam(defaultValue = "ALL") String roomType,
            @RequestParam(defaultValue = "price") String sortBy
    ) {
        return hotelsService.searchHotels(
                destinationId,
                dateFrom,
                dateTo,
                adults,
                hotelName,
                minPrice,
                maxPrice,
                minRating,
                hotelType,
                roomType,
                sortBy
        );
    }

    @RabbitListener(queues = "hotels.requests.hotelsBySearchQuery")
    public String consumeGetHotelsRequest(String requestDtoJson) {

        Logger logger = Logger.getLogger("getHotelsBySearchQuery");
        logger.info("Request: " + requestDtoJson);

        GetHotelsBySearchQueryRequestDto requestDto = JsonReader.readGetHotelsBySearchQueryRequestFromJson(requestDtoJson);
        GetHotelsBySearchQueryResponseDto responseDto = hotelsService.GetHotelsBySearchQuery(requestDto);

        logger.info("Response hotels size: " + responseDto.getHotels().size());

        return JsonConverter.convertGetHotelsBySearchQueryResponseDto(responseDto);
    }

    @RabbitListener(queues = "hotels.requests.getHotelDetails")
    public String consumeGetHotelDetails(String requestDtoJson) {

        Logger logger = Logger.getLogger("getHotelDetails");

        GetHotelDetailsRequestDto requestDto = JsonReader.readGetHotelDetailsRequestFromJson(requestDtoJson);
        GetHotelDetailsResponseDto responseDto = hotelsService.getHotelDetails(requestDto);

        logger.info("Response for hotel: " + responseDto.getHotelId() + " " + responseDto.getHotelName());

        return JsonConverter.convertGetHotelDetailsResponseDto(responseDto);
    }

    @RabbitListener(queues = QueuesConfig.QUEUE_HOTEL_CHECK_AVAILABILITY_REQ)
    public String consumeMessageCheckHotelAvailability(String requestJson) {
        CheckHotelAvailabilityRequest request = JsonReader.readCheckHotelAvailabilityRequestCommand(requestJson);
        System.out.println("Checking hotel availability: " + request);

        CheckHotelAvailabilityQueryRequestDto query = CheckHotelAvailabilityQueryRequestDto.builder()
                .dateFrom(request.getDateFrom())
                .dateTo(request.getDateTo())
                .hotelId(request.getHotelId())
                .roomReservationsIds(request.getRoomReservationsIds())
                .build();

        boolean availability = hotelsService.CheckHotelAvailability(query);

        CheckHotelAvailabilityResponseDto response = CheckHotelAvailabilityResponseDto.builder()
                        .ifAvailable(availability)
                        .build();

        System.out.println("Hotel ifAvailable:" + response.isIfAvailable());
        String responseJson = JsonConverter.ConvertToJson(response);

        return responseJson;
    }

    @RabbitListener(queues = "#{handleCreateHotelReservationQueue.name}")
    public void consumeMessageCreateHotelReservation(String requestJson) {
        CreateHotelReservationRequest request = JsonReader.readCreateHotelReservationRequestCommand(requestJson);
        System.out.println("Creating hotel reservations: " + request);

        int numberOfRoomsInReservation = request.getRoomIds().size();

        List<RoomReservationDto> roomReservations = new ArrayList<>();

        for (int i = 0; i < numberOfRoomsInReservation; i++) {
            UUID roomId = request.getRoomIds().get(i);

            RoomReservationDto roomReservation = new RoomReservationDto();
            roomReservation.setReservationId(request.getReservationId());
            roomReservation.setDateFrom(request.getHotelTimeFrom());
            roomReservation.setDateTo(request.getHotelTimeTo());
            roomReservation.setHotelId(request.getHotelId());
            roomReservation.setRoomId(roomId);

            roomReservations.add(roomReservation);
        }

        for (RoomReservationDto roomReservation : roomReservations){
            hotelsCommandService.createReservation(CreateRoomReservationCommand.builder()
                    .hotelId(roomReservation.getHotelId())
                    .roomId(roomReservation.getRoomId())
                    .roomReservationDto(roomReservation)
                    .commandTimeStamp(LocalDateTime.now())
                    .build()
            );
        }
    }

    @RabbitListener(queues = "#{handleDeleteHotelReservationQueue.name}")
    public void consumeMessageDeleteHotelReservation(String requestJson) {

        DeleteHotelReservationRequest request = JsonReader.readDeleteHotelReservationRequestCommand(requestJson);
        System.out.println("Deleting hotel reservations: " + request);

        for (UUID roomId : request.getRoomIds()){
            DeleteRoomReservationCommand command = DeleteRoomReservationCommand.builder()
                    .commandTimeStamp(LocalDateTime.now())
                    .reservationId(request.getReservationId())
                    .roomId(roomId)
                    .hotelId(request.getHotelId())
                    .build();

            hotelsCommandService.deleteReservation(command);
        }
    }

    @RabbitListener(queues = "#{handleDataGeneratorCreateQueue}")
    public void consumeDataGeneratorMessage(String requestJson) {
        Logger logger = Logger.getLogger("HotelController");
        logger.info("Got hotel data generator: " + requestJson);

        RoomUpdateRequest request = JsonReader.readDtoFromJson(requestJson, RoomUpdateRequest.class);

        if (request.getUpdateType() == DataUpdateType.DELETE) {
            System.out.println("Deleted room: " + request);
            hotelsService.deleteRoom(request.getId());
            return;
        }

        // perform data update
        Hotel hotel;
        try {
            hotel = hotelsService.getHotel(request.getHotelId());
        } catch (HotelNoFoundException e) {
            logger.warning("Skip room update because hotel was not found: " + request.getHotelId());
            return;
        }

        // create room
        if (request.getUpdateType() == DataUpdateType.CREATE) {
            System.out.println("Created room: " + request);
            hotelsService.createRoomFromHotel(request.getHotelId(), request.getId(), request.getName(),
                    request.getGuestCapacity(), request.getPricePerAdult(), request.getDescription());

            return;
        }

        // update room
        if (request.getUpdateType() == DataUpdateType.UPDATE) {
            System.out.println("Updated room: " + request);

            Room roomToUpdate;
            try {
                roomToUpdate = hotelsService.getRoomById(request.getId());
            } catch (RuntimeException e) {
                logger.warning("Skip room update because room was not found: " + request.getId());
                return;
            }
            if(hotelsService.doesRoomHaveAnyReservationsInFuture(roomToUpdate)) return;

            hotelsService.updateRoomFromHotel(request.getHotelId(), request.getId(), request.getName(),
                    request.getGuestCapacity(), request.getPricePerAdult(), request.getDescription());

        }

    }

}

