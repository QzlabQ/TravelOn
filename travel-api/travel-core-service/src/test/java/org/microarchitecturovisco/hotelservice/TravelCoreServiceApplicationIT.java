package org.microarchitecturovisco.hotelservice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.hotelservice.model.domain.Hotel;
import org.microarchitecturovisco.hotelservice.model.domain.Location;
import org.microarchitecturovisco.hotelservice.model.domain.Room;
import org.microarchitecturovisco.hotelservice.repositories.HotelRepository;
import org.microarchitecturovisco.hotelservice.repositories.LocationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 酒店查询链路：Controller → HotelsService → JPA → H2。
 *
 * 重点是筛选与排序真的生效——这些逻辑此前只能靠人在前端点，出错时也没有任何测试会红。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TravelCoreServiceApplicationIT {

    private static final UUID LOCATION_ID = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    private static final LocalDate STAY_FROM = LocalDate.of(2026, 12, 1);
    private static final LocalDate STAY_TO = LocalDate.of(2026, 12, 3);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LocationRepository locationRepository;

    @Autowired
    private HotelRepository hotelRepository;

    @BeforeEach
    void seedHotels() {
        if (hotelRepository.findById(9001).isPresent()) {
            return;
        }
        Location location = locationRepository.save(Location.builder()
                .id(LOCATION_ID)
                .cityId("C001")
                .country("中国")
                .province("上海市")
                .region("上海")
                .normalizedName("上海")
                .build());

        // 便宜但评分低 / 贵但评分高：一份数据同时验证价格排序、评分排序和最低评分过滤。
        hotelRepository.save(hotel(9001, "经济酒店", 3.5f, location, 200));
        hotelRepository.save(hotel(9002, "精品酒店", 4.8f, location, 800));
    }

    private Hotel hotel(int id, String name, float rating, Location location, int price) {
        Hotel built = Hotel.builder()
                .id(id)
                .name(name)
                .rating(rating)
                .description(name + "的描述")
                .location(location)
                .photos(List.of())
                .build();
        built.setRooms(List.of(Room.builder()
                .id((long) id * 10)
                .hotel(built)
                .name(name + "标准间")
                .guestCapacity(2)
                .roomType("STANDARD")
                .pricePerAdult(BigDecimal.valueOf(price))
                .description("测试房型")
                .build()));
        return built;
    }

    private String searchUrl(String extra) {
        return "/hotels/search?destinationId=" + LOCATION_ID
                + "&dateFrom=" + STAY_FROM + "&dateTo=" + STAY_TO + "&adults=1" + extra;
    }

    @Test
    void destinationsExposeTheSeededCity() throws Exception {
        mockMvc.perform(get("/hotels/destinations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.cityId == 'C001')].idLocation").value(LOCATION_ID.toString()));
    }

    @Test
    void searchSortsByPriceAscendingByDefault() throws Exception {
        mockMvc.perform(get(searchUrl("&sortBy=price")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].hotelId").value(9001))
                .andExpect(jsonPath("$[1].hotelId").value(9002));
    }

    @Test
    void searchSortsByRatingDescending() throws Exception {
        mockMvc.perform(get(searchUrl("&sortBy=rating")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].hotelId").value(9002));
    }

    @Test
    void searchFiltersByMinimumRatingAndPrice() throws Exception {
        mockMvc.perform(get(searchUrl("&minRating=4.5")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].hotelId").value(9002));

        mockMvc.perform(get(searchUrl("&maxPrice=300")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].hotelId").value(9001));

        mockMvc.perform(get(searchUrl("&hotelName=精品")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].hotelId").value(9002));
    }

    @Test
    void hotelDetailsListBookableRooms() throws Exception {
        mockMvc.perform(get("/hotels/{id}?dateFrom={from}&dateTo={to}&adults=1", 9002, STAY_FROM, STAY_TO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hotelName").value("精品酒店"))
                .andExpect(jsonPath("$.roomsConfigurations[0].rooms[0].name").value("精品酒店标准间"));
    }

    @Test
    void searchRejectsAnInvertedDateRange() throws Exception {
        mockMvc.perform(get("/hotels/search?destinationId={id}&dateFrom={from}&dateTo={to}&adults=1",
                        LOCATION_ID, STAY_TO, STAY_FROM))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminEndpointsRequireATokenBeforeTouchingData() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/hotels/admin/{id}", 9001))
                .andExpect(status().isUnauthorized());
        // 未授权的删除不能真的把酒店删掉。
        mockMvc.perform(get(searchUrl("&sortBy=price")))
                .andExpect(jsonPath("$.length()").value(2));
    }
}
