package cloud.project.datagenerator.transports.bootstrap.util;

import cloud.project.datagenerator.transports.domain.Location;
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

    public List<Location> importLocationsAbroad(Resource resource, String transportType) {
        List<Location> locations = new ArrayList<>();

        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine();  // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                String country = data[4];
                String region = data[5];
                Location locationDto = createNewLocation(locations, country, region, transportType);
                if (locationDto != null) {
                    locations.add(locationDto);
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return locations;
    }

    public List<Location> importLocationsPoland(Resource resource) {
        List<Location> locations = new ArrayList<>();

        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine();  // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                String region = data[1];
                if (!isSelfArrangedTransport(region)) {
                    Location locationDto = createNewLocation(locations, DOMESTIC_COUNTRY, region, null);
                    if (locationDto != null) {
                        locations.add(locationDto);
                    }
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return locations;
    }

    private Location createNewLocation(List<Location> locations, String country, String region, String transportType) {
        if (transportType != null && transportType.equals("BUS")) {
            if (!locationAvailableByBus(country)) {
                return null;
            }
        }

        if (locationExists(locations, country, region)) {
            return null;
        }

        return Location.builder()
                .id(UUID.nameUUIDFromBytes((country + region).getBytes()))
                .country(country)
                .region(region)
                .build();
    }

    private boolean locationExists(List<Location> locations, String country, String region) {
        return locations.stream()
                .anyMatch(locationDto -> locationDto.getCountry().equals(country) && locationDto.getRegion().equals(region));
    }

    private boolean locationAvailableByBus(String country) {
        return DOMESTIC_COUNTRY.equals(country);
    }

    private boolean isSelfArrangedTransport(String region) {
        return "自驾".equals(region) || region.startsWith("Dojazd");
    }
}
