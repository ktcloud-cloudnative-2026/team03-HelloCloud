package com.ideaconnection.common;

import com.ideaconnection.common.error.GlobalExceptionHandler;
import com.ideaconnection.common.security.CurrentUserArgumentResolver;
import com.ideaconnection.common.security.ProblemSecurityHandlers;
import com.ideaconnection.common.web.RequestIdFilter;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.security.autoconfigure.web.servlet.ServletWebSecurityAutoConfiguration;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.web.OAuth2ResourceServerWebSecurityAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@AutoConfiguration(
    before = {
      ServletWebSecurityAutoConfiguration.class,
      OAuth2ResourceServerWebSecurityAutoConfiguration.class,
      ManagementWebSecurityAutoConfiguration.class
    })
public class CommonAutoConfiguration {

  @Bean
  RequestIdFilter requestIdFilter() {
    return new RequestIdFilter();
  }

  @Bean
  GlobalExceptionHandler globalExceptionHandler() {
    return new GlobalExceptionHandler();
  }

  @Bean
  ProblemSecurityHandlers problemSecurityHandlers(
      @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) {
    return new ProblemSecurityHandlers(resolver);
  }

  @Bean
  WebMvcConfigurer currentUserWebMvcConfigurer() {
    return new WebMvcConfigurer() {
      @Override
      public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new CurrentUserArgumentResolver());
      }
    };
  }

  @Bean
  SecurityFilterChain commonSecurityFilterChain(HttpSecurity http, ProblemSecurityHandlers handlers)
      throws Exception {
    return http.csrf(AbstractHttpConfigurer::disable)
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            requests ->
                requests
                    .requestMatchers("/actuator/health/**", "/metrics")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(
            server ->
                server
                    .jwt(Customizer.withDefaults())
                    .authenticationEntryPoint(handlers)
                    .accessDeniedHandler(handlers))
        .exceptionHandling(
            handling -> handling.authenticationEntryPoint(handlers).accessDeniedHandler(handlers))
        .build();
  }
}
