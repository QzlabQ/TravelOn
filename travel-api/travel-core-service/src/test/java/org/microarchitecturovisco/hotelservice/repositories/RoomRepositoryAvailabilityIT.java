package org.microarchitecturovisco.hotelservice.repositories;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.hotelservice.model.domain.Hotel;
import org.microarchitecturovisco.hotelservice.model.domain.Location;
import org.microarchitecturovisco.hotelservice.model.domain.Room;
import org.microarchitecturovisco.hotelservice.model.domain.RoomReservation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 打真实数据库（H2）的数据层测试，因此归入集成阶段而非单元阶段：
 * 文件名以 Test 结尾时会被 Surefire 当单元测试跑，那样的归类名不副实。
 */
@DataJpaTest
@ActiveProfiles("test")
class RoomRepositoryAvailabilityIT {
    private static final UUID LOCATION_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final int HOTEL_ID = 7;
    private static final long ROOM_ID = 42L;
    private static final LocalDateTime RESERVED_FROM = LocalDateTime.of(2026, 10, 21, 14, 0);
    private static final LocalDateTime RESERVED_TO = LocalDateTime.of(2026, 10, 23, 12, 0);

    @Autowired
    private TestEntityManager entities;

    @Autowired
    private RoomRepository rooms;

    @BeforeEach
    void createReservedRoom() {
        Location location = Location.builder()
                .id(LOCATION_ID)
                .cityId("TEST")
                .country("Test Country")
                .build();
        Hotel hotel = Hotel.builder()
                .id(HOTEL_ID)
                .name("Test Hotel")
                .location(location)
                .build();
        Room room = Room.builder()
                .id(ROOM_ID)
                .hotel(hotel)
                .name("Test Room")
                .guestCapacity(2)
                .pricePerAdult(BigDecimal.valueOf(100))
                .build();
        RoomReservation reservation = RoomReservation.builder()
                .id(UUID.fromString("22222222-2222-2222-2222-222222222222"))
                .dateFrom(RESERVED_FROM)
                .dateTo(RESERVED_TO)
                .room(room)
                .mainReservationId(UUID.fromString("33333333-3333-3333-3333-333333333333"))
                .build();

        entities.persist(location);
        entities.persist(hotel);
        entities.persist(room);
        entities.persist(reservation);
        entities.flush();
        entities.clear();
    }

    @Test
    void excludesEveryKindOfOverlappingInterval() {
        assertUnavailable(RESERVED_FROM.minusDays(1), RESERVED_TO.plusDays(1));
        assertUnavailable(RESERVED_FROM.plusHours(1), RESERVED_TO.minusHours(1));
        assertUnavailable(RESERVED_FROM.minusHours(1), RESERVED_FROM.plusHours(1));
        assertUnavailable(RESERVED_TO.minusHours(1), RESERVED_TO.plusHours(1));
    }

    @Test
    void allowsIntervalsThatOnlyTouchReservationBoundaries() {
        assertAvailable(RESERVED_FROM.minusDays(1), RESERVED_FROM);
        assertAvailable(RESERVED_TO, RESERVED_TO.plusDays(1));
    }

    private void assertUnavailable(LocalDateTime dateFrom, LocalDateTime dateTo) {
        assertThat(rooms.findAvailableRoomsByHotelAndDate(HOTEL_ID, dateFrom, dateTo)).isEmpty();
        assertThat(rooms.findAvailableRoomsByLocationAndDate(List.of(LOCATION_ID), dateFrom, dateTo)).isEmpty();
    }

    private void assertAvailable(LocalDateTime dateFrom, LocalDateTime dateTo) {
        assertThat(rooms.findAvailableRoomsByHotelAndDate(HOTEL_ID, dateFrom, dateTo))
                .extracting(Room::getId)
                .containsExactly(ROOM_ID);
        assertThat(rooms.findAvailableRoomsByLocationAndDate(List.of(LOCATION_ID), dateFrom, dateTo))
                .extracting(Room::getId)
                .containsExactly(ROOM_ID);
    }
}
