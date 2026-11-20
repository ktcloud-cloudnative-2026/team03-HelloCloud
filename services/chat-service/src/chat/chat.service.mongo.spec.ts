// 실제 MongoDB로 확인 요청 · 이모지 쿼리를 확인한다. MONGO_TEST_URL이 있을 때만 돈다
// (CI의 Docker 빌드 안에는 MongoDB가 없다). 예: docker run -d -p 27017:27017 mongo:8.0.34
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import mongoose, { Model } from 'mongoose';

import { RedisService } from '../redis/redis.service';
import { ChatService } from './chat.service';
import { Channel, ChannelSchema } from './schemas/channel.schema';
import { Message, MessageSchema } from './schemas/message.schema';

const url = process.env.MONGO_TEST_URL;
const describeMongo = url ? describe : describe.skip;

describeMongo('ChatService (MongoDB)', () => {
  let connection: mongoose.Connection;
  let service: ChatService;
  let published: { type: string; message: { id: string } }[];
  let channelId: string;

  beforeAll(async () => {
    connection = await mongoose
      .createConnection(`${url}/chat_test_${Date.now()}`)
      .asPromise();
    const channels = connection.model(
      Channel.name,
      ChannelSchema,
    ) as unknown as Model<Channel>;
    const messages = connection.model(
      Message.name,
      MessageSchema,
    ) as unknown as Model<Message>;
    await messages.syncIndexes();
    published = [];
    service = new ChatService(channels, messages, {
      publish: (_ch: string, event: never) => {
        published.push(event);
        return Promise.resolve(1);
      },
    } as unknown as RedisService);
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  beforeEach(async () => {
    published = [];
    channelId = (await service.createChannel('org1', '개발', 'alice')).id;
  });

  const send = (ack: string[]) =>
    service.createMessage(
      channelId,
      'alice',
      `c-${Math.random()}`,
      '확인 부탁',
      ack,
    );

  it('확인 요청 대상에서 보낸 사람은 빠진다', async () => {
    const message = await send(['bob', 'alice', 'carol']);
    expect(message.acknowledgement.requiredUserIds).toEqual(['bob', 'carol']);
  });

  it('보낸 사람만 확인 현황을 보고, 확인한 사람은 시각이 찬다', async () => {
    const message = await send(['bob', 'carol']);
    await service.confirm(message.id, 'bob');

    const status = await service.getAcknowledgements(message.id, 'alice');
    expect(status.users.map((u) => [u.userId, u.confirmedAt !== null])).toEqual(
      [
        ['bob', true],
        ['carol', false],
      ],
    );
    await expect(
      service.getAcknowledgements(message.id, 'bob'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('확인은 지정된 사람만, 두 번 눌러도 한 번만 남는다', async () => {
    const message = await send(['bob']);
    await service.confirm(message.id, 'bob');
    const again = await service.confirm(message.id, 'bob');

    expect(again.acknowledgement.confirmed).toHaveLength(1);
    expect(published.map((e) => e.type)).toEqual([
      'MESSAGE_CREATED',
      'MESSAGE_UPDATED',
    ]);
    await expect(service.confirm(message.id, 'dave')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('이모지는 사람마다 한 번, 취소하면 빈 이모지는 사라진다', async () => {
    const message = await send([]);
    await service.addReaction(message.id, 'bob', '👍');
    await service.addReaction(message.id, 'bob', '👍');
    const both = await service.addReaction(message.id, 'carol', '👍');
    expect(both.reactions).toEqual([
      { emoji: '👍', userIds: ['bob', 'carol'] },
    ]);

    await service.addReaction(message.id, 'bob', '🎉');
    await service.removeReaction(message.id, 'bob', '🎉');
    await service.removeReaction(message.id, 'bob', '👍');
    const after = await service.getMessage(message.id);
    expect(after.reactions).toEqual([{ emoji: '👍', userIds: ['carol'] }]);
    expect(published.at(-1)?.type).toBe('MESSAGE_UPDATED');
  });

  it('동시에 같은 이모지를 처음 눌러도 한 항목으로 합쳐진다', async () => {
    const message = await send([]);
    await Promise.all(
      ['b', 'c', 'd', 'e'].map((u) => service.addReaction(message.id, u, '👀')),
    );
    const after = await service.getMessage(message.id);
    expect(after.reactions).toHaveLength(1);
    expect([...after.reactions[0].userIds].sort()).toEqual([
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('허용하지 않은 이모지는 400', async () => {
    const message = await send([]);
    await expect(
      service.addReaction(message.id, 'bob', '💩'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('첨부만 있으면 글 없이 보낼 수 있고, 둘 다 없으면 400', async () => {
    const file = {
      fileId: '5',
      name: '기획서.pdf',
      contentType: 'application/pdf',
    };
    const message = await service.createMessage(
      channelId,
      'alice',
      'c-file',
      '',
      [],
      [file],
    );
    expect(message.attachments).toEqual([file]);
    expect(message.text).toBe('');

    await expect(
      service.createMessage(channelId, 'alice', 'c-empty', '  ', [], []),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
