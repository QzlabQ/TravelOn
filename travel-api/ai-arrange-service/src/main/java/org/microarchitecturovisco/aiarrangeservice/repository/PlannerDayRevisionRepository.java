package org.microarchitecturovisco.aiarrangeservice.repository;

import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerDayRevision;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlannerDayRevisionRepository extends MongoRepository<PlannerDayRevision, UUID> {

    List<PlannerDayRevision> findByConversationId(UUID conversationId);

    List<PlannerDayRevision> findByConversationIdAndDayIndexOrderByDayVersionDesc(UUID conversationId, Integer dayIndex);

    Optional<PlannerDayRevision> findFirstByConversationIdAndDayIndexOrderByDayVersionDesc(UUID conversationId, Integer dayIndex);

    Optional<PlannerDayRevision> findByConversationIdAndDayIndexAndDayVersion(UUID conversationId, Integer dayIndex, Integer dayVersion);

    Optional<PlannerDayRevision> findFirstByConversationIdAndDayIndexAndContentHashOrderByDayVersionDesc(UUID conversationId, Integer dayIndex, String contentHash);
}
