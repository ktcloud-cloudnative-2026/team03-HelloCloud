package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.user.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

class OrganizationRollbackTest extends AbstractIntegrationTest {

  @Autowired private OrganizationService service;
  @Autowired private OrganizationRepository organizations;
  @MockitoSpyBean private OrganizationMemberRepository members;

  @Test
  void memberFailureLeavesNoOrganization() {
    doThrow(new DataAccessResourceFailureException("x")).when(members).save(any());

    assertThatThrownBy(() -> service.create(new CurrentUser("u1", null, "민준"), "HelloCloud"))
        .isInstanceOf(DataAccessResourceFailureException.class);

    assertThat(organizations.count()).isZero();
  }
}
