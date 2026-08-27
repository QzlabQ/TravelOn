package org.microarchitecturovisco.transport.controllers;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.transport.services.AdminAuthorizationService;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestTemplate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class TransportsQueryControllerAdminAuthorizationTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        TransportsQueryController controller = new TransportsQueryController(
                null,
                null,
                null,
                null,
                new AdminAuthorizationService(new RestTemplate())
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
