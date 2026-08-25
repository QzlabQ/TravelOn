package org.microarchitecturovisco.userservice.services;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Component
public class PasswordHasher {

    private static final String LEGACY_PREFIX = "travel-ui:";
    private static final int BCRYPT_STRENGTH = 12;

    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(BCRYPT_STRENGTH);

    public String hash(String password) {
        return bcrypt.encode(password);
    }

    public boolean matches(String password, String storedHash) {
        if (storedHash == null || storedHash.isBlank()) {
            return false;
        }
        if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
            return bcrypt.matches(password, storedHash);
        }
        return MessageDigest.isEqual(
                legacySha256(password).getBytes(StandardCharsets.US_ASCII),
                storedHash.getBytes(StandardCharsets.US_ASCII)
        );
    }

    public boolean needsUpgrade(String storedHash) {
        return storedHash == null
                || !(storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$"))
                || bcrypt.upgradeEncoding(storedHash);
    }

    static String legacySha256(String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest((LEGACY_PREFIX + password).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
