package org.microarchitecturovisco.userservice.bootstrap;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.domain.UserRole;
import org.microarchitecturovisco.userservice.repositories.UserRepository;
import org.microarchitecturovisco.userservice.services.UserService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

@Component
@RequiredArgsConstructor
public class AdminAccountBootstrap implements CommandLineRunner {

    private final UserRepository userRepository;
    private final UserService userService;

    private static final List<AdminAccount> ADMIN_ACCOUNTS = List.of(
            new AdminAccount("admin@nullptr.email", "d53v(B*&tT^87Ym"),
            new AdminAccount("administrator@nullptr.email", "&Bt6Rg8h^&756dS"),
            new AdminAccount("nullptrofficial@nullptr.email", "aDmIn_Psw7d6%N#$")
    );

    @Override
    public void run(String... args) {
        Logger logger = Logger.getLogger("Bootstrap | AdminAccount");
        ADMIN_ACCOUNTS.forEach(this::upsertAdmin);
        logger.info("Synced " + ADMIN_ACCOUNTS.size() + " built-in admin accounts");
    }

    private void upsertAdmin(AdminAccount account) {
        userRepository.findByEmailIgnoreCase(account.email())
                .map(user -> {
                    if (!userService.passwordMatches(account.password(), user.getPasswordHash())
                            || userService.passwordNeedsUpgrade(user.getPasswordHash())) {
                        user.setPasswordHash(userService.hashPassword(account.password()));
                    }
                    user.setRole(UserRole.ADMIN);
                    if (user.getName() == null || user.getName().isBlank()) {
                        user.setName("Admin");
                    }
                    if (user.getSurname() == null) {
                        user.setSurname("");
                    }
                    return userRepository.save(user);
                })
                .orElseGet(() -> userRepository.save(User.builder()
                        .id(UUID.nameUUIDFromBytes(("admin:" + account.email()).getBytes()))
                        .email(account.email())
                        .passwordHash(userService.hashPassword(account.password()))
                        .name("Admin")
                        .surname("")
                        .loyaltyTier("Administrator")
                        .role(UserRole.ADMIN)
                        .build()));
    }

    private record AdminAccount(String email, String password) {
    }
}
