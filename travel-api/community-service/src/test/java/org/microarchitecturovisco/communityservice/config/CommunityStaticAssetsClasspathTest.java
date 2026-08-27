package org.microarchitecturovisco.communityservice.config;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

class CommunityStaticAssetsClasspathTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "static/community/defaults/featured-1.png",
            "static/community/defaults/featured-2.png",
            "static/community/defaults/featured-3.png",
            "static/community/defaults/featured-4.png"
    })
    void bundledFeaturedImagesExistOnClasspath(String resourcePath) throws Exception {
        ClassPathResource resource = new ClassPathResource(resourcePath);

        assertThat(resource.exists()).isTrue();
        assertThat(resource.contentLength()).isGreaterThan(0L);
    }
}
