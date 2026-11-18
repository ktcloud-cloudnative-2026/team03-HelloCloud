
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type MembershipResponse = {
  member: boolean;
  role?: string;
};

@Injectable()
export class MembershipService {
  private readonly userServiceUrl =
    process.env.USER_SERVICE_URL ??
    'http://user-service.ideaconnection-dev.svc.cluster.local:80';

  async assertMember(
    orgId: string,
    userId: string,
    token: string,
  ): Promise<void> {
    if (!token) {
      throw new ForbiddenException('인증 토큰이 필요합니다.');
    }

    const url = new URL(
      `/internal/users/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
      this.userServiceUrl,
    );

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException(
        '조직 멤버십 확인 서비스에 연결할 수 없습니다.',
      );
    }

    if (response.status === 403 || response.status === 404) {
      throw new ForbiddenException('조직 접근 권한이 없습니다.');
    }

    if (response.status === 401) {
      throw new ForbiddenException('유효하지 않은 인증 토큰입니다.');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        '조직 멤버십 확인에 실패했습니다.',
      );
    }

    let membership: MembershipResponse;

    try {
      membership = (await response.json()) as MembershipResponse;
    } catch {
      throw new ServiceUnavailableException(
        '조직 멤버십 응답이 올바르지 않습니다.',
      );
    }

    if (membership?.member !== true) {
      throw new ForbiddenException('해당 조직의 구성원이 아닙니다.');
    }
  }
}
