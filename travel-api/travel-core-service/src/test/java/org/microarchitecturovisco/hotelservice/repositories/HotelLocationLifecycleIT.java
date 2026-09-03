package org.microarchitecturovisco.hotelservice.repositories;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.hotelservice.model.domain.Hotel;
import org.microarchitecturovisco.hotelservice.model.domain.Location;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class HotelLocationLifecycleIT {

    @Autowired
    private TestEntityManager entities;

    @Autowired
    private HotelRepository hotels;

    @Autowired
    private LocationRepository locations;

    @Test
    void deletingHotelDoesNotDeleteItsSharedLocation() {
        UUID locationId = UUID.randomUUID();
        Location location = entities.persist(Location.builder()
                .id(locationId)
                .cityId("SHARED")
                .country("China")
                .hotel(new ArrayList<>())
                .build());
        Hotel deleted = hotel(99001, "Deleted hotel", location);
        Hotel retained = hotel(99002, "Retained hotel", location);
        entities.persist(deleted);
        entities.persist(retained);
        entities.flush();

        hotels.delete(deleted);
        hotels.flush();
        entities.clear();

        assertThat(hotels.findById(99001)).isEmpty();
        assertThat(hotels.findById(99002)).isPresent();
        assertThat(locations.findById(locationId))
                .get()
                .extracting(Location::getCountry)
                .isEqualTo("China");
    }

    private Hotel hotel(int id, String name, Location location) {
        return Hotel.builder()
                .id(id)
                .name(name)
                .description(name)
                .location(location)
                .photos(List.of())
                .rooms(new ArrayList<>())
                .build();
    }
}
