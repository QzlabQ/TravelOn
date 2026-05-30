package org.microarchitecturovisco.transport.bootstrap.util;

import org.microarchitecturovisco.transport.model.domain.TransportType;
import org.microarchitecturovisco.transport.model.dto.LocationDto;
import org.microarchitecturovisco.transport.model.dto.TransportCourseDto;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;
import java.util.UUID;

@Component
public class TransportCoursesParser {

    private static final String DOMESTIC_COUNTRY = "中国";

    public Map<String, List<TransportCourseDto>> createTransportCourses(
            Resource hotelCsvFile,
            Resource hotelDepartureOptionsCsvFile,
            List<LocationDto> busArrivalLocations,
            List<LocationDto> planeArrivalLocations,
            List<LocationDto> departureLocations
    ) {
        List<TransportCourseDto> planeCourses = new ArrayList<>();
        List<TransportCourseDto> busCourses = new ArrayList<>();

        Map<Integer, List<String>> departureCitiesMap = readDepartureCities(hotelDepartureOptionsCsvFile);
        Map<Integer, LocationDto> hotelLocationMap = readHotelLocations(hotelCsvFile, planeArrivalLocations);

        Set<String> planeConnections = new HashSet<>();
        Set<String> busConnections = new HashSet<>();

        createPlaneConnections(planeCourses, departureCitiesMap, hotelLocationMap, departureLocations, planeConnections);
        createBusConnections(busCourses, departureCitiesMap, hotelLocationMap, busArrivalLocations, departureLocations, busConnections);

        Map<String, List<TransportCourseDto>> transportCoursesMap = new HashMap<>();
        transportCoursesMap.put("PLANE", planeCourses);
        transportCoursesMap.put("BUS", busCourses);

        return transportCoursesMap;
    }

