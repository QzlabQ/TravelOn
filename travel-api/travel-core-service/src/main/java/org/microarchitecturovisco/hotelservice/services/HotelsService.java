package org.microarchitecturovisco.hotelservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.hotelservice.model.domain.*;

import org.microarchitecturovisco.hotelservice.model.dto.RoomsConfigurationDto;
import org.microarchitecturovisco.hotelservice.model.dto.HotelResponseDto;
import org.microarchitecturovisco.hotelservice.model.dto.request.*;
import org.microarchitecturovisco.hotelservice.model.dto.response.GetHotelsBySearchQueryResponseDto;
import org.microarchitecturovisco.hotelservice.model.dto.response.GetHotelDetailsResponseDto;
import org.microarchitecturovisco.hotelservice.model.events.RoomCreatedEvent;
import org.microarchitecturovisco.hotelservice.model.events.RoomUpdateEvent;
import org.microarchitecturovisco.hotelservice.model.exceptions.HotelNoFoundException;
import org.microarchitecturovisco.hotelservice.model.mappers.HotelMapper;
import org.microarchitecturovisco.hotelservice.model.mappers.LocationMapper;
import org.microarchitecturovisco.hotelservice.model.mappers.RoomMapper;
import org.microarchitecturovisco.hotelservice.repositories.HotelRepository;
import org.microarchitecturovisco.hotelservice.repositories.LocationRepository;
import org.microarchitecturovisco.hotelservice.repositories.RoomReservationRepository;
import org.microarchitecturovisco.hotelservice.repositories.RoomRepository;
import org.springframework.data.util.Pair;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class HotelsService {

    private final RoomRepository roomRepository;
    private final HotelRepository hotelRepository;
    private final LocationRepository locationRepository;
    private final RoomReservationRepository roomReservationRepository;
    private final HotelEventProjector hotelEventProjector;

    public List<org.microarchitecturovisco.hotelservice.model.dto.LocationDto> getDestinations() {
        return locationRepository.findAll()
                .stream()
                .sorted(Comparator.comparing(Location::getRegion))
                .map(LocationMapper::map)
                .toList();
    }

    public List<HotelResponseDto> searchHotels(
            UUID destinationId,
            LocalDate dateFrom,
            LocalDate dateTo,
            int adults,
            String hotelName,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            Float minRating,
            String hotelType,
            String roomType,
            String sortBy
    ) {
        if (!dateTo.isAfter(dateFrom)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateTo must be after dateFrom");
        }

        LocalDateTime start = dateFrom.atStartOfDay();
        LocalDateTime end = dateTo.atTime(23, 59, 59);
        int numberOfGuests = Math.max(1, adults);

        Map<Hotel, List<Room>> roomsByHotel = roomRepository
                .findAvailableRoomsByLocationAndDate(List.of(destinationId), start, end)
                .stream()
                .filter(room -> matchesRoomType(room, roomType))
                .collect(Collectors.groupingBy(Room::getHotel));

        List<HotelResponseDto> hotels = new ArrayList<>();
        for (Map.Entry<Hotel, List<Room>> entry : roomsByHotel.entrySet()) {
            Hotel hotel = entry.getKey();
            if (!matchesHotelName(hotel, hotelName) || !matchesHotelType(hotel, hotelType) || !matchesRating(hotel, minRating)) {
                continue;
            }

            Pair<List<Room>, BigDecimal> pair = getRoomConfigurationForAmountOfPeople(entry.getValue(), numberOfGuests);
            if (pair.getSecond().signum() == 0) {
                continue;
            }

            BigDecimal price = pair.getSecond();
            if ((minPrice != null && price.compareTo(minPrice) < 0) || (maxPrice != null && price.compareTo(maxPrice) > 0)) {
                continue;
            }

            hotels.add(HotelMapper.map(hotel, price));
        }

        return hotels.stream()
                .sorted(hotelComparator(sortBy))
                .toList();
    }

    private boolean matchesRoomType(Room room, String roomType) {
        String type = room.getRoomType() != null ? room.getRoomType() : "";
        return switch (normalizeFilter(roomType)) {
            case "DOUBLE" -> "DOUBLE".equals(type) || "SUITE".equals(type);
            case "FAMILY" -> "FAMILY".equals(type);
            default -> true;
        };
    }

    private boolean matchesHotelName(Hotel hotel, String hotelName) {
        if (hotelName == null || hotelName.isBlank()) {
            return true;
        }
        return hotel.getName() != null && hotel.getName().toLowerCase().contains(hotelName.trim().toLowerCase());
    }

    private boolean matchesRating(Hotel hotel, Float minRating) {
        return minRating == null || hotel.getRating() >= minRating;
    }

    private boolean matchesHotelType(Hotel hotel, String hotelType) {
        String normalizedType = normalizeFilter(hotelType);
        if ("ALL".equals(normalizedType)) {
            return true;
        }

        String text = ((hotel.getName() == null ? "" : hotel.getName()) + " " +
                (hotel.getDescription() == null ? "" : hotel.getDescription())).toLowerCase();
        boolean looksLikeHomestay = text.contains("民宿") || text.contains("客栈") || text.contains("公寓")
                || text.contains("homestay") || text.contains("inn") || text.contains("apartment");

        if ("HOMESTAY".equals(normalizedType)) {
            return looksLikeHomestay;
        }
        if ("HOTEL".equals(normalizedType)) {
            return !looksLikeHomestay;
        }
        return true;
    }

    private Comparator<HotelResponseDto> hotelComparator(String sortBy) {
        return switch (normalizeFilter(sortBy)) {
            case "RATING" -> Comparator.comparingDouble(HotelResponseDto::getRating).reversed()
                    .thenComparing(HotelResponseDto::getPricePerAdult);
            case "PRICE_DESC" -> Comparator.comparing(HotelResponseDto::getPricePerAdult).reversed()
                    .thenComparing(Comparator.comparingDouble(HotelResponseDto::getRating).reversed());
            default -> Comparator.comparing(HotelResponseDto::getPricePerAdult)
                    .thenComparing(Comparator.comparingDouble(HotelResponseDto::getRating).reversed());
        };
    }

    private String normalizeFilter(String value) {
        return value == null ? "ALL" : value.trim().toUpperCase();
    }

    public GetHotelDetailsResponseDto getHotelDetails(GetHotelDetailsRequestDto requestDto){
        LocalDateTime dateFrom = requestDto.getDateFrom();
        LocalDateTime dateTo = requestDto.getDateTo();

        Hotel hotel = hotelRepository.findById(requestDto.getHotelId()).orElseThrow();

        GetHotelDetailsResponseDto responseDto = GetHotelDetailsResponseDto.builder()
                .hotelId(hotel.getId())
                .description(hotel.getDescription())
                .rating(hotel.getRating())
                .hotelName(hotel.getName())
                .photos(hotel.getPhotos())
                .location(LocationMapper.map(hotel.getLocation()))
                .roomsConfigurations(new ArrayList<>())
                .build();

        int numberOfGuests = requestDto.getAdults() + requestDto.getChildrenUnderEighteen() + requestDto.getChildrenUnderTen() + requestDto.getChildrenUnderThree();
        List<Room> hotelRooms = roomRepository.findAvailableRoomsByHotelAndDate(requestDto.getHotelId(), dateFrom, dateTo);
        int HOTEL_CONFIGURATION_NUMBER = 3;
        for (int i = 0; i< HOTEL_CONFIGURATION_NUMBER; i++)
        {
            Pair<List<Room>, BigDecimal> pair = getRoomConfigurationForAmountOfPeople(hotelRooms, numberOfGuests);
            if (pair.getSecond().signum() != 0) {
                RoomsConfigurationDto roomsConfigurationDto = RoomsConfigurationDto.builder()
                        .rooms(RoomMapper.mapList(pair.getFirst()))
                        .pricePerAdult(pair.getSecond())
                        .build();
                responseDto.getRoomsConfigurations().add(roomsConfigurationDto);
                hotelRooms.removeAll(pair.getFirst());
            }
        }
        return responseDto;

    }

    public Pair<List<Room>, BigDecimal> getRoomConfigurationForAmountOfPeople(List<Room> rooms, int numberOfPeople){
        List<Room> roomConfiguration = new ArrayList<>();
        List<Room> sortedRooms = new ArrayList<>(rooms.stream()
                .sorted(Comparator.comparingInt(Room::getGuestCapacity))
                .toList());
        BigDecimal totalPrice = BigDecimal.ZERO;
        int currentPeople = 0;
        while (numberOfPeople > 0) {
            for (int i = 0; i < sortedRooms.size(); i++) {
                if (sortedRooms.get(i).getGuestCapacity() >= numberOfPeople || i == sortedRooms.size() - 1) {
                    numberOfPeople-= sortedRooms.get(i).getGuestCapacity();
                    totalPrice = totalPrice.add(sortedRooms.get(i).getPricePerAdult()
                            .multiply(BigDecimal.valueOf(sortedRooms.get(i).getGuestCapacity())));
                    currentPeople += sortedRooms.get(i).getGuestCapacity();
                    roomConfiguration.add(sortedRooms.get(i));
                    sortedRooms.remove(i);

                    break;
                }
            }
            if (sortedRooms.isEmpty()) {break;}
        }
        if (numberOfPeople <= 0) {
            BigDecimal averagePrice = totalPrice.divide(BigDecimal.valueOf(currentPeople), 2, RoundingMode.HALF_UP);
            return Pair.of(roomConfiguration, averagePrice);
        }
        return Pair.of(new ArrayList<>(), BigDecimal.ZERO.setScale(2));
    }


    public GetHotelsBySearchQueryResponseDto GetHotelsBySearchQuery(GetHotelsBySearchQueryRequestDto requestDto) {
        LocalDateTime dateFrom = requestDto.getDateFrom();
        LocalDateTime dateTo = requestDto.getDateTo();

        List<Hotel> availableHotels = new ArrayList<>();
        List<BigDecimal> pricesPerAdult = new ArrayList<>();

        List<UUID> arrivalLocationIds = requestDto.getArrivalLocationIds();

        List<Room> availableRooms = roomRepository.findAvailableRoomsByLocationAndDate(arrivalLocationIds, dateFrom, dateTo);

        int numberOfGuests = requestDto.getAdults() + requestDto.getChildrenUnderEighteen() + requestDto.getChildrenUnderTen() + requestDto.getChildrenUnderThree();
        Map<Hotel, List<Room>> roomsByHotel = availableRooms.stream()
                .collect(Collectors.groupingBy(Room::getHotel));
        for (Map.Entry<Hotel, List<Room>> entry : roomsByHotel.entrySet()) {
            Hotel hotel = entry.getKey();
            List<Room> rooms = entry.getValue();
            Pair<List<Room>, BigDecimal> pair = getRoomConfigurationForAmountOfPeople(rooms, numberOfGuests);
            if (pair.getSecond().signum() != 0) {
                availableHotels.add(hotel);
                pricesPerAdult.add(pair.getSecond());
            }
        }
        return GetHotelsBySearchQueryResponseDto.builder()
                .hotels(HotelMapper.mapList(availableHotels, pricesPerAdult))
                .build();
    }

    public boolean CheckHotelAvailability(CheckHotelAvailabilityQueryRequestDto requestDto) {
        // Step 1: Extract information from the request DTO
        LocalDateTime dateFrom = requestDto.getDateFrom();
        LocalDateTime dateTo = requestDto.getDateTo();

        Integer hotelId = requestDto.getHotelId();
        List<Long> roomIds = requestDto.getRoomReservationsIds();
        if (roomIds == null || roomIds.isEmpty()) {
            return false;
        }

        // Step 2: Retrieve the hotel from the repository
        Optional<Hotel> hotelOpt = hotelRepository.findById(hotelId);
        if (hotelOpt.isEmpty()) {
            return false;
        }

        Hotel hotel = hotelOpt.get();

        // Step 3: Filter rooms by room IDs
        List<Room> specificRooms = hotel.getRooms().stream()
                .filter(room -> roomIds.contains(room.getId()))
                .toList();

        if (specificRooms.size() != roomIds.stream().distinct().count()) {
            return false;
        }

        // Step 4: check availability of all rooms
        for (Room specificRoom :specificRooms) {
            if (!isRoomAvailable(specificRoom, dateFrom, dateTo)) { return false;}
        }

        return true;
    }

    private boolean isRoomAvailable(Room room, LocalDateTime dateFrom, LocalDateTime dateTo) {
        for (RoomReservation reservation : room.getRoomReservations()) {
            if (reservation.getDateFrom().isBefore(dateTo) && reservation.getDateTo().isAfter(dateFrom)) {
                return false;
            }
        }
        return true;
    }

    public Long generateNewRoomId() {
        return roomRepository.findMaxId() + 1;
    }

    public boolean doesRoomHaveAnyReservationsInFuture(Room room) {
        LocalDateTime date = LocalDateTime.now();
        for(RoomReservation reservation : room.getRoomReservations()) {
            if(reservation.getDateTo().isAfter(date)) return true;
        }
        return false;
    }

    public Hotel getHotel(Integer id) throws HotelNoFoundException {
        return hotelRepository.findById(id).orElseThrow(HotelNoFoundException::new);
    }

    public void createRoomFromHotel(Integer hotelId, Long roomId, String name, int guestCapacity, BigDecimal pricePerAdult,
                                    String description) {
        // hotel event projector
        RoomCreatedEvent roomCreatedEvent = RoomCreatedEvent.builder()
                .idHotel(hotelId)
                .roomId(roomId)
                .name(name)
                .guestCapacity(guestCapacity)
                .pricePerAdult(pricePerAdult)
                .description(description)
                .build();

        hotelEventProjector.project(List.of(roomCreatedEvent));
    }

    public void updateRoomFromHotel(Integer hotelId, Long roomId, String name, int guestCapacity, BigDecimal pricePerAdult,
                                    String description) {
        RoomUpdateEvent roomUpdateEvent = new RoomUpdateEvent(hotelId, roomId, name, guestCapacity, pricePerAdult, description);
        hotelEventProjector.project(List.of(roomUpdateEvent));
    }

    public Hotel updateHotel(Integer hotelId, org.microarchitecturovisco.hotelservice.model.dto.HotelDto hotelDto) {
        Hotel hotel = hotelRepository.findById(hotelId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hotel not found"));
        hotel.setName(hotelDto.getName());
        hotel.setRating(hotelDto.getRating());
        hotel.setDescription(hotelDto.getDescription());
        hotel.setPhotos(hotelDto.getPhotos());
        return hotelRepository.save(hotel);
    }

    public void deleteRoom(Long roomId) {
        Room room = roomRepository.findById(roomId).orElseThrow(RuntimeException::new);
        if (doesRoomHaveAnyReservationsInFuture(room)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Room has future reservations");
        }
        if (room.getRoomReservations() != null) {
            roomReservationRepository.deleteAll(new ArrayList<>(room.getRoomReservations()));
        }
        Hotel hotel = room.getHotel();
        if (hotel != null && hotel.getRooms() != null) {
            hotel.getRooms().removeIf(existingRoom -> existingRoom.getId().equals(roomId));
            hotelRepository.save(hotel);
        }
        roomRepository.delete(room);
    }

    public void deleteHotel(Integer hotelId) {
        Hotel hotel = hotelRepository.findById(hotelId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hotel not found"));
        boolean hasFutureReservations = hotel.getRooms() != null && hotel.getRooms().stream()
                .anyMatch(this::doesRoomHaveAnyReservationsInFuture);
        if (hasFutureReservations) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Hotel has future reservations");
        }
        hotelRepository.delete(hotel);
    }
}
