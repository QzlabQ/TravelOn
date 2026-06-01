package org.microarchitecturovisco.transport.bootstrap;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.model.domain.TicketType;
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

@Component
@Order(2)
@RequiredArgsConstructor
public class TicketOfferBootstrap implements CommandLineRunner {
    private final TicketOfferTemplateRepository ticketOfferTemplateRepository;
    private final ResourceLoader resourceLoader;

    @Override
    public void run(String... args) throws Exception {
        Resource resource = resourceLoader.getResource("classpath:initData/ticket_offers.tsv");
        List<TicketOfferTemplate> offers = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }

                String[] values = line.split("\\t", -1);
                offers.add(TicketOfferTemplate.builder()
                        .id(UUID.nameUUIDFromBytes(line.getBytes(StandardCharsets.UTF_8)))
                        .type(TicketType.valueOf(values[0]))
                        .departureCity(values[1])
                        .arrivalCity(values[2])
                        .departureStation(values[3])
                        .arrivalStation(values[4])
                        .departureTime(LocalTime.parse(values[5]))
                        .arrivalTime(LocalTime.parse(values[6]))
                        .carrier(values[7])
                        .code(values[8])
                        .seatClass(values[9])
                        .price(Integer.parseInt(values[10]))
                        .remainingSeats(Integer.parseInt(values[11]))
                        .studentEligible(Boolean.parseBoolean(values[12]))
                        .referenceDate(LocalDate.parse(values[13]))
                        .sourceUrl(values[14])
                        .sourceNote(values[15])
                        .build());
            }
        }

        ticketOfferTemplateRepository.deleteAll();
        ticketOfferTemplateRepository.saveAll(offers);
        Logger.getLogger("TicketOfferBootstrap").info("Imported " + offers.size() + " ticket offer templates");
    }
}
