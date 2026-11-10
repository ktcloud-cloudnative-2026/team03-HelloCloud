package com.ideaconnection.common.web;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

public final class ApiTime {

  private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");

  private ApiTime() {}

  public static String format(Instant instant) {
    return DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
        instant.atZone(KOREA).truncatedTo(ChronoUnit.SECONDS));
  }
}
