package com.ideaconnection.common.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ideaconnection.common.error.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class PageQueryTest {

  private static final String DETAIL = "page는 0 이상, size는 1 이상 100 이하여야 합니다.";

  @Test
  void acceptsBoundaries() {
    assertThat(PageQuery.of(0, 1)).isEqualTo(new PageQuery(0, 1));
    assertThat(PageQuery.of(0, 100)).isEqualTo(new PageQuery(0, 100));
  }

  @Test
  void rejectsNegativePage() {
    assertRejected(-1, 20);
  }

  @Test
  void rejectsZeroSize() {
    assertRejected(0, 0);
  }

  @Test
  void rejectsTooLargeSize() {
    assertRejected(0, 101);
  }

  @Test
  void acceptsLargestOffset() {
    assertThat(PageQuery.of(21474836, 100)).isEqualTo(new PageQuery(21474836, 100));
  }

  @Test
  void rejectsOffsetBeyondIntegerRange() {
    assertThatThrownBy(() -> PageQuery.of(21474837, 100))
        .isInstanceOfSatisfying(
            ApiException.class,
            e -> {
              assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
              assertThat(e.getCode()).isEqualTo("BAD_REQUEST");
            });
  }

  private static void assertRejected(int page, int size) {
    assertThatThrownBy(() -> PageQuery.of(page, size))
        .isInstanceOfSatisfying(
            ApiException.class,
            e -> {
              assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
              assertThat(e.getCode()).isEqualTo("BAD_REQUEST");
              assertThat(e.getMessage()).isEqualTo(DETAIL);
            });
  }
}
