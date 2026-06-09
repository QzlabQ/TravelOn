package org.microarchitecturovisco.transport.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.transport.bootstrap.util.CityCatalog;
import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.model.domain.TicketType;
import org.microarchitecturovisco.transport.model.dto.LocationDto;
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
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TransportsQueryService {

    private final TicketOfferTemplateRepository ticketOfferTemplateRepository;
    private final CityCatalog cityCatalog;

    public List<TransportDto> getAllTransports() {
        return List.of();
    }

    public LocationDto getLocationByRegionName(String region) {
        CityCatalog.CityRecord city = cityCatalog.find(region);
        return cityCatalog.locationFor(city.country(), city.cityName(), city.cityId());
    }

    public List<LocationDto> getAllLocations() {
        Map<String, LocationDto> deduplicated = new LinkedHashMap<>();
        ticketOfferTemplateRepository.findAll().forEach(offer -> {
            addCity(deduplicated, offer.getDepartureCityId());
            addCity(deduplicated, offer.getArrivalCityId());
        });
        return new ArrayList<>(deduplicated.values());
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
            Integer minPrice,
            Integer maxPrice,
            boolean studentOnly,
            boolean onlyAvailable,
            String sortBy
    ) {
        return ticketOfferTemplateRepository
                .findByTypeAndDepartureCityIdAndArrivalCityIdOrderByDepartureDateTimeAsc(
                        type,
                        cityCatalog.find(departureCity).cityId(),
                        cityCatalog.find(arrivalCity).cityId()
                )
                .stream()
                .filter(offer -> minPrice == null || offer.getPrice() >= minPrice)
                .filter(offer -> maxPrice == null || offer.getPrice() <= maxPrice)
                .filter(offer -> !onlyAvailable || offer.getRemainingSeats() > 0)
                .sorted(ticketOfferComparator(sortBy))
                .map(offer -> mapTicketOffer(offer, departureDate))
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
            case "price" -> Comparator.comparingInt(TicketOfferTemplate::getPrice)
                    .thenComparing(TicketOfferTemplate::getDepartureDateTime);
            case "seats" -> Comparator.comparingInt(TicketOfferTemplate::getRemainingSeats)
                    .reversed()
                    .thenComparing(TicketOfferTemplate::getDepartureDateTime);
            default -> Comparator.comparing(TicketOfferTemplate::getDepartureDateTime)
                    .thenComparingInt(TicketOfferTemplate::getPrice);
        };
    }

    private TicketOfferDto mapTicketOffer(TicketOfferTemplate offer, LocalDate departureDate) {
        Duration duration = Duration.between(offer.getDepartureDateTime(), offer.getArrivalDateTime());

        String successRate = offer.getRemainingSeats() >= 15
                ? "杈冮珮"
                : offer.getRemainingSeats() >= 5 ? "涓瓑" : "杈冧綆";
        String notice = offer.getRemainingSeats() > 0
                ? "鍓╀綑 " + offer.getRemainingSeats() + " 寮狅紝鍘嗗彶鏍锋湰鍙傝€冧环"
                : "褰撳墠鏍锋湰鏃犱綑绁紝鍙€欒ˉ";

        return TicketOfferDto.builder()
                .id(UUID.nameUUIDFromBytes((offer.getId().toString() + departureDate).getBytes(StandardCharsets.UTF_8)).toString())
                .type(offer.getType().name())
                .departureCity(cityCatalog.findByCityId(offer.getDepartureCityId()).cityName())
                .arrivalCity(cityCatalog.findByCityId(offer.getArrivalCityId()).cityName())
                .departureCityId(offer.getDepartureCityId())
                .arrivalCityId(offer.getArrivalCityId())
                .departureStationCode(offer.getDepartureStationCode())
                .departureTerminalName(offer.getDepartureTerminalName())
                .arrivalStationCode(offer.getArrivalStationCode())
                .arrivalTerminalName(offer.getArrivalTerminalName())
                .departureTime(offer.getDepartureDateTime().toString())
                .arrivalTime(offer.getArrivalDateTime().toString())
                .duration(duration.toHours() + "h " + duration.toMinutesPart() + "m")
                .carrier(offer.getCarrier())
                .code(offer.getCode())
                .seatClass(offer.getSeatClass())
                .price(offer.getPrice())
                .remainingSeats(offer.getRemainingSeats())
                .totalSeats(offer.getTotalSeats())
                .successRate(successRate)
                .notice(notice)
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
