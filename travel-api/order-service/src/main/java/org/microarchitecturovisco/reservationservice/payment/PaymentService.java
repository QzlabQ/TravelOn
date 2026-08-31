package org.microarchitecturovisco.reservationservice.payment;

import org.microarchitecturovisco.reservationservice.domain.dto.PaymentRequestDto;
import org.microarchitecturovisco.reservationservice.domain.dto.PaymentResponseDto;
import org.springframework.stereotype.Service;

@Service
public class PaymentService {

    public PaymentResponseDto verifyTransaction(PaymentRequestDto requestDto) {
        String cardNumber = requestDto.getCardNumber() == null
                ? ""
                : requestDto.getCardNumber().replaceAll("\\D", "");
        boolean validLength = cardNumber.matches("\\d{16,19}");
        boolean unionPayCard = cardNumber.startsWith("62");
        boolean transactionApproved = validLength && unionPayCard && passesLuhn(cardNumber);

        return PaymentResponseDto.builder()
                .reservationId(requestDto.getIdReservation())
                .transactionApproved(transactionApproved)
                .build();
    }

    private boolean passesLuhn(String cardNumber) {
        int sum = 0;
        boolean shouldDouble = false;

        for (int index = cardNumber.length() - 1; index >= 0; index -= 1) {
            int digit = cardNumber.charAt(index) - '0';
            if (shouldDouble) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            shouldDouble = !shouldDouble;
        }

        return sum % 10 == 0;
    }
}
