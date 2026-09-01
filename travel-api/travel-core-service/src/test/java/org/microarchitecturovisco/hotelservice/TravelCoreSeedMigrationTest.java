package org.microarchitecturovisco.hotelservice;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class TravelCoreSeedMigrationTest {

    @Test
    void seedCombinesHotelAndTransportDataWithOneCitySource() throws IOException {
        String migration = new ClassPathResource("db/migration/R__seed.sql")
                .getContentAsString(StandardCharsets.UTF_8);

        assertThat(migration)
                .contains("/seed-data/hotel/hotels.csv")
                .contains("/seed-data/transport/plane/generated_ticket_offers.csv")
                .contains("/seed-data/transport/train/generated_ticket_offers.csv")
                .contains("SELECT city_id FROM seed_hotels")
                .contains("SELECT departure_city_id FROM seed_ticket_offers")
                .contains("SELECT arrival_city_id FROM seed_ticket_offers");
        assertThat(countOccurrences(migration, "CREATE TEMP TABLE seed_cities ("))
                .isEqualTo(1);
    }

    private int countOccurrences(String value, String search) {
        return (value.length() - value.replace(search, "").length()) / search.length();
    }
}
