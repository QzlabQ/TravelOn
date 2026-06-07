package org.microarchitecturovisco.transport.repositories;

import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.model.domain.TicketType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TicketOfferTemplateRepository extends JpaRepository<TicketOfferTemplate, UUID> {
    List<TicketOfferTemplate> findByTypeOrderByDepartureTimeAsc(TicketType type);

    List<TicketOfferTemplate> findByTypeAndDepartureCityAndArrivalCityOrderByDepartureTimeAsc(
            TicketType type,
            String departureCity,
            String arrivalCity
    );
}
