package com.ideaconnection.user.org;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MembershipResponse(boolean member, OrganizationRole role) {}
