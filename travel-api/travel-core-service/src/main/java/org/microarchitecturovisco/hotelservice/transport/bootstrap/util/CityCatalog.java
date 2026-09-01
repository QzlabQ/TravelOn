package org.microarchitecturovisco.hotelservice.transport.bootstrap.util;

import org.microarchitecturovisco.hotelservice.transport.model.dto.LocationDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class CityCatalog {
    private final ResourceLoader resourceLoader;
    private final String seedDataBasePath;
    private final String commonSeedDataBasePath;
    private Map<String, CityRecord> citiesByAlias;

    public CityCatalog(
            ResourceLoader resourceLoader,
            @Value("${app.seed-data.base-path:file:../seed-data/transport/}") String seedDataBasePath,
            @Value("${app.seed-data.common-base-path:}") String commonSeedDataBasePath
    ) {
        this.resourceLoader = resourceLoader;
        this.seedDataBasePath = seedDataBasePath;
        this.commonSeedDataBasePath = commonSeedDataBasePath;
    }

    public LocationDto locationFor(String country, String cityName, String cityId) {
        CityRecord city = find(cityName);
        String shortCityId = cityId == null || cityId.isBlank()
                ? city.cityId()
                : cityId.trim();
        UUID locationId = UUID.nameUUIDFromBytes(("CITY:" + shortCityId).getBytes(StandardCharsets.UTF_8));
        return LocationDto.builder()
                .idLocation(locationId)
                .cityId(shortCityId)
                .country(city.country().isBlank() ? country : city.country())
                .province(city.province())
                .region(city.cityName())
                .normalizedName(city.cityName())
                .build();
    }

    public CityRecord find(String value) {
        ensureLoaded();
        String alias = normalize(value);
        CityRecord city = citiesByAlias.get(alias);
        if (city != null) {
            return city;
        }
        String id = "C" + Integer.toUnsignedString(alias.hashCode(), 36).toUpperCase();
        return new CityRecord(id, "中国", "", alias);
    }

    public CityRecord findByCityId(String cityId) {
        ensureLoaded();
        return citiesByAlias.values()
                .stream()
                .filter(city -> city.cityId().equals(cityId))
                .findFirst()
                .orElse(new CityRecord(cityId, "中国", "", cityId));
    }

    private void ensureLoaded() {
        if (citiesByAlias != null) {
            return;
        }
        citiesByAlias = new HashMap<>();
        Resource resource = resourceLoader.getResource(normalizeBasePath(commonBasePath()) + "cities.csv");
        if (!resource.exists()) {
            return;
        }
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                String[] values = line.split("\t", -1);
                CityRecord city = new CityRecord(
                        values[0],
                        values[1],
                        values[2],
                        values[3]
                );
                citiesByAlias.put(normalize(city.cityName()), city);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Unable to read common city seed data", e);
        }
    }

    private String commonBasePath() {
        if (commonSeedDataBasePath != null && !commonSeedDataBasePath.isBlank()) {
            return commonSeedDataBasePath;
        }
        String base = normalizeBasePath(seedDataBasePath);
        return base.endsWith("/transport/") ? base.substring(0, base.length() - "transport/".length()) + "common/" : base + "common/";
    }

    private String normalizeBasePath(String basePath) {
        return basePath.endsWith("/") ? basePath : basePath + "/";
    }

    private String normalize(String value) {
        String normalized = value == null ? "" : value.trim();
        for (String suffix : new String[]{"特别行政区", "地区", "自治州", "盟", "市"}) {
            if (normalized.endsWith(suffix) && normalized.length() > suffix.length()) {
                return normalized.substring(0, normalized.length() - suffix.length());
            }
        }
        return normalized;
    }

    public record CityRecord(String cityId, String country, String province, String cityName) {
    }
}
