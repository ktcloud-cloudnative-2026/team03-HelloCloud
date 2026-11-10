package com.ideaconnection.user.user;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
class UserProfileWriter {

  @PersistenceContext private EntityManager entityManager;

  // save()는 ID가 있으면 merge로 동작해 동시 요청 때 다른 요청이 만든 행을 덮어쓸 수 있다.
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  void insert(UserProfile profile) {
    entityManager.persist(profile);
    entityManager.flush();
  }
}
