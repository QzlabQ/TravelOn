package org.microarchitecturovisco.hotelservice;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("pre")  // 前置守卫：校验数据、资源与配置本身，不是业务逻辑的单元测试
class FlywayBaselineCompatibilityTest {

    @Test
    void idempotencyMigrationChecksBeforeCreatingConstraint() throws IOException {
        String migration = readResource("db/migration/V3__room_reservation_idempotency.sql");

        assertThat(migration)
                .contains("FROM pg_constraint")
                .contains("conrelid = 'public.room_reservation'::regclass")
                .contains("ADD CONSTRAINT uq_room_reservation_main_room");
    }

    @Test
    void hotelPhotoMigrationRemovesDuplicatesBeforeAddingConstraint() throws IOException {
        String migration = readResource("db/migration/V4__hotel_photos_idempotency.sql");

        assertThat(migration)
                .contains("DELETE FROM public.hotel_photos")
                .contains("IS NOT DISTINCT FROM")
                .contains("conrelid = 'public.hotel_photos'::regclass")
                .contains("ADD CONSTRAINT uq_hotel_photos_hotel_photo");
    }

    private String readResource(String name) throws IOException {
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream(name)) {
            assertThat(stream).as("resource %s", name).isNotNull();
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
