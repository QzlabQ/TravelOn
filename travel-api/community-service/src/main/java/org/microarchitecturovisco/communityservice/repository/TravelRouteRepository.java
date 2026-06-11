package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.TravelRoute;
import org.microarchitecturovisco.communityservice.domain.TravelStyle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface TravelRouteRepository extends JpaRepository<TravelRoute, UUID> {

    /**
     * Filter routes by an optional style, city and free-text keyword (matching the
     * title or summary). Returns every match so the service can rank by popularity
     * and paginate in memory, mirroring {@code AttractionRepository#findFiltered}.
     */
    @Query("""
            select distinct r from TravelRoute r left join r.destinationCity c
            where (:style is null or r.style = :style)
              and (cast(:cityId as string) is null or c.cityId = :cityId)
              and (cast(:keyword as string) is null
                   or lower(r.title) like lower(concat('%', cast(:keyword as string), '%'))
                   or lower(coalesce(r.summary, '')) like lower(concat('%', cast(:keyword as string), '%')))
            """)
    List<TravelRoute> findFiltered(
            @Param("style") TravelStyle style,
            @Param("cityId") String cityId,
            @Param("keyword") String keyword
    );

    List<TravelRoute> findByAuthorUserIdOrderByCreatedAtDesc(UUID authorUserId);
}
