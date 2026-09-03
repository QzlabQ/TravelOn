package org.microarchitecturovisco.userservice.controllers;

import jakarta.validation.Valid;
import org.microarchitecturovisco.userservice.dto.AccountIdentityRequest;
import org.microarchitecturovisco.userservice.dto.AccountIdentityResponse;
import org.microarchitecturovisco.userservice.dto.BookingPreferencesRequest;
import org.microarchitecturovisco.userservice.dto.BookingPreferencesResponse;
import org.microarchitecturovisco.userservice.dto.AuthResponse;
import org.microarchitecturovisco.userservice.dto.LoginRequest;
import org.microarchitecturovisco.userservice.dto.RegisterRequest;
import org.microarchitecturovisco.userservice.dto.SavedBankCardRequest;
import org.microarchitecturovisco.userservice.dto.SavedBankCardResponse;
import org.microarchitecturovisco.userservice.dto.TravelerRequest;
import org.microarchitecturovisco.userservice.dto.TravelerResponse;
import org.microarchitecturovisco.userservice.dto.UpdateProfileRequest;
import org.microarchitecturovisco.userservice.dto.UserProfileResponse;
import org.microarchitecturovisco.userservice.services.AccountIdentityService;
import org.microarchitecturovisco.userservice.services.BookingPreferencesService;
import org.microarchitecturovisco.userservice.services.SavedBankCardService;
import org.microarchitecturovisco.userservice.services.TravelerService;
import org.microarchitecturovisco.userservice.services.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    private final AccountIdentityService accountIdentityService;
    private final SavedBankCardService savedBankCardService;
    private final BookingPreferencesService bookingPreferencesService;

    @Autowired
    public UserController(
            UserService userService,
            TravelerService travelerService,
            AccountIdentityService accountIdentityService,
            SavedBankCardService savedBankCardService,
            BookingPreferencesService bookingPreferencesService
    ) {
        this.userService = userService;
        this.travelerService = travelerService;
        this.accountIdentityService = accountIdentityService;
        this.savedBankCardService = savedBankCardService;
        this.bookingPreferencesService = bookingPreferencesService;
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

    @GetMapping("/me/identity")
    public ResponseEntity<AccountIdentityResponse> getIdentity(@RequestHeader("X-User-Token") String token) {
        return accountIdentityService.get(token)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/me/identity")
    public AccountIdentityResponse saveIdentity(
            @RequestHeader("X-User-Token") String token,
            @Valid @RequestBody AccountIdentityRequest request
    ) {
        return accountIdentityService.save(token, request);
    }

    @GetMapping("/me/booking-preferences")
    public ResponseEntity<BookingPreferencesResponse> getBookingPreferences(@RequestHeader("X-User-Token") String token) {
        return bookingPreferencesService.get(token)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/me/booking-preferences")
    public BookingPreferencesResponse saveBookingPreferences(
            @RequestHeader("X-User-Token") String token,
            @Valid @RequestBody BookingPreferencesRequest request
    ) {
        return bookingPreferencesService.save(token, request);
    }

    @GetMapping("/me/bank-cards")
    public List<SavedBankCardResponse> listBankCards(@RequestHeader("X-User-Token") String token) {
        return savedBankCardService.list(token);
    }

    @PostMapping("/me/bank-cards")
    @ResponseStatus(HttpStatus.CREATED)
    public SavedBankCardResponse saveBankCard(
            @RequestHeader("X-User-Token") String token,
            @Valid @RequestBody SavedBankCardRequest request
    ) {
        return savedBankCardService.save(token, request);
    }

    @DeleteMapping("/me/bank-cards/{cardId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBankCard(
            @RequestHeader("X-User-Token") String token,
            @PathVariable UUID cardId
    ) {
        savedBankCardService.delete(token, cardId);
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
