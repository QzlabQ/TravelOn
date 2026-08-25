package org.microarchitecturovisco.transport.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.transport.model.cqrs.commands.CreateTransportCommand;
import org.microarchitecturovisco.transport.model.cqrs.commands.CreateTransportReservationCommand;
import org.microarchitecturovisco.transport.model.cqrs.commands.DeleteTransportReservationCommand;
import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class TransportCommandService {
    private static final Logger log = LoggerFactory.getLogger(TransportCommandService.class);

    private final TicketOfferTemplateRepository ticketOfferTemplateRepository;

    public void createTransport(CreateTransportCommand command) {
        log.warn("Ignoring legacy createTransport command {}", command.getUuid());
    }

    @Transactional
    public void createReservation(CreateTransportReservationCommand command) {
        UUID templateId = command.getTransportReservationDto().getIdTransport();
        int seats = command.getTransportReservationDto().getNumberOfSeats();

        Optional<TicketOfferTemplate> opt = ticketOfferTemplateRepository.findById(templateId);
        if (opt.isEmpty()) {
            log.warn("TicketOfferTemplate {} not found, cannot decrement seats", templateId);
            return;
        }
        TicketOfferTemplate template = opt.get();
        int updated = Math.max(0, template.getRemainingSeats() - seats);
        template.setRemainingSeats(updated);
        ticketOfferTemplateRepository.save(template);
        log.info("Decremented {} seats for template {}, remaining: {}", seats, templateId, updated);
    }

    @Transactional
    public void deleteReservation(DeleteTransportReservationCommand command) {
        UUID templateId = command.getTransportId();
        int seats = command.getNumberOfSeats();

        Optional<TicketOfferTemplate> opt = ticketOfferTemplateRepository.findById(templateId);
        if (opt.isEmpty()) {
            log.warn("TicketOfferTemplate {} not found, cannot restore seats", templateId);
            return;
        }
        TicketOfferTemplate template = opt.get();
        int updated = Math.min(template.getTotalSeats(), template.getRemainingSeats() + seats);
        template.setRemainingSeats(updated);
        ticketOfferTemplateRepository.save(template);
        log.info("Restored {} seats for template {}, remaining: {}", seats, templateId, updated);
    }

    public void updateTransport(UUID transportId, int capacity, BigDecimal pricePerAdult) {
        log.warn("Ignoring legacy updateTransport command {}", transportId);
    }

    public void createTransport(UUID transportId, UUID courseId, LocalDateTime departureDate, int capacity,
                                BigDecimal pricePerAdult) {
        log.warn("Ignoring legacy createTransport overload {}", transportId);
    }

    public void deleteTransport(UUID transportId) {
        log.warn("Ignoring legacy deleteTransport command {}", transportId);
    }
}
