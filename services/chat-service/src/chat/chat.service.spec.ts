import { BadRequestException, NotFoundException } from '@nestjs/common';

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

  it('이름을 바꾸면 앞뒤 공백을 빼고 저장하고 id 문자열로 준다', async () => {
    const findByIdAndUpdate = jest.fn(() => ({
      lean: () => ({ exec: () => Promise.resolve({ ...raw, name: '기획' }) }),
    }));

    const channel = await service({ findByIdAndUpdate }).renameChannel(
      '6721f0a36721f0a36721f0a3',
      '  기획 ',
    );

    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      '6721f0a36721f0a36721f0a3',
      { $set: { name: '기획' } },
      { new: true },
    );
    expect(channel).toEqual({
      id: '6721f0a3',
      orgId: 'org1',
      name: '기획',
      type: ChannelType.NORMAL,
    });
  });

  it.each(['', '   ', 'a'.repeat(51)])(
    '이름이 비었거나 50자를 넘으면 400: "%s"',
    async (name) => {
      await expect(
        service({}).renameChannel('6721f0a36721f0a36721f0a3', name),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('없는 채널이면 404', async () => {
    const findByIdAndUpdate = () => ({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    });

    await expect(
      service({ findByIdAndUpdate }).renameChannel('bad-id', '기획'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service({ findByIdAndUpdate }).renameChannel(
        '6721f0a36721f0a36721f0a3',
        '기획',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
