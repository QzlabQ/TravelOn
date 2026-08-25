package org.microarchitecturovisco.transport.controllers;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.microarchitecturovisco.transport.services.TransportCommandService;
import org.microarchitecturovisco.transport.services.TransportsQueryService;
import org.microarchitecturovisco.transport.services.AdminAuthorizationService;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class TransportsQueryControllerAdminAuthorizationTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        TransportsQueryController controller = new TransportsQueryController(
                mock(TransportsQueryService.class),
                mock(RabbitTemplate.class),
                mock(TransportCommandService.class),
                mock(TicketOfferTemplateRepository.class),
                new AdminAuthorizationService(mock(org.springframework.web.client.RestTemplate.class))
        );
        mockMvc = standaloneSetup(controller).build();
    }

    @Test
    void legacyAdminEndpointWithoutSessionTokenIsUnauthorized() throws Exception {
        mockMvc.perform(post("/transports/admin")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ticketTemplateWriteWithoutSessionTokenIsUnauthorized() throws Exception {
        mockMvc.perform(post("/transports/tickets/templates")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }
}
