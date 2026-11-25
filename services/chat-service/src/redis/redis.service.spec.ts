import { createClient } from 'redis';
import { RedisService } from './redis.service';

jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

describe('RedisService Keepalive', () => {
  const originalEnv = process.env;
  const mockCreateClient = jest.mocked(createClient);

  const subscriber = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
  };

  const publisher = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
    duplicate: jest.fn().mockReturnValue(subscriber),
  };

  let service: RedisService;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env = {
      ...originalEnv,
      REDIS_URL: 'redis://localhost:6379',
    };

    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_PING_INTERVAL_MS;

    mockCreateClient.mockReturnValue(
      publisher as unknown as ReturnType<typeof createClient>,
    );

    service = new RedisService();
  });

  afterEach(async () => {
    try {
      await service.onModuleDestroy();
    } finally {
      process.env = originalEnv;
    }
  });

  it('PING 주기를 설정하지 않으면 기본 30초를 적용한다', async () => {
    await service.connect();

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        pingInterval: 30000,
      }),
    );
  });

  it('환경 변수로 지정한 PING 주기를 적용한다', async () => {
    process.env.REDIS_PING_INTERVAL_MS = '15000';

    await service.connect();

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        pingInterval: 15000,
      }),
    );
  });

  it.each(['0', '-1000', '1.5', 'invalid', '2147483648', ''])(
    '잘못된 PING 주기 설정을 거부한다: "%s"',
    async (interval) => {
      process.env.REDIS_PING_INTERVAL_MS = interval;

      await expect(service.connect()).rejects.toThrow(
        'REDIS_PING_INTERVAL_MS는 유효한 양의 정수여야 합니다.',
      );

      expect(mockCreateClient).not.toHaveBeenCalled();
    },
  );

  it('Publisher를 복제하여 Subscriber를 생성한다', async () => {
    await service.connect();

    expect(publisher.duplicate).toHaveBeenCalledTimes(1);
  });

  it('Publisher와 Subscriber를 모두 연결한다', async () => {
    await service.connect();

    expect(publisher.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.connect).toHaveBeenCalledTimes(1);
  });

  it('서비스 종료 시 두 Redis 연결을 정리한다', async () => {
    await service.connect();
    await service.onModuleDestroy();

    expect(publisher.destroy).toHaveBeenCalledTimes(1);
    expect(subscriber.destroy).toHaveBeenCalledTimes(1);
  });
});
