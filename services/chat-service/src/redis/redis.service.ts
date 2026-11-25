import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private publisher: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private publisherErrorLogged = false;
  private subscriberErrorLogged = false;
  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async connect(): Promise<void> {
    if (this.publisher?.isOpen && this.subscriber?.isOpen) {
      return;
    }

    const redisUrl = process.env.REDIS_URL;
    const redisPassword = process.env.REDIS_PASSWORD;
    const redisPingInterval = Number(
      process.env.REDIS_PING_INTERVAL_MS ?? '30000',
    );

    if (!redisUrl) {
      throw new Error('REDIS_URL 환경변수가 설정되지 않았습니다.');
    }

    if (
      !Number.isInteger(redisPingInterval) ||
      redisPingInterval <= 0 ||
      redisPingInterval > 2_147_483_647
    ) {
      throw new Error('REDIS_PING_INTERVAL_MS는 유효한 양의 정수여야 합니다.');
    }

    const options = {
      url: redisUrl,
      ...(redisPassword ? { password: redisPassword } : {}),
      // 네트워크 프록시의 유휴 연결 종료를 방지합니다.
      pingInterval: redisPingInterval,
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
      },
    };

    const publisher = createClient(options);
    const subscriber = publisher.duplicate();

    publisher.on('error', (error: Error) => {
      if (!this.publisherErrorLogged) {
        this.logger.error(`Redis Publisher 오류: ${error.message}`);
        this.publisherErrorLogged = true;
      }
    });

    publisher.on('ready', () => {
      if (this.publisherErrorLogged) {
        this.logger.log('Redis Publisher 연결 복구 성공');
        this.publisherErrorLogged = false;
      }
    });

    subscriber.on('error', (error: Error) => {
      if (!this.subscriberErrorLogged) {
        this.logger.error(`Redis Subscriber 오류: ${error.message}`);
        this.subscriberErrorLogged = true;
      }
    });

    subscriber.on('ready', () => {
      if (this.subscriberErrorLogged) {
        this.logger.log('Redis Subscriber 연결 복구 성공');
        this.subscriberErrorLogged = false;
      }
    });

    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);

      this.publisher = publisher;
      this.subscriber = subscriber;

      this.logger.log('Redis Pub/Sub 연결 성공');
    } catch (error) {
      await Promise.allSettled([publisher.destroy(), subscriber.destroy()]);

      throw error;
    }
  }

  async publish(channel: string, message: unknown): Promise<number> {
    if (!this.publisher?.isReady) {
      throw new Error('Redis Publisher가 연결되지 않았습니다.');
    }

    return this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void> {
    if (!this.subscriber?.isReady) {
      throw new Error('Redis Subscriber가 연결되지 않았습니다.');
    }

    await this.subscriber.subscribe(channel, callback);
    this.logger.log(`Redis 채널 구독 완료: ${channel}`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.publisher?.destroy(),
      this.subscriber?.destroy(),
    ]);

    this.publisher = null;
    this.subscriber = null;
  }
}
