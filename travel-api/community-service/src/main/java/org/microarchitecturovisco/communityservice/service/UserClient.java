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
}
