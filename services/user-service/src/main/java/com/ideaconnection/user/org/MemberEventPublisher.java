package com.ideaconnection.user.org;

/** 멤버가 조직에서 빠졌음을 다른 서비스에 알린다. chat은 이걸 받아 실시간 연결을 끊는다. */
interface MemberEventPublisher {

  void memberRemoved(Long orgId, String userId);
}
