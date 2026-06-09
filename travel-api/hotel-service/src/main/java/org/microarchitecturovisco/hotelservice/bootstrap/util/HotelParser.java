package org.microarchitecturovisco.hotelservice.bootstrap.util;


import org.microarchitecturovisco.hotelservice.model.dto.HotelDto;
import org.microarchitecturovisco.hotelservice.model.dto.LocationDto;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.*;
import java.util.logging.Logger;

@Component
public class HotelParser {

    public List<HotelDto> importHotels(Resource hotelCsvFilePath, Resource hotelPhotosCsvFilePath, List<LocationDto> hotelLocations) throws IOException {
        Logger logger = Logger.getLogger("HotelDataParser");

        // Load and parse the photos CSV file
        PhotoParser photoParser = new PhotoParser();
        photoParser.importPhotos(hotelPhotosCsvFilePath);

        List<HotelDto> hotelDtos = new ArrayList<>();

        // Read the hotel CSV file and create hotel DTOs
        try (BufferedReader br = new BufferedReader(new InputStreamReader( hotelCsvFilePath.getInputStream() ))) {
            String line;
            br.readLine();  // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                HotelDto hotelDto = createHotelDto(data, photoParser, hotelLocations);
                hotelDtos.add(hotelDto);
            }
        } catch (IOException e) {
            logger.severe("Error reading hotel CSV file: " + e.getMessage());
            throw e;
        }

        return hotelDtos;
    }

    private HotelDto createHotelDto(String[] data, PhotoParser photoParser, List<LocationDto> hotelLocations) {
        int hotelScrappedId = Integer.parseInt(data[0]);
        String name = data[1];
        String description = data[2];
        Integer hotelId = hotelScrappedId;
        String cityId = data[3];

        // Find the LocationDto in the list
        LocationDto location = findLocation(hotelLocations, cityId);
        List<String> photos = photoParser.hotelPhotosMap.getOrDefault(hotelScrappedId, Collections.emptyList());

        return HotelDto.builder()
                .hotelId(hotelId)
                .name(name)
                .description(description)
                .rating(0)
                .location(location)
                .photos(photos)
                .rooms(new ArrayList<>())
                .build();
    }

    private LocationDto findLocation(List<LocationDto> locationDtos, String cityId) {
        return locationDtos.stream()
                .filter(locationDto -> locationDto.getCityId().equals(cityId))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("Location not found for cityId: " + cityId));
    }
}
