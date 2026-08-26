package org.microarchitecturovisco.userservice.controllers;

import jakarta.validation.Valid;
import org.microarchitecturovisco.userservice.dto.AuthResponse;
import org.microarchitecturovisco.userservice.dto.LoginRequest;
import org.microarchitecturovisco.userservice.dto.RegisterRequest;
import org.microarchitecturovisco.userservice.dto.TravelerRequest;
import org.microarchitecturovisco.userservice.dto.TravelerResponse;
import org.microarchitecturovisco.userservice.dto.UpdateProfileRequest;
import org.microarchitecturovisco.userservice.dto.UserProfileResponse;
import org.microarchitecturovisco.userservice.services.TravelerService;
import org.microarchitecturovisco.userservice.services.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/users")
@Validated
public class UserController {

    private final UserService userService;
    private final TravelerService travelerService;

    @Autowired
    public UserController(UserService userService, TravelerService travelerService) {
        this.userService = userService;
        this.travelerService = travelerService;
    }

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return userService.register(request);
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return userService.login(request);
    }

    @GetMapping("/me")
    public UserProfileResponse getCurrentUser(@RequestHeader("X-User-Token") String token) {
        return userService.getProfileByToken(token);
    }

    @PutMapping("/me")
    public UserProfileResponse updateCurrentUser(
            @RequestHeader("X-User-Token") String token,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return userService.updateProfile(token, request);
    }

    @PostMapping("/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(value = "X-User-Token", required = false) String token) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing session token");
        }
        userService.logout(token);
    }

    @GetMapping("/me/travelers")
    public List<TravelerResponse> getTravelers(@RequestHeader("X-User-Token") String token) {
        return travelerService.list(token);
    }

    @PostMapping("/me/travelers")
    @ResponseStatus(HttpStatus.CREATED)
    public TravelerResponse createTraveler(
            @RequestHeader("X-User-Token") String token,
            @Valid @RequestBody TravelerRequest request
    ) {
        return travelerService.create(token, request);
    }

    @PutMapping("/me/travelers/{travelerId}")
    public TravelerResponse updateTraveler(
            @RequestHeader("X-User-Token") String token,
            @PathVariable UUID travelerId,
            @Valid @RequestBody TravelerRequest request
    ) {
        return travelerService.update(token, travelerId, request);
    }

    @DeleteMapping("/me/travelers/{travelerId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTraveler(
            @RequestHeader("X-User-Token") String token,
            @PathVariable UUID travelerId
    ) {
        travelerService.delete(token, travelerId);
    }
}
