package org.microarchitecturovisco.hotelservice.transport;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.hotelservice.transport.bootstrap.util.CityCatalog;
import org.microarchitecturovisco.hotelservice.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.hotelservice.transport.model.domain.TicketType;
import org.microarchitecturovisco.hotelservice.transport.repositories.TicketOfferTemplateRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 票务查询链路：Controller → TransportsQueryService → JPA → H2。
 *
 * 城市名到 cityId 的解析走真实的 {@link CityCatalog}。注意 seed-data/common/cities.csv
 * 里只有中文城市名：传 "Beijing" 不会报错，而是被解析成一个哈希出来的假 cityId，
 * 查询结果静默为空。所以这里统一用中文城市名。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TransportModuleApplicationIT {

    private static final LocalDate TRAVEL_DATE = LocalDate.of(2026, 12, 10);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TicketOfferTemplateRepository templateRepository;

    @Autowired
    private CityCatalog cityCatalog;

    private String beijingId;
    private String shanghaiId;

    @BeforeEach
    void seedOffers() {
        beijingId = cityCatalog.find("北京市").cityId();
        shanghaiId = cityCatalog.find("上海市").cityId();
        if (templateRepository.count() > 0) {
            return;
        }
        templateRepository.save(offer("IT-G1", TicketType.TRAIN, 9, 553, 12));
        templateRepository.save(offer("IT-G2", TicketType.TRAIN, 14, 890, 0));
        templateRepository.save(offer("IT-MU1", TicketType.FLIGHT, 8, 1280, 30));
    }

    private TicketOfferTemplate offer(String code, TicketType type, int hour, int price, int remaining) {
        return TicketOfferTemplate.builder()
                .id(UUID.randomUUID())
                .type(type)
                .departureCityId(beijingId)
                .arrivalCityId(shanghaiId)
                .departureStationCode("ITD")
                .departureTerminalName("T1")
                .departureStationName("集成测试出发站")
                .arrivalStationCode("ITA")
                .arrivalTerminalName("T2")
                .arrivalStationName("集成测试到达站")
                .departureDateTime(TRAVEL_DATE.atTime(hour, 0))
                .arrivalDateTime(TRAVEL_DATE.atTime(hour + 4, 30))
                .carrier("集成测试承运人")
                .code(code)
                .seatClass(type == TicketType.TRAIN ? "二等座" : "经济舱")
                .price(BigDecimal.valueOf(price))
                .remainingSeats(remaining)
                .totalSeats(30)
                .build();
    }

    private String searchUrl(TicketType type, String extra) {
        return "/transports/tickets?type=" + type
                + "&departureCity=北京市&arrivalCity=上海市&departureDate=" + TRAVEL_DATE + extra;
    }

    @Test
    void ticketOptionsListSeededCities() throws Exception {
        mockMvc.perform(get("/transports/tickets/options?type=TRAIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.departures.length()").value(1))
                .andExpect(jsonPath("$.arrivals.length()").value(1));
    }

    @Test
    void searchReturnsOffersOrderedByDeparture() throws Exception {
        mockMvc.perform(get(searchUrl(TicketType.TRAIN, "&sortBy=departure")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].code").value("IT-G1"))
                .andExpect(jsonPath("$[0].departureCity").value("北京市"))
                .andExpect(jsonPath("$[0].arrivalCity").value("上海市"));
    }

    @Test
    void searchHonoursPriceFiltersAndAvailability() throws Exception {
        mockMvc.perform(get(searchUrl(TicketType.TRAIN, "&maxPrice=600")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value("IT-G1"));

        // IT-G2 已售罄，onlyAvailable 必须把它挡掉。
        mockMvc.perform(get(searchUrl(TicketType.TRAIN, "&onlyAvailable=true")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value("IT-G1"));

        mockMvc.perform(get(searchUrl(TicketType.TRAIN, "&sortBy=price")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].price").value(553));
    }

    @Test
    void searchIsScopedByTypeAndDate() throws Exception {
        mockMvc.perform(get(searchUrl(TicketType.FLIGHT, "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value("IT-MU1"));

        mockMvc.perform(get("/transports/tickets?type=TRAIN&departureCity=北京市&arrivalCity=上海市"
                        + "&departureDate=" + TRAVEL_DATE.plusDays(1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void searchRequiresADepartureDate() throws Exception {
        mockMvc.perform(get("/transports/tickets?type=TRAIN&departureCity=北京市&arrivalCity=上海市"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void availableCatalogIsServed() throws Exception {
        mockMvc.perform(get("/transports/available"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.departures").exists())
                .andExpect(jsonPath("$.arrivals").exists());
    }
}
