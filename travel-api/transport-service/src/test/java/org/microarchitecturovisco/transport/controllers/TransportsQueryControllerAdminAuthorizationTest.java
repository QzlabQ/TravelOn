package org.microarchitecturovisco.transport.controllers;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.microarchitecturovisco.transport.services.AdminAuthorizationService;
import org.microarchitecturovisco.transport.services.TransportCommandService;
import org.microarchitecturovisco.transport.services.TransportsQueryService;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class TransportsQueryControllerAdminAuthorizationTest {

    private MockMvc mockMvc;
    private TicketOfferTemplateRepository repository;
    private AdminAuthorizationService authorizationService;
    private MockRestServiceServer userService;

    @BeforeEach
    void setUp() {
        repository = mock(TicketOfferTemplateRepository.class);
        RestTemplate restTemplate = new RestTemplate();
        userService = MockRestServiceServer.bindTo(restTemplate).build();
        authorizationService = new AdminAuthorizationService(restTemplate);
        TransportsQueryController controller = new TransportsQueryController(
                mock(TransportsQueryService.class),
                mock(TransportCommandService.class),
                repository,
                authorizationService
        );
        mockMvc = standaloneSetup(controller).build();
    }

    @Test
    void ticketTemplateWriteWithoutSessionTokenIsUnauthorized() throws Exception {
        mockMvc.perform(post("/transports/tickets/templates")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ticketTemplateWriteForRegularUserIsForbidden() throws Exception {
        expectRole("user-token", "USER");

        mockMvc.perform(post("/transports/tickets/templates")
                        .header("X-User-Token", "user-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(templateJson()))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanCreateTicketTemplate() throws Exception {
        expectAdmin("admin-token");
        when(repository.save(any(TicketOfferTemplate.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(post("/transports/tickets/templates")
                        .header("X-User-Token", "admin-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(templateJson()))
                .andExpect(status().isCreated());

        verify(repository).save(any(TicketOfferTemplate.class));
    }

    @Test
    void adminCanUpdateTicketTemplate() throws Exception {
        UUID templateId = UUID.randomUUID();
        expectAdmin("admin-token");
        when(repository.save(any(TicketOfferTemplate.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(put("/transports/tickets/templates/{templateId}", templateId)
                        .header("X-User-Token", "admin-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(templateJson()))
                .andExpect(status().isOk());

        verify(repository).save(any(TicketOfferTemplate.class));
    }

    @Test
    void adminCanDeleteTicketTemplate() throws Exception {
        UUID templateId = UUID.randomUUID();
        expectAdmin("admin-token");

        mockMvc.perform(delete("/transports/tickets/templates/{templateId}", templateId)
                        .header("X-User-Token", "admin-token"))
                .andExpect(status().isNoContent());

        verify(repository).deleteById(templateId);
    }

    private void expectAdmin(String token) {
        expectRole(token, "ADMIN");
    }

    private void expectRole(String token, String role) {
        userService.expect(requestTo("http://user-service/users/me"))
                .andExpect(header("X-User-Token", token))
                .andRespond(withSuccess("{\"role\":\"" + role + "\"}", MediaType.APPLICATION_JSON));
    }

    private String templateJson() {
        return """
                {
                  "type": "FLIGHT",
                  "departureCityId": "C039",
                  "arrivalCityId": "C005",
                  "departureStationCode": "E2E-PEK",
                  "departureTerminalName": "E2E Terminal",
                  "departureStationName": "E2E Beijing",
                  "arrivalStationCode": "E2E-PVG",
                  "arrivalTerminalName": "E2E Terminal",
                  "arrivalStationName": "E2E Shanghai",
                  "departureDateTime": "2030-01-01T09:00:00",
                  "arrivalDateTime": "2030-01-01T11:30:00",
                  "carrier": "E2E Air",
                  "code": "E2E-FLIGHT",
                  "seatClass": "ECONOMY",
                  "price": 588.88,
                  "remainingSeats": 5,
                  "totalSeats": 5
                }
                """;
    }
}
