package org.microarchitecturovisco.userservice.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.userservice.domain.AccountIdentity;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.dto.AccountIdentityRequest;
import org.microarchitecturovisco.userservice.repositories.AccountIdentityRepository;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccountIdentityServiceTest {

    @Mock UserService userService;
    @Mock AccountIdentityRepository accountIdentityRepository;
    @InjectMocks AccountIdentityService accountIdentityService;

    @Test
    void saveAssociatesNormalizedIdentityWithCurrentUser() {
        UUID userId = UUID.randomUUID();
        when(userService.requireUserByToken("token")).thenReturn(User.builder().id(userId).build());
        when(accountIdentityRepository.findByUserId(userId)).thenReturn(Optional.empty());
        when(accountIdentityRepository.save(any(AccountIdentity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = accountIdentityService.save("token", new AccountIdentityRequest(" Alice ", "ID_CARD", " 110101199001011234 "));

        ArgumentCaptor<AccountIdentity> captor = ArgumentCaptor.forClass(AccountIdentity.class);
        verify(accountIdentityRepository).save(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(userId);
        assertThat(response.realName()).isEqualTo("Alice");
        assertThat(response.documentType()).isEqualTo("ID_CARD");
        assertThat(response.documentNumber()).isEqualTo("110101199001011234");
    }
}