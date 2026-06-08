package org.microarchitecturovisco.transport.bootstrap.util;

import org.microarchitecturovisco.transport.model.dto.LocationDto;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Component
public class LocationParser {

    private static final String DOMESTIC_COUNTRY = "中国";
    private final CityCatalog cityCatalog;

    public LocationParser(CityCatalog cityCatalog) {
        this.cityCatalog = cityCatalog;
    }

    public List<LocationDto> importLocationsAbroad(Resource resource, String transportType) {
        List<LocationDto> locationDtos = new ArrayList<>();

        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine();  // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                String country = data[4];
                String region = data[5];
                String cityId = data.length > 7 ? data[7] : "";
                LocationDto locationDto = createNewLocation(locationDtos, country, region, cityId, transportType);
                if (locationDto != null) {
                    locationDtos.add(locationDto);
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return locationDtos;
    }

    public List<LocationDto> importLocationsPoland(Resource resource) {
        List<LocationDto> locationDtos = new ArrayList<>();

        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine();  // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                String region = data[1];
                String cityId = data.length > 2 ? data[2] : "";
                if (!isSelfArrangedTransport(region)) {
                    LocationDto locationDto = createNewLocation(locationDtos, DOMESTIC_COUNTRY, region, cityId, null);
                    if (locationDto != null) {
                        locationDtos.add(locationDto);
                    }
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return locationDtos;
    }

    private LocationDto createNewLocation(List<LocationDto> locationDtos, String country, String region, String cityId, String transportType) {
        if (transportType != null && transportType.equals("BUS")) {
            if (!locationAvailableByBus(country)) {
                return null;
            }
        }

        LocationDto location = cityCatalog.locationFor(country, region, cityId);
        if (locationExists(locationDtos, location.getCityId())) {
            return null;
        }

        return location;
    }

    private boolean locationExists(List<LocationDto> locationDtos, UUID cityId) {
        return locationDtos.stream()
                .anyMatch(locationDto -> locationDto.getCityId().equals(cityId));
    }

    private boolean locationAvailableByBus(String country) {
        return DOMESTIC_COUNTRY.equals(country);
    }

    private boolean isSelfArrangedTransport(String region) {
        return "自驾".equals(region) || region.startsWith("Dojazd");
    }
}
