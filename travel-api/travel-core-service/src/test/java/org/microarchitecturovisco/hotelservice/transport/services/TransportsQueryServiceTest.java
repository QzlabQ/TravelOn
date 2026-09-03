package org.microarchitecturovisco.hotelservice.transport.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.hotelservice.transport.bootstrap.util.CityCatalog;
import org.microarchitecturovisco.hotelservice.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.hotelservice.transport.model.domain.TicketType;
import org.microarchitecturovisco.hotelservice.transport.model.dto.LocationDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.request.GetTransportsBetweenLocationsRequestDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.request.GetTransportsBySearchQueryRequestDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.AvailableTransportsDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.TicketOfferDto;
import org.microarchitecturovisco.hotelservice.transport.model.dto.response.TicketOptionsDto;
import org.microarchitecturovisco.hotelservice.transport.repositories.TicketOfferTemplateRepository;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.DefaultResourceLoader;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TransportsQueryServiceTest {

    @Mock
    private TicketOfferTemplateRepository repository;

    private TransportsQueryService service;
    private StubCityCatalog cityCatalog;

    @BeforeEach
    void setUp() {
        cityCatalog = new StubCityCatalog();
        service = new TransportsQueryService(repository, cityCatalog);
    }

    @Test
    void availableTransportsDeduplicatesCitiesAndSeparatesFlightAndTrainDepartures() {
        when(repository.findAll()).thenReturn(List.of(
                offer("flight-one", TicketType.FLIGHT, "SHA", "PEK", 200, 8, 9, 0),
                offer("flight-two", TicketType.FLIGHT, "SHA", "CAN", 180, 5, 11, 0),
                offer("train-one", TicketType.TRAIN, "HGH", "PEK", 100, 12, 10, 0)
        ));
        stubLocation("SHA", "Shanghai");
        stubLocation("PEK", "Beijing");
        stubLocation("CAN", "Guangzhou");
        stubLocation("HGH", "Hangzhou");

        AvailableTransportsDto result = service.getAvailableTransports();

        assertThat(result.getDepartures().getPlane()).extracting(LocationDto::getCityId).containsExactly("SHA");
        assertThat(result.getDepartures().getTrain()).extracting(LocationDto::getCityId).containsExactly("HGH");
        assertThat(result.getDepartures().getBus()).isEmpty();
        assertThat(result.getArrivals()).extracting(LocationDto::getCityId).containsExactly("PEK", "CAN");
    }

    @Test
    void ticketOptionsReturnDistinctAlphabeticallySortedCityNames() {
        when(repository.findByTypeOrderByDepartureDateTimeAsc(TicketType.FLIGHT)).thenReturn(List.of(
                offer("one", TicketType.FLIGHT, "SHA", "PEK", 200, 8, 9, 0),
                offer("two", TicketType.FLIGHT, "CAN", "PEK", 180, 5, 11, 0),
                offer("three", TicketType.FLIGHT, "SHA", "HGH", 100, 12, 10, 0)
        ));
        stubCity("SHA", "Shanghai");
        stubCity("CAN", "Guangzhou");
        stubCity("PEK", "Beijing");
        stubCity("HGH", "Hangzhou");

        TicketOptionsDto result = service.getTicketOptions(TicketType.FLIGHT);

        assertThat(result.getDepartures()).containsExactly("Guangzhou", "Shanghai");
        assertThat(result.getArrivals()).containsExactly("Beijing", "Hangzhou");
    }

    @Test
    void searchTicketOffersUsesInclusivePriceAndDateBoundariesAndFiltersSoldOutOffers() {
        LocalDate departureDate = LocalDate.of(2026, 9, 1);
        TicketOfferTemplate lowerBound = offer("lower", TicketType.FLIGHT, "SHA", "PEK", 100, 1, 8, 30);
        TicketOfferTemplate upperBound = offer("upper", TicketType.FLIGHT, "SHA", "PEK", 200, 2, 10, 45);
        TicketOfferTemplate soldOut = offer("sold-out", TicketType.FLIGHT, "SHA", "PEK", 150, 0, 9, 0);
        TicketOfferTemplate tooExpensive = offer("expensive", TicketType.FLIGHT, "SHA", "PEK", 201, 5, 7, 0);
        cityCatalog.register("SHA", "Shanghai");
        cityCatalog.register("PEK", "Beijing");
        when(repository.findByTypeAndDepartureCityIdAndArrivalCityIdAndDepartureDateTimeGreaterThanEqualAndDepartureDateTimeLessThanOrderByDepartureDateTimeAsc(
                eq(TicketType.FLIGHT), eq("SHA"), eq("PEK"), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(List.of(upperBound, soldOut, tooExpensive, lowerBound));
        stubCity("SHA", "Shanghai");
        stubCity("PEK", "Beijing");

        List<TicketOfferDto> result = service.searchTicketOffers(
                TicketType.FLIGHT, "Shanghai", "Beijing", departureDate,
                new BigDecimal("100.00"), new BigDecimal("200.00"), false, true, "price", "asc"
        );

        assertThat(result).extracting(TicketOfferDto::getId).containsExactly(lowerBound.getId().toString(), upperBound.getId().toString());
        ArgumentCaptor<LocalDateTime> start = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<LocalDateTime> end = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(repository).findByTypeAndDepartureCityIdAndArrivalCityIdAndDepartureDateTimeGreaterThanEqualAndDepartureDateTimeLessThanOrderByDepartureDateTimeAsc(
                eq(TicketType.FLIGHT), eq("SHA"), eq("PEK"), start.capture(), end.capture());
        assertThat(start.getValue()).isEqualTo(departureDate.atStartOfDay());
        assertThat(end.getValue()).isEqualTo(departureDate.plusDays(1).atStartOfDay());
    }

    @Test
    void searchTicketOffersSortsBySeatCountThenDepartureTime() {
        LocalDate departureDate = LocalDate.of(2026, 9, 1);
        TicketOfferTemplate earlierWithSameSeats = offer("earlier", TicketType.TRAIN, "SHA", "HGH", 200, 4, 8, 0);
        TicketOfferTemplate laterWithMoreSeats = offer("later", TicketType.TRAIN, "SHA", "HGH", 100, 9, 12, 0);
        TicketOfferTemplate laterWithSameSeats = offer("same", TicketType.TRAIN, "SHA", "HGH", 50, 4, 11, 0);
        cityCatalog.register("SHA", "Shanghai");
        cityCatalog.register("HGH", "Hangzhou");
        when(repository.findByTypeAndDepartureCityIdAndArrivalCityIdAndDepartureDateTimeGreaterThanEqualAndDepartureDateTimeLessThanOrderByDepartureDateTimeAsc(
                eq(TicketType.TRAIN), eq("SHA"), eq("HGH"), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(List.of(laterWithSameSeats, earlierWithSameSeats, laterWithMoreSeats));
        stubCity("SHA", "Shanghai");
        stubCity("HGH", "Hangzhou");

        List<TicketOfferDto> result = service.searchTicketOffers(
                TicketType.TRAIN, "Shanghai", "Hangzhou", departureDate,
                null, null, false, false, "seats", "asc"
        );

        assertThat(result).extracting(TicketOfferDto::getId)
                .containsExactly(laterWithMoreSeats.getId().toString(), earlierWithSameSeats.getId().toString(), laterWithSameSeats.getId().toString());
    }

    @Test
    void searchTicketOffersUsesDepartureOrderForUnknownSortValueAndMapsDuration() {
        LocalDate departureDate = LocalDate.of(2026, 9, 1);
        TicketOfferTemplate later = offer("later", TicketType.FLIGHT, "SHA", "PEK", 100, 2, 12, 30);
        TicketOfferTemplate earlier = offer("earlier", TicketType.FLIGHT, "SHA", "PEK", 300, 2, 8, 0);
        cityCatalog.register("SHA", "Shanghai");
        cityCatalog.register("PEK", "Beijing");
        when(repository.findByTypeAndDepartureCityIdAndArrivalCityIdAndDepartureDateTimeGreaterThanEqualAndDepartureDateTimeLessThanOrderByDepartureDateTimeAsc(
                eq(TicketType.FLIGHT), eq("SHA"), eq("PEK"), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(List.of(later, earlier));
        stubCity("SHA", "Shanghai");
        stubCity("PEK", "Beijing");

        List<TicketOfferDto> result = service.searchTicketOffers(
                TicketType.FLIGHT, "Shanghai", "Beijing", departureDate,
                null, null, false, false, "unsupported", "asc"
        );

        assertThat(result).extracting(TicketOfferDto::getId).containsExactly(earlier.getId().toString(), later.getId().toString());
        assertThat(result.getFirst().getDuration()).isEqualTo("2h 30m");
    }

    @Test
    void searchTicketOffersSupportsDescendingOrder() {
        LocalDate departureDate = LocalDate.of(2026, 9, 1);
        TicketOfferTemplate cheap = offer("cheap", TicketType.FLIGHT, "SHA", "PEK", 100, 2, 8, 0);
        TicketOfferTemplate expensive = offer("expensive", TicketType.FLIGHT, "SHA", "PEK", 300, 2, 12, 0);
        cityCatalog.register("SHA", "Shanghai");
        cityCatalog.register("PEK", "Beijing");
        when(repository.findByTypeAndDepartureCityIdAndArrivalCityIdAndDepartureDateTimeGreaterThanEqualAndDepartureDateTimeLessThanOrderByDepartureDateTimeAsc(
                eq(TicketType.FLIGHT), eq("SHA"), eq("PEK"), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(List.of(cheap, expensive));
        stubCity("SHA", "Shanghai");
        stubCity("PEK", "Beijing");

        List<TicketOfferDto> descendingByPrice = service.searchTicketOffers(
                TicketType.FLIGHT, "Shanghai", "Beijing", departureDate,
                null, null, false, false, "price", "desc"
        );
        List<TicketOfferDto> descendingByDeparture = service.searchTicketOffers(
                TicketType.FLIGHT, "Shanghai", "Beijing", departureDate,
                null, null, false, false, "departure", "desc"
        );

        assertThat(descendingByPrice).extracting(TicketOfferDto::getId)
                .containsExactly(expensive.getId().toString(), cheap.getId().toString());
        assertThat(descendingByDeparture).extracting(TicketOfferDto::getId)
                .containsExactly(expensive.getId().toString(), cheap.getId().toString());
    }

    @Test
    void requestResponseMethodsPreserveUuidAndReturnEmptyCollections() {
        UUID searchUuid = UUID.randomUUID();
        UUID pairUuid = UUID.randomUUID();

        var searchResult = service.getTransportsBySearchQuery(GetTransportsBySearchQueryRequestDto.builder().uuid(searchUuid).build());
        var pairResult = service.getTransportsBetweenLocations(GetTransportsBetweenLocationsRequestDto.builder().uuid(pairUuid).build());

        assertThat(searchResult.getUuid()).isEqualTo(searchUuid);
        assertThat(searchResult.getTransportDtoList()).isEmpty();
        assertThat(pairResult.getUuid()).isEqualTo(pairUuid);
        assertThat(pairResult.getTransportPairs()).isEmpty();
    }

    private TicketOfferTemplate offer(String name, TicketType type, String departureCityId, String arrivalCityId,
                                     int price, int remainingSeats, int departureHour, int departureMinute) {
        LocalDateTime departure = LocalDateTime.of(2026, 9, 1, departureHour, departureMinute);
        return TicketOfferTemplate.builder()
                .id(UUID.nameUUIDFromBytes(name.getBytes()))
                .type(type)
                .departureCityId(departureCityId)
                .arrivalCityId(arrivalCityId)
                .departureDateTime(departure)
                .arrivalDateTime(departure.plusHours(2).plusMinutes(30))
                .price(BigDecimal.valueOf(price))
                .remainingSeats(remainingSeats)
                .totalSeats(100)
                .carrier("Carrier")
                .code(name)
                .seatClass("Economy")
                .build();
    }

    private void stubLocation(String cityId, String cityName) {
        cityCatalog.register(cityId, cityName);
    }

    private void stubCity(String cityId, String cityName) {
        cityCatalog.register(cityId, cityName);
    }

    private static final class StubCityCatalog extends CityCatalog {
        private final Map<String, CityRecord> citiesById = new HashMap<>();
        private final Map<String, CityRecord> citiesByName = new HashMap<>();

        private StubCityCatalog() {
            super(new DefaultResourceLoader(), "file:missing/transport/", "");
        }

        private void register(String cityId, String cityName) {
            CityRecord city = new CityRecord(cityId, "China", "", cityName);
            citiesById.put(cityId, city);
            citiesByName.put(cityName, city);
        }

        @Override
        public CityRecord find(String value) {
            return citiesByName.getOrDefault(value, new CityRecord(value, "China", "", value));
        }

        @Override
        public CityRecord findByCityId(String cityId) {
            return citiesById.getOrDefault(cityId, new CityRecord(cityId, "China", "", cityId));
        }

        @Override
        public LocationDto locationFor(String country, String cityName, String cityId) {
            return LocationDto.builder().cityId(cityId).country(country).region(cityName).build();
        }
    }
}
