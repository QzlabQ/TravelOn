package org.microarchitecturovisco.hotelservice.bootstrap.util;

import org.microarchitecturovisco.hotelservice.model.dto.LocationDto;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

@Component
public class LocationParser {
    private final CityCatalog cityCatalog;

    public LocationParser(CityCatalog cityCatalog) {
        this.cityCatalog = cityCatalog;
    }

    public List<LocationDto> importLocations(Resource resource) {
        List<LocationDto> locationDtos = new ArrayList<>();

        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine();  // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                String cityId = data[5];
                LocationDto locationDto = createNewLocation(locationDtos, cityId);
                if (locationDto != null) {
                    locationDtos.add(locationDto);
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return locationDtos;
    }


    private LocationDto createNewLocation(List<LocationDto> locationDtos, String cityId) {
        LocationDto location = cityCatalog.locationForCityId(cityId);
        if (locationExists(locationDtos, location.getCityId())) {
            return null;
        }

        return location;
    }

    private boolean locationExists(List<LocationDto> locationDtos, String cityId) {
        return locationDtos.stream()
                .anyMatch(locationDto -> locationDto.getCityId().equals(cityId));
    }
}
