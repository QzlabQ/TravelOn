package org.microarchitecturovisco.userservice.controllers;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.userservice.dto.AuthResponse;
import org.microarchitecturovisco.userservice.services.TravelerService;
import org.microarchitecturovisco.userservice.services.UserService;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class UserControllerRouteTest {

    private UserService userService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        userService = mock(UserService.class);
        TravelerService travelerService = mock(TravelerService.class);
        mockMvc = standaloneSetup(new UserController(userService, travelerService)).build();
    }

    @Test
    void legacyPublicCrudRoutesAreNotMapped() throws Exception {
        UUID userId = UUID.randomUUID();

        mockMvc.perform(get("/users"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/users/{id}", userId))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/users/{id}", userId))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void explicitRegistrationRouteRemainsMapped() throws Exception {
        when(userService.register(any())).thenReturn(new AuthResponse("token", null));

        mockMvc.perform(post("/users/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "alice@example.com",
                                  "password": "secret123",
                                  "name": "Alice"
                                }
                                """))
                .andExpect(status().isCreated());

        verify(userService).register(any());
    }

    @Test
    void authenticatedProfileRouteRemainsMapped() throws Exception {
        mockMvc.perform(get("/users/me")
                        .header("X-User-Token", "session-token"))
                .andExpect(status().isOk());

        verify(userService).getProfileByToken("session-token");
    }
}
