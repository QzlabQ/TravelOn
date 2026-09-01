package org.microarchitecturovisco.userservice.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.userservice.domain.SavedBankCard;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.dto.SavedBankCardRequest;
import org.microarchitecturovisco.userservice.repositories.SavedBankCardRepository;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SavedBankCardServiceTest {

    @Mock UserService userService;
    @Mock SavedBankCardRepository savedBankCardRepository;
    @InjectMocks SavedBankCardService savedBankCardService;

    @Test
    void savesValidUnionPayCardForCurrentUser() {
        UUID userId = UUID.randomUUID();
        when(userService.requireUserByToken("token")).thenReturn(User.builder().id(userId).build());
        when(savedBankCardRepository.findByUserIdAndCardNumber(userId, "6222021001112221")).thenReturn(Optional.empty());
        when(savedBankCardRepository.save(any(SavedBankCard.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = savedBankCardService.save("token", new SavedBankCardRequest("6222021001112221", "card label"));

        assertThat(response.cardNumber()).isEqualTo("6222021001112221");
        assertThat(response.label()).isEqualTo("card label");
        verify(savedBankCardRepository).save(any(SavedBankCard.class));
    }

    @Test
    void rejectsInvalidUnionPayCardBeforePersisting() {
        when(userService.requireUserByToken("token")).thenReturn(User.builder().id(UUID.randomUUID()).build());

        assertThatThrownBy(() -> savedBankCardService.save("token", new SavedBankCardRequest("6212345678901234", "")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400 BAD_REQUEST");
        verify(savedBankCardRepository, never()).save(any());
    }
}