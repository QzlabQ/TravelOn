package org.microarchitecturovisco.userservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.userservice.domain.AccountIdentity;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.dto.AccountIdentityRequest;
import org.microarchitecturovisco.userservice.dto.AccountIdentityResponse;
import org.microarchitecturovisco.userservice.repositories.AccountIdentityRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AccountIdentityService {

    private final UserService userService;
    private final AccountIdentityRepository accountIdentityRepository;

    public Optional<AccountIdentityResponse> get(String token) {
        User user = userService.requireUserByToken(token);
        return accountIdentityRepository.findByUserId(user.getId()).map(AccountIdentityResponse::from);
    }

    public AccountIdentityResponse save(String token, AccountIdentityRequest request) {
        User user = userService.requireUserByToken(token);
        AccountIdentity identity = accountIdentityRepository.findByUserId(user.getId())
                .orElseGet(() -> AccountIdentity.builder().id(UUID.randomUUID()).userId(user.getId()).build());
        identity.setRealName(request.realName().trim());
        identity.setDocumentType(request.documentType().trim());
        identity.setDocumentNumber(request.documentNumber().trim());
        return AccountIdentityResponse.from(accountIdentityRepository.save(identity));
    }
}