package org.microarchitecturovisco.reservationservice;

import jakarta.persistence.Column;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.reservationservice.domain.entity.PaymentTransaction;
import org.microarchitecturovisco.reservationservice.domain.entity.RefundRecord;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;

import java.lang.reflect.Field;
import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class MoneyPrecisionTest {

    @Test
    void persistedAmountsUseFixedPrecisionDecimals() throws Exception {
        assertMoneyColumn(Reservation.class, "price");
        assertMoneyColumn(PaymentTransaction.class, "amount");
        assertMoneyColumn(RefundRecord.class, "amount");
    }

    private void assertMoneyColumn(Class<?> owner, String fieldName) throws Exception {
        Field field = owner.getDeclaredField(fieldName);
        Column column = field.getAnnotation(Column.class);

        assertThat(field.getType()).isEqualTo(BigDecimal.class);
        assertThat(column).isNotNull();
        assertThat(column.precision()).isEqualTo(12);
        assertThat(column.scale()).isEqualTo(2);
    }
}
