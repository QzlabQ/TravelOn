package org.microarchitecturovisco.aiarrangeservice.repository;

import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerMessage;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.UUID;

public interface PlannerMessageRepository extends MongoRepository<PlannerMessage, UUID> {

    List<PlannerMessage> findByConversationIdOrderByCreatedAtAsc(UUID conversationId);
}
