package org.microarchitecturovisco.userservice.bootstrap;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.domain.UserRole;
import org.microarchitecturovisco.userservice.repositories.UserRepository;
import org.microarchitecturovisco.userservice.services.UserService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.*;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

@Component
@ConditionalOnProperty(name = "app.seed-data.enabled", havingValue = "true")
@RequiredArgsConstructor
public class Bootstrap implements CommandLineRunner {

    private final UserRepository userRepository;
    private final ResourceLoader resourceLoader;
    private final UserService userService;

    @Value("${app.seed-data.base-path:file:../seed-data/user/}")
    private String seedDataBasePath;

    @Override
    public void run(String... args) {
        Logger logger = Logger.getLogger("Bootstrap | User");

        if (userRepository.count() > 0) {
            logger.info("Skip user seed import because user data already exists");
            return;
        }

        List<User> users = importUsersFromCSV(seedResource("users.csv"));

        users.forEach(user -> {
            if (!userRepository.existsByEmailIgnoreCase(user.getEmail())) {
                userRepository.save(user);
            }
        });

        logger.info("Saved " + users.size() + " users");
    }

    private Resource seedResource(String filename) {
        String basePath = seedDataBasePath.endsWith("/") ? seedDataBasePath : seedDataBasePath + "/";
        return resourceLoader.getResource(basePath + filename);
    }

    private File loadCSVInitFile(String filePath) {
        try {
            return new ClassPathResource(filePath).getFile();
        } catch (IOException e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to load CSV file: " + filePath, e);
        }
    }

    private List<User> importUsersFromCSV(Resource resource) {
        List<User> users = new ArrayList<>();

        try (BufferedReader br = new BufferedReader(new InputStreamReader(resource.getInputStream()))) {
            String line;
            br.readLine(); // Skip header line

            while ((line = br.readLine()) != null) {
                String[] data = line.split(",");

                String email = data[0];
                String password = data[1];
                String firstName = data[2];
                String lastName = data[3];
                UUID userId = UUID.nameUUIDFromBytes((email + password + firstName + lastName).getBytes());

                User user = User.builder()
                        .id(userId)
                        .email(email)
                        .passwordHash(userService.hashPassword(password))
                        .name(firstName)
                        .surname(lastName)
                        .loyaltyTier("Explorer")
                        .role(UserRole.USER)
                        .build();
                users.add(user);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return users;
    }
}
