package org.microarchitecturovisco.aiarrangeservice.repository;

import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlannerSnapshotRepository extends MongoRepository<PlannerSnapshot, UUID> {

    List<PlannerSnapshot> findByConversationIdOrderByVersionDesc(UUID conversationId);

    Optional<PlannerSnapshot> findFirstByConversationIdOrderByVersionDesc(UUID conversationId);

    Optional<PlannerSnapshot> findByConversationIdAndVersion(UUID conversationId, Integer version);

    Optional<PlannerSnapshot> findFirstByConversationIdAndChecksumOrderByVersionDesc(UUID conversationId, String checksum);
}
