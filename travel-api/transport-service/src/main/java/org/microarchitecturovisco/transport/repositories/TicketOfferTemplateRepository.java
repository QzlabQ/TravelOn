package org.microarchitecturovisco.transport.repositories;

import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.model.domain.TicketType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface TicketOfferTemplateRepository extends JpaRepository<TicketOfferTemplate, UUID> {
    List<TicketOfferTemplate> findByTypeOrderByDepartureDateTimeAsc(TicketType type);

    List<TicketOfferTemplate> findByTypeAndDepartureCityIdAndArrivalCityIdOrderByDepartureDateTimeAsc(
            TicketType type,
            String departureCityId,
            String arrivalCityId
    );

    List<TicketOfferTemplate>
    findByTypeAndDepartureCityIdAndArrivalCityIdAndDepartureDateTimeGreaterThanEqualAndDepartureDateTimeLessThanOrderByDepartureDateTimeAsc(
            TicketType type,
            String departureCityId,
            String arrivalCityId,
            LocalDateTime departureDateTimeStart,
            LocalDateTime departureDateTimeEnd
    );
}
