package com.ideaconnection.common.logging;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import com.ideaconnection.common.web.RequestIdFilter;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.springframework.boot.json.JsonWriter;
import org.springframework.boot.logging.structured.StructuredLogFormatter;
import org.springframework.core.env.Environment;

public class JsonLogFormatter implements StructuredLogFormatter<ILoggingEvent> {

  private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

  private final JsonWriter<ILoggingEvent> writer;

  public JsonLogFormatter(Environment environment) {
    String service = environment.getProperty("spring.application.name");
    this.writer =
        JsonWriter.<ILoggingEvent>of(
                members -> {
                  members.add(
                      "time",
                      event ->
                          DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
                              event.getInstant().atZone(ZONE)));
                  members.add(
                      "level", event -> event.getLevel().toString().toLowerCase(Locale.ROOT));
                  members.add("service", service).whenNotNull();
                  members
                      .add(
                          "request_id",
                          event -> event.getMDCPropertyMap().get(RequestIdFilter.MDC_KEY))
                      .whenNotNull();
                  members.add("message", ILoggingEvent::getFormattedMessage);
                  members.add("stack_trace", JsonLogFormatter::stackTrace).whenNotNull();
                })
            .withNewLineAtEnd();
  }

  private static String stackTrace(ILoggingEvent event) {
    IThrowableProxy proxy = event.getThrowableProxy();
    return (proxy != null) ? ThrowableProxyUtil.asString(proxy) : null;
  }

  @Override
  public String format(ILoggingEvent event) {
    return writer.writeToString(event);
  }
}
