package org.microarchitecturovisco.userservice.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.userservice.domain.BookingPreferences;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.dto.BookingPreferencesRequest;
import org.microarchitecturovisco.userservice.repositories.BookingPreferencesRepository;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingPreferencesServiceTest {

    @Mock UserService userService;
    @Mock BookingPreferencesRepository bookingPreferencesRepository;
    @InjectMocks BookingPreferencesService bookingPreferencesService;

    @Test
    void saveAssociatesNormalizedPreferencesWithCurrentUser() {
        UUID userId = UUID.randomUUID();
        when(userService.requireUserByToken("token")).thenReturn(User.builder().id(userId).build());
        when(bookingPreferencesRepository.findByUserId(userId)).thenReturn(Optional.empty());
        when(bookingPreferencesRepository.save(any(BookingPreferences.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = bookingPreferencesService.save("token", new BookingPreferencesRequest(
                " 北京 ", " 上海 ", new BigDecimal("4.25"), " 300.00 ", List.of("D", " D ", "UNKNOWN"), true));

        ArgumentCaptor<BookingPreferences> captor = ArgumentCaptor.forClass(BookingPreferences.class);
        verify(bookingPreferencesRepository).save(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(userId);
        assertThat(captor.getValue().getDefaultDepartureCity()).isEqualTo("北京");
        assertThat(captor.getValue().getPreferredHotelMinRating()).isEqualByComparingTo("4.3");
        assertThat(captor.getValue().getPreferredTrainTypes()).isEqualTo("D");
        assertThat(response.preferredTrainTypes()).containsExactly("D");
    }
}
