package org.microarchitecturovisco.userservice.services;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordHasherTest {

    private final PasswordHasher hasher = new PasswordHasher();

    @Test
    void newHashesAreSaltedBcryptValues() {
        String first = hasher.hash("correct horse battery staple");
        String second = hasher.hash("correct horse battery staple");

        assertTrue(first.startsWith("$2a$12$"));
        assertNotEquals(first, second);
        assertTrue(hasher.matches("correct horse battery staple", first));
        assertFalse(hasher.matches("wrong password", first));
        assertFalse(hasher.needsUpgrade(first));
    }

    @Test
    void legacySha256ValuesRemainVerifiableButRequireUpgrade() {
        String legacy = PasswordHasher.legacySha256("password1");

        assertTrue(hasher.matches("password1", legacy));
        assertFalse(hasher.matches("wrong password", legacy));
        assertTrue(hasher.needsUpgrade(legacy));
    }
}
