package org.microarchitecturovisco.communityservice.repository;

public interface TargetRatingAggregate {
    String getTargetId();
    double getAvg();
    long getCnt();
}
