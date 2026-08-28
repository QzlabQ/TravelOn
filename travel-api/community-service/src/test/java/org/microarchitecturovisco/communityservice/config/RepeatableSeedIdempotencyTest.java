package org.microarchitecturovisco.communityservice.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class RepeatableSeedIdempotencyTest {

    @Test
    void featuredAttractionImagesAreInsertedOnlyWhenMissing() throws Exception {
        ClassPathResource resource = new ClassPathResource("db/migration/R__seed.sql");
        String sql = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);

        assertThat(sql)
                .contains("INSERT INTO public.attraction_images (attraction_id, image_url)")
                .contains("WHERE NOT EXISTS")
                .contains("existing.image_url = seed.image_url");
    }
}
