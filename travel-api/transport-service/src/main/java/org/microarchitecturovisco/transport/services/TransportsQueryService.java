package org.microarchitecturovisco.transport.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.transport.model.domain.*;
import org.microarchitecturovisco.transport.model.dto.TransportDto;
import org.microarchitecturovisco.transport.model.dto.request.GetTransportsBetweenLocationsRequestDto;
import org.microarchitecturovisco.transport.model.dto.request.GetTransportsBetweenMultipleLocationsRequestDto;
import org.microarchitecturovisco.transport.model.dto.request.GetTransportsBySearchQueryRequestDto;
import org.microarchitecturovisco.transport.model.dto.response.AvailableTransportsDepartures;
import org.microarchitecturovisco.transport.model.dto.response.AvailableTransportsDto;
import org.microarchitecturovisco.transport.model.dto.response.GetTransportsBetweenLocationsResponseDto;
import org.microarchitecturovisco.transport.model.dto.response.GetTransportsBySearchQueryResponseDto;
import org.microarchitecturovisco.transport.model.dto.response.TicketOfferDto;
import org.microarchitecturovisco.transport.model.dto.response.TicketOptionsDto;
import org.microarchitecturovisco.transport.model.mappers.LocationMapper;
import org.microarchitecturovisco.transport.model.mappers.TransportMapper;
import org.microarchitecturovisco.transport.repositories.LocationRepository;
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.microarchitecturovisco.transport.repositories.TransportCourseRepository;
import org.microarchitecturovisco.transport.repositories.TransportEventStore;
import org.microarchitecturovisco.transport.repositories.TransportRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TransportsQueryService {

    private static final String DOMESTIC_COUNTRY = "中国";

    private final TransportCourseRepository transportCourseRepository;
    private final TicketOfferTemplateRepository ticketOfferTemplateRepository;
    private final TransportRepository transportRepository;
    private final LocationRepository locationRepository;
    private final TransportEventSourcingHandler transportEventSourcingHandler;
    private final TransportEventStore transportEventStore;

    public List<TransportDto> getAllTransports() {
        List<Transport> transports = transportRepository.findAll();
        return TransportMapper.mapList(transports);
    }

    public Transport getTransportById(UUID transportID) {
        Optional<Transport> transportOptional = transportRepository.findById(transportID);
        if (transportOptional.isPresent()) {
            return transportOptional.get();
        } else {
            System.out.println("Transport with ID " + transportID + " not found");
            return null;
        }
    }

    public List<Location> getAllLocations() {
        return locationRepository.findAll();
    }

    public Location getLocationByRegionName(String region) {
        return locationRepository.findFirstByRegionIgnoreCase(region);
    }

    public AvailableTransportsDto getAvailableTransports() {

        List<TransportCourse> transportCourses = transportCourseRepository.findAll();

        List<Location> departuresPlane = new ArrayList<>();
        List<Location> departuresBus = new ArrayList<>();
        List<Location> arrivals = new ArrayList<>();

        for (TransportCourse transportCourse : transportCourses) {
            if (transportCourse.getDepartureFrom().getCountry().equals(DOMESTIC_COUNTRY)) {
                if (transportCourse.getType().equals(TransportType.PLANE) && !departuresPlane.contains(transportCourse.getDepartureFrom())) {
                    departuresPlane.add(transportCourse.getDepartureFrom());
                }
                if (transportCourse.getType().equals(TransportType.BUS) && !departuresBus.contains(transportCourse.getDepartureFrom())) {
                    departuresBus.add(transportCourse.getDepartureFrom());
                }
                if (!arrivals.contains(transportCourse.getArrivalAt())) {
                    arrivals.add(transportCourse.getArrivalAt());
                }
            }
        }

        return buildAvailableTransports(departuresPlane, departuresBus, arrivals);
    }

    public TicketOptionsDto getTicketOptions(TicketType type) {
        List<TicketOfferTemplate> offers = ticketOfferTemplateRepository.findByTypeOrderByDepartureTimeAsc(type);

        return TicketOptionsDto.builder()
                .departures(offers.stream()
                        .map(TicketOfferTemplate::getDepartureCity)
                        .distinct()
                        .sorted()
                        .toList())
                .arrivals(offers.stream()
                        .map(TicketOfferTemplate::getArrivalCity)
                        .distinct()
                        .sorted()
                        .toList())
                .build();
    }

    public List<TicketOfferDto> searchTicketOffers(
            TicketType type,
            String departureCity,
            String arrivalCity,
            LocalDate departureDate,
            Integer minPrice,
            Integer maxPrice,
            boolean studentOnly,
            boolean onlyAvailable,
            String sortBy
    ) {
        return ticketOfferTemplateRepository
                .findByTypeAndDepartureCityAndArrivalCityOrderByDepartureTimeAsc(type, departureCity, arrivalCity)
                .stream()
                .filter(offer -> minPrice == null || offer.getPrice() >= minPrice)
                .filter(offer -> maxPrice == null || offer.getPrice() <= maxPrice)
                .filter(offer -> !studentOnly || offer.isStudentEligible())
                .filter(offer -> !onlyAvailable || offer.getRemainingSeats() > 0)
                .sorted(ticketOfferComparator(sortBy))
                .map(offer -> mapTicketOffer(offer, departureDate))
                .toList();
    }

    private Comparator<TicketOfferTemplate> ticketOfferComparator(String sortBy) {
        return switch (sortBy == null ? "departure" : sortBy.toLowerCase()) {
            case "price" -> Comparator.comparingInt(TicketOfferTemplate::getPrice)
                    .thenComparing(TicketOfferTemplate::getDepartureTime);
            case "seats" -> Comparator.comparingInt(TicketOfferTemplate::getRemainingSeats)
                    .reversed()
                    .thenComparing(TicketOfferTemplate::getDepartureTime);
            default -> Comparator.comparing(TicketOfferTemplate::getDepartureTime)
                    .thenComparingInt(TicketOfferTemplate::getPrice);
        };
    }

    private TicketOfferDto mapTicketOffer(TicketOfferTemplate offer, LocalDate departureDate) {
        Duration duration = Duration.between(offer.getDepartureTime(), offer.getArrivalTime());
        if (duration.isNegative() || duration.isZero()) {
            duration = duration.plusDays(1);
        }

        String successRate = offer.getRemainingSeats() >= 15
                ? "较高"
                : offer.getRemainingSeats() >= 5 ? "中等" : "较低";
        String notice = offer.getRemainingSeats() > 0
                ? "剩余 " + offer.getRemainingSeats() + " 张，历史样本参考价"
                : "当前样本无余票，可候补";

        return TicketOfferDto.builder()
                .id(UUID.nameUUIDFromBytes((offer.getId() + departureDate.toString()).getBytes(StandardCharsets.UTF_8)).toString())
                .type(offer.getType().name())
                .departureCity(offer.getDepartureCity())
                .arrivalCity(offer.getArrivalCity())
                .departureStation(offer.getDepartureStation())
                .arrivalStation(offer.getArrivalStation())
                .departureTime(offer.getDepartureTime().toString())
                .arrivalTime(offer.getArrivalTime().toString())
                .duration(duration.toHours() + "时" + duration.toMinutesPart() + "分")
                .carrier(offer.getCarrier())
                .code(offer.getCode())
                .seatClass(offer.getSeatClass())
                .price(offer.getPrice())
                .remainingSeats(offer.getRemainingSeats())
                .studentEligible(offer.isStudentEligible())
                .successRate(successRate)
                .notice(notice)
                .departureDate(departureDate)
                .referenceDate(offer.getReferenceDate())
                .sourceUrl(offer.getSourceUrl())
                .sourceNote(offer.getSourceNote())
                .build();
    }

    public AvailableTransportsDto buildAvailableTransports(
            List<Location> departuresPlane,
            List<Location> departuresBus,
            List<Location> arrivals
    ) {
        return AvailableTransportsDto.builder()
                .arrivals(LocationMapper.mapList(arrivals))
                .departures(AvailableTransportsDepartures.builder()
                        .plane(LocationMapper.mapList(departuresPlane))
                        .bus(LocationMapper.mapList(departuresBus))
                        .build())
                .build();
    }

    public GetTransportsBySearchQueryResponseDto getTransportsBySearchQuery(GetTransportsBySearchQueryRequestDto requestDto) {

        List<Transport> transports;
        if (requestDto.getDateFrom() != null && requestDto.getDateTo() != null) {
            transports = transportRepository.findByDepartureDateGreaterThanEqualAndDepartureDateLessThanEqual(
                    requestDto.getDateFrom(),
                    requestDto.getDateTo()
            );
        } else {
            transports = transportRepository.findAll();
        }

        List<Transport> filteredTransports = new ArrayList<>();

        List<UUID> mergedDepartureLocationIds = new ArrayList<>();
        if (requestDto.getDepartureLocationIdsByPlane() != null) {
            mergedDepartureLocationIds.addAll(requestDto.getDepartureLocationIdsByPlane());
        }
        if (requestDto.getDepartureLocationIdsByBus() != null) {
            mergedDepartureLocationIds.addAll(requestDto.getDepartureLocationIdsByBus());
        }

        for (Transport transport : transports) {
            if ((requestDto.getDateFrom() != null || requestDto.getDateTo() != null) &&
                    (transport.getDepartureDate().isBefore(requestDto.getDateFrom()) || transport.getDepartureDate().isAfter(requestDto.getDateTo()))) {
                continue;
            }

            if ((requestDto.getAdults() != null || requestDto.getChildrenUnderTen() != null || requestDto.getChildrenUnderThree() != null || requestDto.getChildrenUnderEighteen() != null ) &&
                    !canTransportAccommodateRequestedPeople(transport, requestDto.getAdults(), requestDto.getChildrenUnderTen(), requestDto.getChildrenUnderEighteen())) {
                continue;
            }

            if (!mergedDepartureLocationIds.isEmpty() && !mergedDepartureLocationIds.contains(transport.getCourse().getDepartureFrom().getId())) {
                continue;
            }

            if (requestDto.getArrivalLocationIds() != null &&
                    !requestDto.getArrivalLocationIds().isEmpty() &&
                    !requestDto.getArrivalLocationIds().contains(transport.getCourse().getArrivalAt().getId())) {
                continue;
            }

            filteredTransports.add(transport);
        }

        return GetTransportsBySearchQueryResponseDto.builder()
                .uuid(requestDto.getUuid())
                .transportDtoList(
                        TransportMapper.mapList(filteredTransports)
                ).build();
    }

    public GetTransportsBetweenLocationsResponseDto getTransportsBetweenLocations(GetTransportsBetweenLocationsRequestDto requestDto) {
        LocalDateTime dateFrom = requestDto.getDateFrom()
                .minusHours(requestDto.getDateFrom().getHour())
                .minusMinutes(requestDto.getDateFrom().getMinute());
        LocalDateTime dateTo = requestDto.getDateTo()
                .minusHours(requestDto.getDateTo().getHour())
                .minusMinutes(requestDto.getDateTo().getMinute());

        GetTransportsBySearchQueryResponseDto departureDayTransportsResponse = getTransportsBySearchQuery(GetTransportsBySearchQueryRequestDto.builder()
                .uuid(requestDto.getUuid())
                .dateFrom(dateFrom)
                .dateTo(dateFrom.plusHours(23).plusMinutes(59))
                .adults(requestDto.getAdults())
                .childrenUnderEighteen(requestDto.getChildrenUnderEighteen())
                .childrenUnderTen(requestDto.getChildrenUnderTen())
                .childrenUnderThree(requestDto.getChildrenUnderThree())
                .departureLocationIdsByPlane(requestDto.getTransportType() == TransportType.PLANE ? List.of(requestDto.getDepartureLocationId()) : List.of())
                .departureLocationIdsByBus(requestDto.getTransportType() == TransportType.BUS ? List.of(requestDto.getDepartureLocationId()) : List.of())
                .arrivalLocationIds(List.of(requestDto.getArrivalLocationId()))
                .build()
        );

        GetTransportsBySearchQueryResponseDto arrivalDayTransportsResponse = getTransportsBySearchQuery(GetTransportsBySearchQueryRequestDto.builder()
                .uuid(requestDto.getUuid())
                .dateFrom(dateTo)
                .dateTo(dateTo.plusHours(23).plusMinutes(59))
                .adults(requestDto.getAdults())
                .childrenUnderEighteen(requestDto.getChildrenUnderEighteen())
                .childrenUnderTen(requestDto.getChildrenUnderTen())
                .childrenUnderThree(requestDto.getChildrenUnderThree())
                .departureLocationIdsByPlane(requestDto.getTransportType() == TransportType.PLANE ? List.of(requestDto.getArrivalLocationId()) : List.of())
                .departureLocationIdsByBus(requestDto.getTransportType() == TransportType.BUS ? List.of(requestDto.getArrivalLocationId()) : List.of())
                .arrivalLocationIds(List.of(requestDto.getDepartureLocationId()))
                .build()
        );

        List<List<TransportDto>> transportPairs = new ArrayList<>();

        for (TransportDto departureDto : departureDayTransportsResponse.getTransportDtoList()) {
            for (TransportDto arrivalDto : arrivalDayTransportsResponse.getTransportDtoList()) {
                if (departureDto.getTransportCourse().getDepartureFromLocation().equals(arrivalDto.getTransportCourse().getArrivalAtLocation())  &&
                        departureDto.getTransportCourse().getArrivalAtLocation().equals(arrivalDto.getTransportCourse().getDepartureFromLocation()) &&
                        departureDto.getTransportCourse().getType().equals(arrivalDto.getTransportCourse().getType())
                ) {
                    transportPairs.add(List.of(departureDto, arrivalDto));
                    break;
                }
            }
        }

        return GetTransportsBetweenLocationsResponseDto.builder()
                .uuid(requestDto.getUuid())
                .transportPairs(transportPairs)
                .build();
    }

    public GetTransportsBetweenLocationsResponseDto getTransportsBetweenMultipleLocations(GetTransportsBetweenMultipleLocationsRequestDto requestDto) {
        LocalDateTime dateFrom = requestDto.getDateFrom()
                .minusHours(requestDto.getDateFrom().getHour())
                .minusMinutes(requestDto.getDateFrom().getMinute());
        LocalDateTime dateTo = requestDto.getDateTo()
                .minusHours(requestDto.getDateTo().getHour())
                .minusMinutes(requestDto.getDateTo().getMinute());

        GetTransportsBySearchQueryResponseDto departureDayTransportsResponse = getTransportsBySearchQuery(GetTransportsBySearchQueryRequestDto.builder()
                .uuid(requestDto.getUuid())
                .dateFrom(dateFrom)
                .dateTo(dateFrom.plusHours(23).plusMinutes(59))
                .adults(requestDto.getAdults())
                .childrenUnderEighteen(requestDto.getChildrenUnderEighteen())
                .childrenUnderTen(requestDto.getChildrenUnderTen())
                .childrenUnderThree(requestDto.getChildrenUnderThree())
                .departureLocationIdsByPlane(requestDto.getDepartureLocationIds())
                .departureLocationIdsByBus(List.of())
                .arrivalLocationIds(requestDto.getArrivalLocationIds())
                .build()
        );

        GetTransportsBySearchQueryResponseDto arrivalDayTransportsResponse = getTransportsBySearchQuery(GetTransportsBySearchQueryRequestDto.builder()
                .uuid(requestDto.getUuid())
                .dateFrom(dateTo)
                .dateTo(dateTo.plusHours(23).plusMinutes(59))
                .adults(requestDto.getAdults())
                .childrenUnderEighteen(requestDto.getChildrenUnderEighteen())
                .childrenUnderTen(requestDto.getChildrenUnderTen())
                .childrenUnderThree(requestDto.getChildrenUnderThree())
                .departureLocationIdsByPlane(requestDto.getArrivalLocationIds())
                .departureLocationIdsByBus(List.of())
                .arrivalLocationIds(requestDto.getDepartureLocationIds())
                .build()
        );

        List<List<TransportDto>> transportPairs = new ArrayList<>();

        for (TransportDto departureDto : departureDayTransportsResponse.getTransportDtoList()) {
            for (TransportDto arrivalDto : arrivalDayTransportsResponse.getTransportDtoList()) {
                if (departureDto.getTransportCourse().getDepartureFromLocation().equals(arrivalDto.getTransportCourse().getArrivalAtLocation())  &&
                        departureDto.getTransportCourse().getArrivalAtLocation().equals(arrivalDto.getTransportCourse().getDepartureFromLocation()) &&
                        departureDto.getTransportCourse().getType().equals(arrivalDto.getTransportCourse().getType())
                ) {
                    transportPairs.add(List.of(departureDto, arrivalDto));
                    break;
                }
            }
        }

        return GetTransportsBetweenLocationsResponseDto.builder()
                .uuid(requestDto.getUuid())
                .transportPairs(transportPairs)
                .build();
    }

    public boolean canTransportAccommodateRequestedPeople(
            Transport transport,
            Integer adults,
            Integer childrenUnderTen,
            Integer childrenUnderEighteen) {
        return transport.getCapacity() - getTransportOccupiedSeats(transport) - adults - childrenUnderTen - childrenUnderEighteen >= 0;
    }

    public Integer getTransportOccupiedSeats(Transport transport) {
        return transport.getTransportReservations()
                .stream()
                .mapToInt(TransportReservation::getNumberOfSeats)
                .sum();
    }



}
