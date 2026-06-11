package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.City;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CityRepository extends JpaRepository<City, UUID> {
    Optional<City> findByCityId(String cityId);
}