    private Map<Integer, List<String>> readDepartureCities(Resource resource) {
        Map<Integer, List<String>> departureCitiesMap = new HashMap<>();

        try (Scanner scanner = new Scanner(new InputStreamReader(resource.getInputStream()))) {
            scanner.nextLine(); // Skip header line

            while (scanner.hasNextLine()) {
                String line = scanner.nextLine();
                String[] data = line.split("\t");
                int hotelId = Integer.parseInt(data[0]);
                String departureCity = data[1];

                if (!isSelfArrangedTransport(departureCity)) {
                    List<String> departureCities = departureCitiesMap.getOrDefault(hotelId, new ArrayList<>());
                    departureCities.add(departureCity);
                    departureCitiesMap.put(hotelId, departureCities);
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return departureCitiesMap;
    }

    private Map<Integer, LocationDto> readHotelLocations(Resource resource, List<LocationDto> planeArrivalLocations) {
        Map<Integer, LocationDto> hotelLocationMap = new HashMap<>();

        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine(); // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                int hotelId = Integer.parseInt(data[0]);
                String country = data[4];
                String region = data[5];

                LocationDto hotelLocation = findMatchingLocation(country, region, planeArrivalLocations);
                hotelLocationMap.put(hotelId, hotelLocation);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return hotelLocationMap;
    }

    private LocationDto findMatchingLocation(String country, String region, List<LocationDto> locations) {
        return locations.stream()
                .filter(location -> location.getCountry().equals(country) && location.getRegion().equals(region))
                .findFirst()
                .orElse(null);
    }

    private void createPlaneConnections(
            List<TransportCourseDto> planeCourses,
            Map<Integer, List<String>> departureCitiesMap,
            Map<Integer, LocationDto> hotelLocationMap,
            List<LocationDto> departureLocations,
            Set<String> planeConnections
    ) {
        for (Map.Entry<Integer, List<String>> entry : departureCitiesMap.entrySet()) {
            int hotelId = entry.getKey();
            List<String> departureCities = entry.getValue();

            if (hotelLocationMap.containsKey(hotelId)) {
                LocationDto hotelLocation = hotelLocationMap.get(hotelId);

                for (String departureCity : departureCities) {
                    LocationDto departureLocation = findMatchingLocation(DOMESTIC_COUNTRY, departureCity, departureLocations);

                    if (departureLocation != null) {
                        String connectionKey = departureLocation.getRegion() + "-" + hotelLocation.getRegion();

                        if (!planeConnections.contains(connectionKey)) {
                            UUID planeConnectionArriveId = UUID.nameUUIDFromBytes((departureLocation.getIdLocation().toString() + hotelLocation.getIdLocation().toString() + TransportType.PLANE + String.valueOf(100)).getBytes());
                            planeCourses.add(TransportCourseDto.builder()
                                    .idTransportCourse(planeConnectionArriveId)
                                    .departureFromLocation(departureLocation)
                                    .arrivalAtLocation(hotelLocation)
                                    .type(TransportType.PLANE)
                                    .build());

                            UUID planeConnectionReturnId = UUID.nameUUIDFromBytes((departureLocation.getIdLocation().toString() + hotelLocation.getIdLocation().toString() + TransportType.PLANE + String.valueOf(200)).getBytes());
                            planeCourses.add(TransportCourseDto.builder()
                                    .idTransportCourse(planeConnectionReturnId)
                                    .departureFromLocation(hotelLocation)
                                    .arrivalAtLocation(departureLocation)
                                    .type(TransportType.PLANE)
                                    .build());

                            planeConnections.add(connectionKey);
                        }
                    }
                }
            }
        }
    }

    private void createBusConnections(
            List<TransportCourseDto> busCourses,
            Map<Integer, List<String>> departureCitiesMap,
            Map<Integer, LocationDto> hotelLocationMap,
            List<LocationDto> busArrivalLocations,
            List<LocationDto> departureLocations,
            Set<String> busConnections
    ) {
        for (Map.Entry<Integer, List<String>> entry : departureCitiesMap.entrySet()) {
            int hotelId = entry.getKey();
            List<String> departureCities = entry.getValue();

            if (hotelLocationMap.containsKey(hotelId)) {
                LocationDto hotelLocation = hotelLocationMap.get(hotelId);

                for (String departureCity : departureCities) {
                    for (LocationDto departureLocation : departureLocations) {
                        String connectionKey = departureLocation.getRegion() + "-" + hotelLocation.getRegion();

                        if (!busConnections.contains(connectionKey) && departureLocation.getRegion().equals(departureCity)) {
                            for (LocationDto busArrivalLocation : busArrivalLocations) {
                                if (busArrivalLocation.getRegion().equals(hotelLocation.getRegion())) {
                                    UUID busConnectionArriveId = UUID.nameUUIDFromBytes((departureLocation.getIdLocation().toString() + hotelLocation.getIdLocation().toString() + TransportType.BUS + String.valueOf(100)).getBytes());
                                    busCourses.add(TransportCourseDto.builder()
                                            .idTransportCourse(busConnectionArriveId)
                                            .departureFromLocation(departureLocation)
                                            .arrivalAtLocation(hotelLocation)
                                            .type(TransportType.BUS)
                                            .build());

                                    UUID bussConnectionReturnId = UUID.nameUUIDFromBytes((departureLocation.getIdLocation().toString() + hotelLocation.getIdLocation().toString() + TransportType.BUS + String.valueOf(200)).getBytes());
                                    busCourses.add(TransportCourseDto.builder()
                                            .idTransportCourse(bussConnectionReturnId)
                                            .departureFromLocation(hotelLocation)
                                            .arrivalAtLocation(departureLocation)
                                            .type(TransportType.BUS)
                                            .build());

                                    busConnections.add(connectionKey);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private boolean isSelfArrangedTransport(String departureCity) {
        return "自驾".equals(departureCity) || departureCity.startsWith("Dojazd");
    }
}
