package org.microarchitecturovisco.hotelservice.bootstrap.util;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.hotelservice.bootstrap.util.hotel.HotelCsvReader;
import org.microarchitecturovisco.hotelservice.model.dto.HotelDto;
import org.microarchitecturovisco.hotelservice.model.dto.RoomDto;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.*;
import java.util.List;
import java.util.Optional;
import java.util.logging.Logger;

@Component
@RequiredArgsConstructor
public class RoomParser {

    private final HotelCsvReader hotelCsvReader;

    public void importRooms(Resource resource, List<HotelDto> hotelDtos) {
        Logger logger = Logger.getLogger("Bootstrap | Rooms");
        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine(); // Skip header line
            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                RoomDto roomDto = createNewRoom(logger, data, hotelDtos);

                // Add room to the corresponding hotel
                if (roomDto != null) {
                    Optional<HotelDto> hotelOpt = hotelDtos.stream()
                            .filter(hotel -> hotel.getHotelId().equals(roomDto.getHotelId()))
                            .findFirst();
                    hotelOpt.ifPresent(hotel -> hotel.getRooms().add(roomDto));
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private RoomDto createNewRoom(Logger logger, String[] data, List<HotelDto> hotelDtos) throws FileNotFoundException {
        int hotelId      = Integer.parseInt(data[0]);
        String roomName  = data[1];
        String description = data[2];
        float pricePerAdult = Float.parseFloat(data[3]);
        Long roomId      = Long.parseLong(data[4].trim());
        int guestCapacity = data.length > 5 && !data[5].isBlank() ? Integer.parseInt(data[5].trim()) : 2;
        String roomType  = data.length > 6 && !data[6].isBlank() ? data[6].trim() : "STANDARD";

        Optional<HotelDto> hotelOpt = searchForHotel(hotelDtos, hotelId);

        if (hotelOpt.isPresent()) {
            return RoomDto.builder()
                    .roomId(roomId)
                    .hotelId(hotelOpt.get().getHotelId())
                    .name(roomName)
                    .description(description)
                    .guestCapacity(guestCapacity)
                    .roomType(roomType)
                    .pricePerAdult(pricePerAdult)
                    .build();
        } else {
            logger.info("Hotel not found for room with ID: " + hotelId);
            return null;
        }
    }

    private Optional<HotelDto> searchForHotel(List<HotelDto> hotelDtos, int hotelId) throws FileNotFoundException {
        // Retrieve hotel name from hotels.csv based on hotelId
        String hotelName = hotelCsvReader.getHotelNameById(hotelId);

        // Check if the hotel exists in the provided list
        Optional<HotelDto> hotelOpt = hotelDtos.stream()
                .filter(hotel -> hotel.getName().equals(hotelName))
                .findFirst();
        return hotelOpt;
    }

}
