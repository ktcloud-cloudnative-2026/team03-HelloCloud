import { ChatService } from './chat.service';
import { ChannelType } from './schemas/channel.schema';
import { Channel } from './schemas/channel.schema';
import { Message } from './schemas/message.schema';
import { RedisService } from '../redis/redis.service';
import { Model } from 'mongoose';

describe('ChatService 채널 응답', () => {
  const raw = {
    _id: { toString: () => '6721f0a3' },
    orgId: 'org1',
    name: '개발',
    type: ChannelType.NORMAL,
  };

  const service = (channelModel: object) =>
    new ChatService(
      channelModel as Model<Channel>,
      {} as Model<Message>,
      {} as RedisService,
    );

  it('목록은 _id 대신 id 문자열로 준다', async () => {
    const chain = {
      sort: () => chain,
      lean: () => chain,
      exec: () => Promise.resolve([raw]),
    };
    const channels = await service({ find: () => chain }).getChannels('org1');

    expect(channels).toEqual([
      { id: '6721f0a3', orgId: 'org1', name: '개발', type: ChannelType.NORMAL },
    ]);
  });

  it('생성 응답도 id 문자열로 준다', async () => {
    const channel = await service({
      create: () => Promise.resolve({ toObject: () => raw }),
    }).createChannel('org1', '개발', 'u1');

    expect(channel).toEqual({
      id: '6721f0a3',
      orgId: 'org1',
      name: '개발',
      type: ChannelType.NORMAL,
    });
  });
});
