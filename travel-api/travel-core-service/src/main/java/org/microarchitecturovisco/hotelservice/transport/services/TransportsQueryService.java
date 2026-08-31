package org.microarchitecturovisco.hotelservice.transport.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.hotelservice.transport.bootstrap.util.CityCatalog;
import org.microarchitecturovisco.hotelservice.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.hotelservice.transport.model.domain.TicketType;
import org.microarchitecturovisco.hotelservice.transport.model.dto.LocationDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.TransportDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.request.GetTransportsBetweenLocationsRequestDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.request.GetTransportsBetweenMultipleLocationsRequestDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.request.GetTransportsBySearchQueryRequestDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.AvailableTransportsDepartures;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.AvailableTransportsDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.GetTransportsBetweenLocationsResponseDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.GetTransportsBySearchQueryResponseDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.TicketOfferDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.TicketOptionsDto;
import org.microarchitecturovisco.hotelservice.transport.repositories.TicketOfferTemplateRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class TransportsQueryService {

    private final TicketOfferTemplateRepository ticketOfferTemplateRepository;
    private final CityCatalog cityCatalog;

    public List<TransportDto> getAllTransports() {
        return List.of();
    }

    public AvailableTransportsDto getAvailableTransports() {
        Map<String, LocationDto> planeDepartures = new LinkedHashMap<>();
        Map<String, LocationDto> trainDepartures = new LinkedHashMap<>();
        Map<String, LocationDto> arrivals = new LinkedHashMap<>();

        ticketOfferTemplateRepository.findAll().forEach(offer -> {
            if (offer.getType() == TicketType.FLIGHT) {
                addCity(planeDepartures, offer.getDepartureCityId());
            } else if (offer.getType() == TicketType.TRAIN) {
                addCity(trainDepartures, offer.getDepartureCityId());
            }
            addCity(arrivals, offer.getArrivalCityId());
        });

        return AvailableTransportsDto.builder()
                .arrivals(new ArrayList<>(arrivals.values()))
                .departures(AvailableTransportsDepartures.builder()
                        .plane(new ArrayList<>(planeDepartures.values()))
                        .bus(List.of())
                        .train(new ArrayList<>(trainDepartures.values()))
                        .build())
                .build();
    }

    public TicketOptionsDto getTicketOptions(TicketType type) {
        List<TicketOfferTemplate> offers = ticketOfferTemplateRepository.findByTypeOrderByDepartureDateTimeAsc(type);

        return TicketOptionsDto.builder()
                .departures(offers.stream()
                        .map(offer -> cityCatalog.findByCityId(offer.getDepartureCityId()).cityName())
                        .distinct()
                        .sorted()
                        .toList())
                .arrivals(offers.stream()
                        .map(offer -> cityCatalog.findByCityId(offer.getArrivalCityId()).cityName())
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
            BigDecimal minPrice,
            BigDecimal maxPrice,
            boolean studentOnly,
            boolean onlyAvailable,
            String sortBy
    ) {
        return ticketOfferTemplateRepository
                .findByTypeAndDepartureCityIdAndArrivalCityIdAndDepartureDateTimeGreaterThanEqualAndDepartureDateTimeLessThanOrderByDepartureDateTimeAsc(
                        type,
                        cityCatalog.find(departureCity).cityId(),
                        cityCatalog.find(arrivalCity).cityId(),
                        departureDate.atStartOfDay(),
                        departureDate.plusDays(1).atStartOfDay()
                )
                .stream()
                .filter(offer -> minPrice == null || offer.getPrice().compareTo(minPrice) >= 0)
                .filter(offer -> maxPrice == null || offer.getPrice().compareTo(maxPrice) <= 0)
                .filter(offer -> !onlyAvailable || offer.getRemainingSeats() > 0)
                .sorted(ticketOfferComparator(sortBy))
                .map(this::mapTicketOffer)
                .toList();
    }

    public GetTransportsBySearchQueryResponseDto getTransportsBySearchQuery(GetTransportsBySearchQueryRequestDto requestDto) {
        return GetTransportsBySearchQueryResponseDto.builder()
                .uuid(requestDto.getUuid())
                .transportDtoList(List.of())
                .build();
    }

    public GetTransportsBetweenLocationsResponseDto getTransportsBetweenLocations(GetTransportsBetweenLocationsRequestDto requestDto) {
        return GetTransportsBetweenLocationsResponseDto.builder()
                .uuid(requestDto.getUuid())
                .transportPairs(List.of())
                .build();
    }

    public GetTransportsBetweenLocationsResponseDto getTransportsBetweenMultipleLocations(GetTransportsBetweenMultipleLocationsRequestDto requestDto) {
        return GetTransportsBetweenLocationsResponseDto.builder()
                .uuid(requestDto.getUuid())
                .transportPairs(List.of())
                .build();
    }

    private Comparator<TicketOfferTemplate> ticketOfferComparator(String sortBy) {
        return switch (sortBy == null ? "departure" : sortBy.toLowerCase()) {
            case "price" -> Comparator.comparing(TicketOfferTemplate::getPrice)
                    .thenComparing(TicketOfferTemplate::getDepartureDateTime);
            case "seats" -> Comparator.comparingInt(TicketOfferTemplate::getRemainingSeats)
                    .reversed()
                    .thenComparing(TicketOfferTemplate::getDepartureDateTime);
            default -> Comparator.comparing(TicketOfferTemplate::getDepartureDateTime)
                    .thenComparing(TicketOfferTemplate::getPrice);
        };
    }

    private TicketOfferDto mapTicketOffer(TicketOfferTemplate offer) {
        LocalDateTime departureAt = offer.getDepartureDateTime();
        LocalDateTime arrivalAt = offer.getArrivalDateTime();
        Duration duration = Duration.between(departureAt, arrivalAt);

        return TicketOfferDto.builder()
                .id(offer.getId().toString())
                .ticketOfferId(offer.getId().toString())
                .type(offer.getType().name())
                .departureCity(cityCatalog.findByCityId(offer.getDepartureCityId()).cityName())
                .arrivalCity(cityCatalog.findByCityId(offer.getArrivalCityId()).cityName())
                .departureCityId(offer.getDepartureCityId())
                .arrivalCityId(offer.getArrivalCityId())
                .departureStationCode(offer.getDepartureStationCode())
                .departureTerminalName(offer.getDepartureTerminalName())
                .departureStationName(offer.getDepartureStationName())
                .arrivalStationCode(offer.getArrivalStationCode())
                .arrivalTerminalName(offer.getArrivalTerminalName())
                .arrivalStationName(offer.getArrivalStationName())
                .departureTime(departureAt.toString())
                .arrivalTime(arrivalAt.toString())
                .duration(duration.toHours() + "h " + duration.toMinutesPart() + "m")
                .carrier(offer.getCarrier())
                .code(offer.getCode())
                .seatClass(offer.getSeatClass())
                .price(offer.getPrice())
                .remainingSeats(offer.getRemainingSeats())
                .totalSeats(offer.getTotalSeats())
                .build();
    }

    private void addCity(Map<String, LocationDto> target, String cityId) {
        if (cityId == null || cityId.isBlank() || target.containsKey(cityId)) {
            return;
        }
        CityCatalog.CityRecord city = cityCatalog.findByCityId(cityId);
        target.put(cityId, cityCatalog.locationFor(city.country(), city.cityName(), city.cityId()));
    }
}
