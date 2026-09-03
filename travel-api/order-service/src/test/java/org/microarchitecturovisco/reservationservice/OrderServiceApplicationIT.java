package org.microarchitecturovisco.reservationservice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.reservationservice.services.ReservationAuthorizationService;
import org.microarchitecturovisco.reservationservice.services.saga.BookHotelsSaga;
import org.microarchitecturovisco.reservationservice.services.saga.BookTransportsSaga;
import org.microarchitecturovisco.reservationservice.services.saga.InvalidPaymentHandler;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 订单状态机：下单 → 支付（失败与成功）→ 支付流水 → 取消退款，
 * 走真实的 Controller → ReservationService → 事件投影 → JPA → H2。
 *
 * 被替换掉的只有跨服务边界：鉴权（调 user-service）和三条 saga（走 RabbitMQ）。
 * 支付本身是本地模拟实现，保持真实。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OrderServiceApplicationIT {

    private static final String TOKEN = "order-it-token";
    private static final UUID USER_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final String VALID_CARD = "6222021234567894";
    private static final String INVALID_CARD = "6200000000000000";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ReservationAuthorizationService authorizationService;

    @MockBean
    private BookHotelsSaga bookHotelsSaga;

    @MockBean
    private BookTransportsSaga bookTransportsSaga;

    @MockBean
    private InvalidPaymentHandler invalidPaymentHandler;

    /** 支付成功后会往 MQ 发状态变更事件；单服务集成测试里没有 broker。 */
    @MockBean
    private RabbitTemplate rabbitTemplate;

    @BeforeEach
    void allowTheTestUser() throws Exception {
        when(authorizationService.requireUserId(eq(TOKEN))).thenReturn(USER_ID);
        when(bookHotelsSaga.checkIfHotelIsAvailable(any())).thenReturn(true);
    }

    @Test
    void hotelOrderGoesFromPendingToPaidAndThenRefunded() throws Exception {
        JsonNode created = json(createHotelOrder());
        String reservationId = created.get("id").asText();
        assertStatus(reservationId, "PENDING_PAYMENT");

        // 无效卡号必须被拒，并且订单仍停留在待支付。
        mockMvc.perform(post("/reservations/purchase")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(purchaseBody(reservationId, INVALID_CARD)))
                .andExpect(status().isBadRequest());
        assertStatus(reservationId, "PENDING_PAYMENT");

        mockMvc.perform(post("/reservations/purchase")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(purchaseBody(reservationId, VALID_CARD)))
                .andExpect(status().isOk());
        assertStatus(reservationId, "PAID");

        // 失败和成功各留一条流水，支付历史不能只记成功的那次。
        mockMvc.perform(get("/reservations/{id}/payments", reservationId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.status == 'FAILED')]").exists())
                .andExpect(jsonPath("$[?(@.status == 'SUCCESS')]").exists());

        mockMvc.perform(post("/reservations/{id}/cancel", reservationId)
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"集成测试退款\"}"))
                .andExpect(status().isOk())
                // 已支付订单取消后进入退款流程，而不是简单的 CANCELLED。
                .andExpect(jsonPath("$.status").value("REFUNDED"))
                .andExpect(jsonPath("$.paid").value(false));

        mockMvc.perform(get("/reservations/{id}/refunds", reservationId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].amount").value(500.00))
                .andExpect(jsonPath("$[0].reason").value("集成测试退款"));
    }

    @Test
    void unpaidOrderIsCancelledWithoutARefundRecord() throws Exception {
        String reservationId = json(createHotelOrder()).get("id").asText();
        mockMvc.perform(post("/reservations/{id}/cancel", reservationId)
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"用户主动取消\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        mockMvc.perform(get("/reservations/{id}/refunds", reservationId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void payingTwiceIsIdempotent() throws Exception {
        String reservationId = json(createHotelOrder()).get("id").asText();
        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(post("/reservations/purchase")
                            .header("X-User-Token", TOKEN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(purchaseBody(reservationId, VALID_CARD)))
                    .andExpect(status().isOk());
        }
        assertStatus(reservationId, "PAID");
    }

    @Test
    void createRejectsAnInvertedDateRange() throws Exception {
        mockMvc.perform(post("/reservations/hotels")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(hotelOrderBody(LocalDate.of(2026, 12, 5), LocalDate.of(2026, 12, 3))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ordersOfAnotherUserAreNotReadable() throws Exception {
        String reservationId = json(createHotelOrder()).get("id").asText();
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Reservation belongs to another user"))
                .when(authorizationService).requireReservationOwnerOrAdmin(eq("other-token"), any());

        mockMvc.perform(get("/reservations/{id}", reservationId).header("X-User-Token", "other-token"))
                .andExpect(status().isForbidden());
    }

    @Test
    void legacyPackageEndpointOnlyReturnsARebuildNotice() throws Exception {
        mockMvc.perform(post("/reservations/reservation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"hotelTimeFrom":"2026-12-01T14:00:00","hotelTimeTo":"2026-12-03T12:00:00",
                                 "adultsQuantity":1,"childrenUnder3Quantity":0,"childrenUnder10Quantity":0,
                                 "childrenUnder18Quantity":0,"price":100,"hotelId":1,
                                 "roomReservationsIds":[],"transportReservationsIds":[],
                                 "hotelName":"Legacy","roomReservationsNames":[],"transportType":"PLANE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .content().string(org.hamcrest.Matchers.containsString("rebuilt")));
    }

    private MvcResult createHotelOrder() throws Exception {
        return mockMvc.perform(post("/reservations/hotels")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(hotelOrderBody(LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 3))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_PAYMENT"))
                .andReturn();
    }

    private String hotelOrderBody(LocalDate from, LocalDate to) {
        return """
                {"userId":"%s","hotelId":1,"hotelName":"集成测试酒店","dateFrom":"%s","dateTo":"%s",
                 "adultsQuantity":1,"childrenUnder3Quantity":0,"childrenUnder10Quantity":0,
                 "childrenUnder18Quantity":0,"price":500.00,"roomName":"标准间",
                 "travelers":[{"name":"张三","travelerType":"ADULT"}],"roomIds":[1]}
                """.formatted(USER_ID, from, to);
    }

    private String purchaseBody(String reservationId, String cardNumber) {
        return "{\"reservationId\":\"" + reservationId + "\",\"cardNumber\":\"" + cardNumber + "\"}";
    }

    private void assertStatus(String reservationId, String expected) throws Exception {
        mockMvc.perform(get("/reservations/{id}", reservationId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(expected));
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
