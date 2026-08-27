package org.microarchitecturovisco.transport.bootstrap.util;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CityCatalogTest {

    @Test
    void blankInputProducesAStableFallbackLocation() {
        ResourceLoader resourceLoader = mock(ResourceLoader.class);
        Resource missingResource = mock(Resource.class);
        when(resourceLoader.getResource(anyString())).thenReturn(missingResource);
        when(missingResource.exists()).thenReturn(false);
        CityCatalog catalog = new CityCatalog(resourceLoader, "file:seed-data/transport/", "");

        var location = catalog.locationFor("China", null, "");

        assertThat(location.getCityId()).startsWith("C");
        assertThat(location.getRegion()).isEmpty();
        assertThat(location.getCountry()).isNotBlank();
    }

    @Test
    void unreadableCitySeedDataRaisesAUsefulException() throws Exception {
        ResourceLoader resourceLoader = mock(ResourceLoader.class);
        Resource brokenResource = mock(Resource.class);
        when(resourceLoader.getResource(anyString())).thenReturn(brokenResource);
        when(brokenResource.exists()).thenReturn(true);
        when(brokenResource.getInputStream()).thenThrow(new IOException("disk unavailable"));
        CityCatalog catalog = new CityCatalog(resourceLoader, "file:seed-data/transport/", "");

        assertThatThrownBy(() -> catalog.find("Shanghai"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Unable to read common city seed data")
                .hasCauseInstanceOf(IOException.class);
    }
}
