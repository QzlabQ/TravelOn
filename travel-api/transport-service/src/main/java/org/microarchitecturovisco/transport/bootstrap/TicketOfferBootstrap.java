package org.microarchitecturovisco.transport.bootstrap;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.model.domain.TicketType;
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import java.util.logging.Logger;

@Component
@Order(2)
@ConditionalOnProperty(name = "app.seed-data.enabled", havingValue = "true")
@RequiredArgsConstructor
public class TicketOfferBootstrap implements CommandLineRunner {
    private final TicketOfferTemplateRepository ticketOfferTemplateRepository;
    private final ResourceLoader resourceLoader;

    @Value("${app.seed-data.base-path:file:../seed-data/transport/}")
    private String seedDataBasePath;

    @Value("${app.seed-data.train-base-path:}")
    private String trainSeedDataBasePath;

    @Value("${app.seed-data.plane-base-path:}")
    private String planeSeedDataBasePath;

    @Override
    public void run(String... args) throws Exception {
        Logger logger = Logger.getLogger("TicketOfferBootstrap");
        if (ticketOfferTemplateRepository.count() > 0) {
            logger.info("Skip ticket offer seed import because ticket offer data already exists");
            return;
        }

        List<TicketOfferTemplate> offers = new ArrayList<>();
        Resource planeTsvResource = planeSeedResource("ticket_offers.csv");
        if (planeTsvResource.exists()) {
            offers.addAll(readTsvOffers(planeTsvResource, TicketType.FLIGHT));
        }
        offers.addAll(readTsvOffers(trainSeedResource("ticket_offers.csv"), TicketType.TRAIN));

        ticketOfferTemplateRepository.saveAll(offers);
        logger.info("Imported " + offers.size() + " ticket offer templates");
    }

    private Resource trainSeedResource(String filename) {
        String basePath = trainSeedDataBasePath == null || trainSeedDataBasePath.isBlank()
                ? defaultTrainSeedDataBasePath()
                : trainSeedDataBasePath;
        return resourceLoader.getResource(normalizeBasePath(basePath) + filename);
    }

    private Resource planeSeedResource(String filename) {
        String basePath = planeSeedDataBasePath == null || planeSeedDataBasePath.isBlank()
                ? defaultPlaneSeedDataBasePath()
                : planeSeedDataBasePath;
        return resourceLoader.getResource(normalizeBasePath(basePath) + filename);
    }

    private String defaultTrainSeedDataBasePath() {
        return normalizeBasePath(seedDataBasePath) + "train/";
    }

    private String defaultPlaneSeedDataBasePath() {
        return normalizeBasePath(seedDataBasePath) + "plane/";
    }

    private String normalizeBasePath(String basePath) {
        return basePath.endsWith("/") ? basePath : basePath + "/";
    }

    private List<TicketOfferTemplate> readTsvOffers(Resource resource, TicketType expectedType) throws IOException {
        List<TicketOfferTemplate> offers = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }

                String[] values = line.split("\t", -1);
                TicketType type = TicketType.valueOf(values[0]);
                if (type != expectedType) {
                    throw new IllegalStateException(resource.getDescription() +
                            " must contain only " + expectedType + " rows, but found " + type);
                }
                offers.add(TicketOfferTemplate.builder()
                        .id(UUID.nameUUIDFromBytes(line.getBytes(StandardCharsets.UTF_8)))
                        .type(type)
                        .departureCityId(values[1])
                        .arrivalCityId(values[2])
                        .departureStationCode(values[3])
                        .departureTerminalName(values[4])
                        .arrivalStationCode(values[5])
                        .arrivalTerminalName(values[6])
                        .departureDateTime(LocalDateTime.parse(values[7]))
                        .arrivalDateTime(LocalDateTime.parse(values[8]))
                        .carrier(values[9])
                        .code(values[10])
                        .seatClass(values[11])
                        .price(new BigDecimal(values[12]))
                        .remainingSeats(Integer.parseInt(values[13]))
                        .totalSeats(Integer.parseInt(values[14]))
                        .build());
            }
        }

        return offers;
    }
}
