package org.microarchitecturovisco.hotelservice.controllers;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.hotelservice.services.HotelsCommandService;
import org.microarchitecturovisco.hotelservice.services.HotelsService;
import org.microarchitecturovisco.hotelservice.services.AdminAuthorizationService;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class HotelsControllerAdminAuthorizationTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        HotelsController controller = new HotelsController(
                mock(HotelsService.class),
                mock(HotelsCommandService.class),
                new AdminAuthorizationService(mock(org.springframework.web.client.RestTemplate.class))
        );
        mockMvc = standaloneSetup(controller).build();
    }

    @Test
    void createHotelWithoutSessionTokenIsUnauthorized() throws Exception {
        mockMvc.perform(post("/hotels/admin")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }
}
