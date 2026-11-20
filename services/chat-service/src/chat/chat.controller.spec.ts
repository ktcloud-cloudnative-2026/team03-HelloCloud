import { BadRequestException } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { MembershipService } from '../membership/membership.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  const auth = 'Bearer t';
  let controller: ChatController;
  let membershipService: { assertMember: jest.Mock; isMember: jest.Mock };
  let chatService: {
    getChannels: jest.Mock;
    getChannel: jest.Mock;
    createChannel: jest.Mock;
    createMessage: jest.Mock;
  };

  beforeEach(() => {
    membershipService = {
      assertMember: jest.fn().mockResolvedValue(undefined),
      isMember: jest.fn().mockResolvedValue(true),
    };
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
      membershipService as unknown as MembershipService,
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
      [],
    );
  });

  describe('확인 요청 대상', () => {
    const send = (acknowledgementUserIds: unknown) =>
      controller.createMessage(auth, 'ch1', {
        clientMessageId: 'c1',
        text: 'hi',
        acknowledgementUserIds,
      });

    it.each([
      ['문자열', 'u2'],
      ['숫자 목록', [1]],
      ['빈 문자열', ['']],
    ])('%s이면 400', async (_name, value) => {
      await expect(send(value)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('21명 이상이면 400', async () => {
      const many = Array.from({ length: 21 }, (_, i) => `u${i}`);
      await expect(send(many)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('조직 멤버가 아닌 사람이 있으면 400', async () => {
      membershipService.isMember.mockImplementation((_org, id) =>
        Promise.resolve(id !== 'outsider'),
      );
      await expect(send(['u2', 'outsider'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(chatService.createMessage).not.toHaveBeenCalled();
    });

    it('중복을 빼고 서비스로 넘긴다', async () => {
      await send(['u2', 'u3', 'u2']);
      expect(chatService.createMessage).toHaveBeenCalledWith(
        'ch1',
        'u1',
        'c1',
        'hi',
        ['u2', 'u3'],
      );
    });
  });
});
