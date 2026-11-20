import { BadRequestException } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { MembershipService } from '../membership/membership.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  const auth = 'Bearer t';
  let controller: ChatController;
  let chatService: {
    getChannels: jest.Mock;
    getChannel: jest.Mock;
    createChannel: jest.Mock;
    createMessage: jest.Mock;
  };

  beforeEach(() => {
    chatService = {
      getChannels: jest.fn().mockResolvedValue([]),
      getChannel: jest.fn().mockResolvedValue({ orgId: 'org1' }),
      createChannel: jest.fn().mockResolvedValue({}),
      createMessage: jest.fn().mockResolvedValue({}),
    };

    controller = new ChatController(
      chatService as unknown as ChatService,
      {
        verifyToken: jest.fn().mockResolvedValue({ userId: 'u1' }),
      } as unknown as AuthService,
      {
        assertMember: jest.fn().mockResolvedValue(undefined),
      } as unknown as MembershipService,
    );
  });

  it('orgId 쿼리가 여러 번 오면 400', async () => {
    await expect(
      controller.getChannels(auth, ['a', 'b']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    [{ orgId: 1, name: 'a' }],
    [{ orgId: 'org1', name: 5 }],
    [{ orgId: 'org1', name: 'a', type: {} }],
  ])('채널 생성 본문에 문자열이 아닌 값이 있으면 400: %j', async (body) => {
    await expect(controller.createChannel(auth, body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(chatService.createChannel).not.toHaveBeenCalled();
  });

  it.each([
    [{ clientMessageId: 123, text: 'hi' }],
    [{ clientMessageId: 'c1', text: ['hi'] }],
  ])('메시지 본문에 문자열이 아닌 값이 있으면 400: %j', async (body) => {
    await expect(
      controller.createMessage(auth, 'ch1', body),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(chatService.createMessage).not.toHaveBeenCalled();
  });

  it('정상 값은 서비스로 넘긴다', async () => {
    await controller.createMessage(auth, 'ch1', {
      clientMessageId: 'c1',
      text: 'hi',
    });

    expect(chatService.createMessage).toHaveBeenCalledWith(
      'ch1',
      'u1',
      'c1',
      'hi',
    );
  });
});
