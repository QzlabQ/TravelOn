package org.microarchitecturovisco.aiarrangeservice.repository;

import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlannerConversationRepository extends MongoRepository<PlannerConversation, UUID> {

    Optional<PlannerConversation> findByIdAndUserId(UUID id, UUID userId);

    List<PlannerConversation> findByUserIdOrderByUpdatedAtDesc(UUID userId);
}
