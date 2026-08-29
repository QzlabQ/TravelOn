package org.microarchitecturovisco.communityservice.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.h2.jdbcx.JdbcDataSource;

import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class RepeatableSeedIdempotencyTest {

    @Test
    void executingFeaturedImageSeedTwiceDoesNotCreateDuplicateRows() throws Exception {
        ClassPathResource resource = new ClassPathResource("db/migration/R__seed.sql");
        String sql = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        String imageInsert = extractFeaturedImageInsert(sql);

        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:seed-idempotency;MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("CREATE TABLE attraction_images (attraction_id UUID NOT NULL, image_url VARCHAR(1000))");

        jdbc.execute(toH2Sql(imageInsert));
        int firstCount = countFeaturedImages(jdbc);
        jdbc.execute(toH2Sql(imageInsert));
        int secondCount = countFeaturedImages(jdbc);

        assertThat(firstCount).isEqualTo(4);
        assertThat(secondCount).isEqualTo(firstCount);
        assertThat(jdbc.queryForList("SELECT image_url FROM attraction_images ORDER BY image_url", String.class))
                .containsExactly(
                        "/community/defaults/featured-1.png",
                        "/community/defaults/featured-2.png",
                        "/community/defaults/featured-3.png",
                        "/community/defaults/featured-4.png");
    }

    private static int countFeaturedImages(JdbcTemplate jdbc) {
        return jdbc.queryForObject(
                "SELECT COUNT(*) FROM attraction_images WHERE image_url LIKE '/community/defaults/featured-%'", Integer.class);
    }

    private static String extractFeaturedImageInsert(String seedSql) {
        Matcher matcher = Pattern.compile(
                "(?s)(INSERT INTO public\\.attraction_images.*?;)").matcher(seedSql);
        assertThat(matcher.find()).as("R__seed.sql contains the featured image insert").isTrue();
        return matcher.group(1);
    }

    private static String toH2Sql(String postgresSql) {
        return postgresSql
                .replace("public.", "")
                .replace("::uuid", "");
    }
}
