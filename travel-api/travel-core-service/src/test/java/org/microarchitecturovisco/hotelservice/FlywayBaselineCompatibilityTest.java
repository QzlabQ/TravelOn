package org.microarchitecturovisco.hotelservice;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class FlywayBaselineCompatibilityTest {

    @Test
    void idempotencyMigrationChecksBeforeCreatingConstraint() throws IOException {
        String migration = readResource("db/migration/V3__room_reservation_idempotency.sql");

        assertThat(migration)
                .contains("FROM pg_constraint")
                .contains("conrelid = 'public.room_reservation'::regclass")
                .contains("ADD CONSTRAINT uq_room_reservation_main_room");
    }

    private String readResource(String name) throws IOException {
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream(name)) {
            assertThat(stream).as("resource %s", name).isNotNull();
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
