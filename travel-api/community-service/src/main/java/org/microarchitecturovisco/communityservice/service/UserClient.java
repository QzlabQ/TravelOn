package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
@RequiredArgsConstructor
public class UserClient {

    private final RestTemplate restTemplate;

    /** Resolves the user id from a token, or returns null if missing/invalid (does not throw). */
    public java.util.UUID tryResolveUserId(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            return requireUser(token).id();
        } catch (ResponseStatusException e) {
            return null;
        }
    }

    public UserProfileResponse requireUser(String token) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(UNAUTHORIZED, "Missing session token");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-User-Token", token);

        try {
            UserProfileResponse user = restTemplate.exchange(
                    "http://user-service/users/me",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    UserProfileResponse.class
            ).getBody();
            if (user == null) {
                throw new ResponseStatusException(UNAUTHORIZED, "Invalid session token");
            }
            return user;
        } catch (HttpClientErrorException.Unauthorized e) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid session token");
        } catch (HttpClientErrorException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid session token");
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "User service unavailable");
        }
    }

    public UserProfileResponse requireAdmin(String token) {
        UserProfileResponse user = requireUser(token);
        if (!user.admin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin account required");
        }
        return user;
    }

    /**
     * Allows the action when the caller is the resource owner or an admin.
     * Used for self-service deletion of posts, routes and comments.
     */
    public UserProfileResponse requireOwnerOrAdmin(String token, java.util.UUID ownerUserId) {
        UserProfileResponse user = requireUser(token);
        if (user.admin() || (ownerUserId != null && ownerUserId.equals(user.id()))) {
            return user;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not allowed to modify this content");
    }

    /** Allows the action only when the caller is the resource owner (author). */
    public UserProfileResponse requireOwner(String token, java.util.UUID ownerUserId) {
        UserProfileResponse user = requireUser(token);
        if (ownerUserId != null && ownerUserId.equals(user.id())) {
            return user;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the author can modify this content");
    }
}
