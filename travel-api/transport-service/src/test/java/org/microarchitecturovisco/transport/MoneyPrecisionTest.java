package org.microarchitecturovisco.transport;

import jakarta.persistence.Column;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;

import java.lang.reflect.Field;
import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class MoneyPrecisionTest {

    @Test
    void ticketPriceUsesFixedPrecisionDecimal() throws Exception {
        Field price = TicketOfferTemplate.class.getDeclaredField("price");
        Column column = price.getAnnotation(Column.class);

        assertThat(price.getType()).isEqualTo(BigDecimal.class);
        assertThat(column).isNotNull();
        assertThat(column.precision()).isEqualTo(12);
        assertThat(column.scale()).isEqualTo(2);
    }
}
