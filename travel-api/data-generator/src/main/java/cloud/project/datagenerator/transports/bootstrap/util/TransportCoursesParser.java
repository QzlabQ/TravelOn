package cloud.project.datagenerator.transports.bootstrap.util;

import cloud.project.datagenerator.transports.domain.Location;
import cloud.project.datagenerator.transports.domain.TransportCourse;
import cloud.project.datagenerator.transports.domain.TransportType;
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

    public Map<String, List<TransportCourse>> createTransportCourses(
            Resource hotelCsvFile,
            Resource hotelDepartureOptionsCsvFile,
            List<Location> busArrivalLocations,
            List<Location> planeArrivalLocations,
            List<Location> departureLocations
    ) {
        List<TransportCourse> planeCourses = new ArrayList<>();
        List<TransportCourse> busCourses = new ArrayList<>();

        Map<Integer, List<String>> departureCitiesMap = readDepartureCities(hotelDepartureOptionsCsvFile);
        Map<Integer, Location> hotelLocationMap = readHotelLocations(hotelCsvFile, planeArrivalLocations);

        Set<String> planeConnections = new HashSet<>();
        Set<String> busConnections = new HashSet<>();

        createPlaneConnections(planeCourses, departureCitiesMap, hotelLocationMap, departureLocations, planeConnections);
        createBusConnections(busCourses, departureCitiesMap, hotelLocationMap, busArrivalLocations, departureLocations, busConnections);

        Map<String, List<TransportCourse>> transportCoursesMap = new HashMap<>();
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

    private Map<Integer, Location> readHotelLocations(Resource resource, List<Location> planeArrivalLocations) {
        Map<Integer, Location> hotelLocationMap = new HashMap<>();

        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine(); // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split("\t");
                int hotelId = Integer.parseInt(data[0]);
                String country = data[4];
                String region = data[5];

                Location hotelLocation = findMatchingLocation(country, region, planeArrivalLocations);
                hotelLocationMap.put(hotelId, hotelLocation);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return hotelLocationMap;
    }

    private Location findMatchingLocation(String country, String region, List<Location> locations) {
        return locations.stream()
                .filter(location -> location.getCountry().equals(country) && location.getRegion().equals(region))
                .findFirst()
                .orElse(null);
    }

    private void createPlaneConnections(
            List<TransportCourse> planeCourses,
            Map<Integer, List<String>> departureCitiesMap,
            Map<Integer, Location> hotelLocationMap,
            List<Location> departureLocations,
            Set<String> planeConnections
    ) {
        for (Map.Entry<Integer, List<String>> entry : departureCitiesMap.entrySet()) {
            int hotelId = entry.getKey();
            List<String> departureCities = entry.getValue();

            if (hotelLocationMap.containsKey(hotelId)) {
                Location hotelLocation = hotelLocationMap.get(hotelId);

                for (String departureCity : departureCities) {
                    Location departureLocation = findMatchingLocation(DOMESTIC_COUNTRY, departureCity, departureLocations);

                    if (departureLocation != null) {
                        String connectionKey = departureLocation.getRegion() + "-" + hotelLocation.getRegion();

                        if (!planeConnections.contains(connectionKey)) {
                            UUID planeConnectionArriveId = UUID.nameUUIDFromBytes((departureLocation.getId().toString() + hotelLocation.getId().toString() + TransportType.PLANE + String.valueOf(100)).getBytes());
                            planeCourses.add(TransportCourse.builder()
                                    .id(planeConnectionArriveId)
                                    .departureFrom(departureLocation)
                                    .arrivalAt(hotelLocation)
                                    .type(TransportType.PLANE)
                                    .build());

                            UUID planeConnectionReturnId = UUID.nameUUIDFromBytes((departureLocation.getId().toString() + hotelLocation.getId().toString() + TransportType.PLANE + String.valueOf(200)).getBytes());
                            planeCourses.add(TransportCourse.builder()
                                    .id(planeConnectionReturnId)
                                    .departureFrom(hotelLocation)
                                    .arrivalAt(departureLocation)
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
            List<TransportCourse> busCourses,
            Map<Integer, List<String>> departureCitiesMap,
            Map<Integer, Location> hotelLocationMap,
            List<Location> busArrivalLocations,
            List<Location> departureLocations,
            Set<String> busConnections
    ) {
        for (Map.Entry<Integer, List<String>> entry : departureCitiesMap.entrySet()) {
            int hotelId = entry.getKey();
            List<String> departureCities = entry.getValue();

            if (hotelLocationMap.containsKey(hotelId)) {
                Location hotelLocation = hotelLocationMap.get(hotelId);

                for (String departureCity : departureCities) {
                    for (Location departureLocation : departureLocations) {
                        String connectionKey = departureLocation.getRegion() + "-" + hotelLocation.getRegion();

                        if (!busConnections.contains(connectionKey) && departureLocation.getRegion().equals(departureCity)) {
                            for (Location busArrivalLocation : busArrivalLocations) {
                                if (busArrivalLocation.getRegion().equals(hotelLocation.getRegion())) {
                                    UUID busConnectionArriveId = UUID.nameUUIDFromBytes((departureLocation.getId().toString() + hotelLocation.getId().toString() + TransportType.BUS + String.valueOf(100)).getBytes());
                                    busCourses.add(TransportCourse.builder()
                                            .id(busConnectionArriveId)
                                            .departureFrom(departureLocation)
                                            .arrivalAt(hotelLocation)
                                            .type(TransportType.BUS)
                                            .build());

                                    UUID bussConnectionReturnId = UUID.nameUUIDFromBytes((departureLocation.getId().toString() + hotelLocation.getId().toString() + TransportType.BUS + String.valueOf(200)).getBytes());
                                    busCourses.add(TransportCourse.builder()
                                            .id(bussConnectionReturnId)
                                            .departureFrom(hotelLocation)
                                            .arrivalAt(departureLocation)
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
