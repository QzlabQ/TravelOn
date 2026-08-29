package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.Attraction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttractionRepository extends JpaRepository<Attraction, UUID> {

    @Modifying
    @Query("update Attraction a set a.createdByName = :name where a.createdByUserId = :userId")
    int updateCreatedByName(@Param("userId") UUID userId, @Param("name") String name);

    /**
     * Filter attractions by optional city and an optional keyword that matches the
     * attraction name or description. Returns every match so the service can rank
     * them by popularity and paginate in memory.
     */
    @Query("""
            select a from Attraction a left join a.city c
            where (cast(:cityId as string) is null or c.cityId = :cityId)
              and (cast(:keyword as string) is null
                   or lower(a.name) like lower(concat('%', cast(:keyword as string), '%'))
                   or lower(coalesce(a.description, '')) like lower(concat('%', cast(:keyword as string), '%')))
            """)
    List<Attraction> findFiltered(@Param("cityId") String cityId, @Param("keyword") String keyword);

    @Query("""
            select a from Attraction a left join a.city c
            where lower(a.name) = lower(:name)
              and lower(coalesce(c.cityId, '')) = lower(coalesce(:cityId, ''))
            """)
    Optional<Attraction> findByNameAndCityId(@Param("name") String name, @Param("cityId") String cityId);
}
