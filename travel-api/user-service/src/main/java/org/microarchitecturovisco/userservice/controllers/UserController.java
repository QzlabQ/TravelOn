package org.microarchitecturovisco.userservice.controllers;

import jakarta.validation.Valid;
import org.microarchitecturovisco.userservice.dto.AuthResponse;
import org.microarchitecturovisco.userservice.dto.LoginRequest;
import org.microarchitecturovisco.userservice.dto.RegisterRequest;
import org.microarchitecturovisco.userservice.dto.UpdateProfileRequest;
import org.microarchitecturovisco.userservice.dto.UserProfileResponse;
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

    @Autowired
    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<UserProfileResponse> getAllUsers() {
        return userService.getAllUsers().stream()
                .map(UserProfileResponse::from)
                .toList();
    }

    @GetMapping("/{id}")
    public UserProfileResponse getUserById(@PathVariable UUID id) {
        return userService.getUserById(id)
                .map(UserProfileResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found with id " + id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse createUser(@Valid @RequestBody RegisterRequest request) {
        return userService.register(request);
    }

    @DeleteMapping("/{id}")
    public void deleteUser(@PathVariable UUID id) {
        userService.deleteUser(id);
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
}
