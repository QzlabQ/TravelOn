package org.microarchitecturovisco.hotelservice;

import jakarta.persistence.Column;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.hotelservice.model.domain.Room;
import org.microarchitecturovisco.hotelservice.services.HotelsService;

import java.lang.reflect.Field;
import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class MoneyPrecisionTest {

    @Test
    void roomPriceUsesFixedPrecisionDecimal() throws Exception {
        Field price = Room.class.getDeclaredField("pricePerAdult");
        Column column = price.getAnnotation(Column.class);

        assertThat(price.getType()).isEqualTo(BigDecimal.class);
        assertThat(column).isNotNull();
        assertThat(column.precision()).isEqualTo(12);
        assertThat(column.scale()).isEqualTo(2);
    }

    @Test
    void roomConfigurationKeepsDecimalArithmeticExact() {
        HotelsService service = new HotelsService(null, null, null, null, null);
        Room first = Room.builder().id(1L).guestCapacity(1).pricePerAdult(new BigDecimal("0.10")).build();
        Room second = Room.builder().id(2L).guestCapacity(1).pricePerAdult(new BigDecimal("0.20")).build();

        assertThat(service.getRoomConfigurationForAmountOfPeople(java.util.List.of(first, second), 2).getSecond())
                .isEqualByComparingTo("0.15");
    }
}
