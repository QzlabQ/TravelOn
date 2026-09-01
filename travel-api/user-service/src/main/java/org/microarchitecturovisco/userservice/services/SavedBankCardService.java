package org.microarchitecturovisco.userservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.userservice.domain.SavedBankCard;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.dto.SavedBankCardRequest;
import org.microarchitecturovisco.userservice.dto.SavedBankCardResponse;
import org.microarchitecturovisco.userservice.repositories.SavedBankCardRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SavedBankCardService {

    private static final String DEFAULT_LABEL = "\u6211\u7684\u94f6\u8054\u5361";

    private final UserService userService;
    private final SavedBankCardRepository savedBankCardRepository;

    public List<SavedBankCardResponse> list(String token) {
        User user = userService.requireUserByToken(token);
        return savedBankCardRepository.findByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(SavedBankCardResponse::from)
                .toList();
    }

    public SavedBankCardResponse save(String token, SavedBankCardRequest request) {
        User user = userService.requireUserByToken(token);
        String cardNumber = request.cardNumber().trim();
        validateUnionPayCard(cardNumber);
        return savedBankCardRepository.findByUserIdAndCardNumber(user.getId(), cardNumber)
                .map(SavedBankCardResponse::from)
                .orElseGet(() -> {
                    SavedBankCard card = SavedBankCard.builder()
                            .id(UUID.randomUUID())
                            .userId(user.getId())
                            .cardNumber(cardNumber)
                            .label(normalizeLabel(request.label()))
                            .build();
                    return SavedBankCardResponse.from(savedBankCardRepository.save(card));
                });
    }

    public void delete(String token, UUID cardId) {
        User user = userService.requireUserByToken(token);
        SavedBankCard card = savedBankCardRepository.findByIdAndUserId(cardId, user.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Saved bank card not found"));
        savedBankCardRepository.delete(card);
    }

    private String normalizeLabel(String label) {
        return label == null || label.isBlank() ? DEFAULT_LABEL : label.trim();
    }

    private void validateUnionPayCard(String cardNumber) {
        if (!cardNumber.matches("\\d{16,19}") || !cardNumber.startsWith("62") || !passesLuhn(cardNumber)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid UnionPay card number");
        }
    }

    private boolean passesLuhn(String cardNumber) {
        int sum = 0;
        boolean doubleDigit = false;
        for (int index = cardNumber.length() - 1; index >= 0; index--) {
            int digit = cardNumber.charAt(index) - '0';
            if (doubleDigit) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            doubleDigit = !doubleDigit;
        }
        return sum % 10 == 0;
    }
}