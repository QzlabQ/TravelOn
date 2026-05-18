package org.microarchitecturovisco.aiarrangeservice.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.config.AmapProperties;
import org.microarchitecturovisco.aiarrangeservice.domain.enums.PlannerPlaceSource;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.logging.Logger;

@Component
@RequiredArgsConstructor
public class AmapPoiClient {

    private static final Logger logger = Logger.getLogger(AmapPoiClient.class.getName());

    private final AmapProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public Optional<PlannerPlaceSuggestion> searchFirst(String city, PlannerPlaceSuggestion candidate) {
        if (!properties.isEnabled() || !StringUtils.hasText(properties.getApiKey()) || !StringUtils.hasText(candidate.getName())) {
            return Optional.empty();
        }

        try {
            URI uri = UriComponentsBuilder
                    .fromHttpUrl(properties.getBaseUrl().replaceAll("/+$", "") + "/place/text")
                    .queryParam("key", properties.getApiKey())
                    .queryParam("keywords", candidate.getName())
                    .queryParam("city", city)
                    .queryParam("offset", 1)
                    .queryParam("page", 1)
                    .queryParam("extensions", "all")
                    .build()
                    .toUri();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(uri)
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                logger.warning("Amap place search failed with status " + response.statusCode());
                return Optional.empty();
            }

            JsonNode poi = objectMapper.readTree(response.body()).path("pois").path(0);
            if (poi.isMissingNode() || poi.isNull()) {
                return Optional.empty();
            }

            applyPoi(candidate, poi);
            return Optional.of(candidate);
        } catch (IOException e) {
            logger.warning("Amap place search failed: " + e.getMessage());
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.warning("Amap place search interrupted");
            return Optional.empty();
        }
    }

    private void applyPoi(PlannerPlaceSuggestion candidate, JsonNode poi) {
        String location = poi.path("location").asText();
        String[] locationParts = location.split(",");
        if (locationParts.length == 2) {
            candidate.setLongitude(parseDouble(locationParts[0]));
            candidate.setLatitude(parseDouble(locationParts[1]));
        }

        if (StringUtils.hasText(poi.path("id").asText())) {
            candidate.setAmapPoiId(poi.path("id").asText());
        }
        if (StringUtils.hasText(poi.path("address").asText())) {
            candidate.setAddress(poi.path("address").asText());
        }

        JsonNode firstPhoto = poi.path("photos").path(0);
        if (!firstPhoto.isMissingNode() && StringUtils.hasText(firstPhoto.path("url").asText())) {
            candidate.setImageUrl(firstPhoto.path("url").asText());
        }
        candidate.setSource(PlannerPlaceSource.AMAP);
    }

    private Double parseDouble(String value) {
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
