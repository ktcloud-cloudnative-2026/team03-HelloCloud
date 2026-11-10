package com.ideaconnection.common.web;

import com.ideaconnection.common.error.ApiException;
import org.springframework.http.HttpStatus;

public record PageQuery(int page, int size) {

  private static final int MAX_SIZE = 100;

  public static PageQuery of(int page, int size) {
    if (page < 0 || size < 1 || size > MAX_SIZE) {
      throw badRequest("page는 0 이상, size는 1 이상 100 이하여야 합니다.");
    }
    // Spring Data는 건너뛸 행 수가 int를 넘으면 예외를 던져 500이 된다.
    if ((long) page * size > Integer.MAX_VALUE) {
      throw badRequest("page 값이 너무 큽니다.");
    }
    return new PageQuery(page, size);
  }

  private static ApiException badRequest(String detail) {
    return new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", detail);
  }
}
