package org.microarchitecturovisco.hotelservice.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class AdminAuthorizationServiceTest {

    private MockRestServiceServer server;
    private AdminAuthorizationService service;

    @BeforeEach
    void setUp() {
        RestTemplate restTemplate = new RestTemplate();
        server = MockRestServiceServer.bindTo(restTemplate).build();
        service = new AdminAuthorizationService(restTemplate);
    }

    @Test
    void rejectsNonAdminUser() {
        server.expect(requestTo("http://user-service/users/me"))
                .andExpect(header("X-User-Token", "user-token"))
                .andRespond(withSuccess("{\"role\":\"USER\"}", MediaType.APPLICATION_JSON));

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> service.requireAdmin("user-token")
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        server.verify();
    }

    @Test
    void acceptsAdminUser() {
        server.expect(requestTo("http://user-service/users/me"))
                .andExpect(header("X-User-Token", "admin-token"))
                .andRespond(withSuccess("{\"role\":\"ADMIN\"}", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> service.requireAdmin("admin-token"));
        server.verify();
    }
}
