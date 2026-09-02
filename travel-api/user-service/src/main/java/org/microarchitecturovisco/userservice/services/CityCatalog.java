package org.microarchitecturovisco.userservice.services;

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

@Component
public class CityCatalog {

    private final ResourceLoader resourceLoader;
    private final String commonSeedDataBasePath;
    private Map<String, String> canonicalNames;

    public CityCatalog(
            ResourceLoader resourceLoader,
            @Value("${app.seed-data.common-base-path:file:../seed-data/common/}") String commonSeedDataBasePath
    ) {
        this.resourceLoader = resourceLoader;
        this.commonSeedDataBasePath = commonSeedDataBasePath;
    }

    public String canonicalName(String value) {
        ensureLoaded();
        return canonicalNames.get(normalize(value));
    }

    private void ensureLoaded() {
        if (canonicalNames != null) return;
        canonicalNames = new HashMap<>();
        Resource resource = resourceLoader.getResource(normalizeBasePath(commonSeedDataBasePath) + "cities.csv");
        if (!resource.exists()) {
            throw new IllegalStateException("Common city catalog is unavailable");
        }
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                String[] values = line.split("\\t", -1);
                if (values.length >= 4 && !values[3].isBlank()) {
                    canonicalNames.put(normalize(values[3]), values[3].trim());
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("Unable to read common city catalog", e);
        }
    }

    private String normalizeBasePath(String path) {
        return path.endsWith("/") ? path : path + "/";
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
}
