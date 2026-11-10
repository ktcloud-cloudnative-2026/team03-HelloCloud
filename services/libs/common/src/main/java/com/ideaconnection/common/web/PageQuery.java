package com.ideaconnection.common.web;

import com.ideaconnection.common.error.ApiException;
import org.springframework.http.HttpStatus;

public record PageQuery(int page, int size) {

  private static final int MAX_SIZE = 100;

  public static PageQuery of(int page, int size) {
    if (page < 0 || size < 1 || size > MAX_SIZE) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "BAD_REQUEST", "page는 0 이상, size는 1 이상 100 이하여야 합니다.");
    }
    return new PageQuery(page, size);
  }
}
