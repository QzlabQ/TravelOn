package org.microarchitecturovisco.userservice.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.userservice.domain.Traveler;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.dto.TravelerRequest;
import org.microarchitecturovisco.userservice.repositories.TravelerRepository;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TravelerServiceTest {
    @Mock UserService userService;
    @Mock TravelerRepository travelerRepository;
    @InjectMocks TravelerService travelerService;

    @Test
    void createNormalizesTravelerTypeAndDemotesPreviousDefault() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).build();
        Traveler previous = Traveler.builder().id(UUID.randomUUID()).userId(userId).defaultTraveler(true).build();
        when(userService.requireUserByToken("token")).thenReturn(user);
        when(travelerRepository.findByUserIdAndDefaultTravelerTrue(userId)).thenReturn(List.of(previous));
        when(travelerRepository.save(any(Traveler.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = travelerService.create("token", new TravelerRequest(" Child ", " child ", "身份证", "123", "13800138000", false, true));

        assertThat(response.travelerType()).isEqualTo("CHILD");
        assertThat(response.name()).isEqualTo("Child");
        assertThat(previous.isDefaultTraveler()).isFalse();
        verify(travelerRepository, times(2)).save(any(Traveler.class));
    }

    @Test
    void createRejectsUnsupportedTravelerType() {
        when(userService.requireUserByToken("token")).thenReturn(User.builder().id(UUID.randomUUID()).build());

        assertThatThrownBy(() -> travelerService.create("token", new TravelerRequest("Alice", "INFANT", null, null, null, false, false)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400 BAD_REQUEST");
        verify(travelerRepository, never()).save(any());
    }

    @Test
    void updateRejectsTravelerNotOwnedByUser() {
        UUID userId = UUID.randomUUID();
        UUID travelerId = UUID.randomUUID();
        when(userService.requireUserByToken("token")).thenReturn(User.builder().id(userId).build());
        when(travelerRepository.findByIdAndUserId(travelerId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> travelerService.update("token", travelerId, new TravelerRequest("Alice", "ADULT", null, null, null, false, false)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("404 NOT_FOUND");
    }
}
