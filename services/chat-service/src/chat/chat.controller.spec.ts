import { BadRequestException } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { MembershipService } from '../membership/membership.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { DecisionService } from './decision.service';

describe('ChatController', () => {
  const auth = 'Bearer t';
  let controller: ChatController;
  let membershipService: { assertMember: jest.Mock; isMember: jest.Mock };
  let decisionService: { register: jest.Mock; list: jest.Mock };
  let chatService: {
    getChannels: jest.Mock;
    getChannel: jest.Mock;
    createChannel: jest.Mock;
    createMessage: jest.Mock;
    getMessage: jest.Mock;
  };

  beforeEach(() => {
    decisionService = {
      register: jest.fn(),
      list: jest.fn().mockResolvedValue([]),
    };
    membershipService = {
      assertMember: jest.fn().mockResolvedValue(undefined),
      isMember: jest.fn().mockResolvedValue(true),
    };
    chatService = {
      getChannels: jest.fn().mockResolvedValue([]),
      getChannel: jest.fn().mockResolvedValue({ orgId: 'org1' }),
      createChannel: jest.fn().mockResolvedValue({}),
      createMessage: jest.fn().mockResolvedValue({}),
      getMessage: jest.fn().mockResolvedValue({ _id: 'm1', orgId: 'org1' }),
    };

    controller = new ChatController(
      chatService as unknown as ChatService,
      {
        verifyToken: jest.fn().mockResolvedValue({ userId: 'u1' }),
      } as unknown as AuthService,
      membershipService as unknown as MembershipService,
      decisionService as unknown as DecisionService,
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
        [],
      );
    });
  });

  describe('결정 등록', () => {
    const res = () => ({ status: jest.fn() });

    it('처음 등록이면 201', async () => {
      decisionService.register.mockResolvedValue({
        decision: { id: 'd1' },
        created: true,
      });
      const r = res();
      await expect(
        controller.registerDecision(auth, 'm1', r as never),
      ).resolves.toEqual({ id: 'd1' });
      expect(r.status).toHaveBeenCalledWith(201);
    });

    it('이미 등록된 메시지면 200', async () => {
      decisionService.register.mockResolvedValue({
        decision: { id: 'd1' },
        created: false,
      });
      const r = res();
      await controller.registerDecision(auth, 'm1', r as never);
      expect(r.status).toHaveBeenCalledWith(200);
    });

    it('메시지 조직의 멤버가 아니면 등록하지 않는다', async () => {
      membershipService.assertMember.mockRejectedValue(new Error('403'));
      await expect(
        controller.registerDecision(auth, 'm1', res() as never),
      ).rejects.toThrow('403');
      expect(decisionService.register).not.toHaveBeenCalled();
    });

    it('목록은 orgId가 문자열이 아니면 400', async () => {
      await expect(
        controller.getDecisions(auth, ['a', 'b']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('첨부', () => {
    const file = {
      fileId: '5',
      name: '기획서.pdf',
      contentType: 'application/pdf',
    };
    const send = (attachments: unknown) =>
      controller.createMessage(auth, 'ch1', {
        clientMessageId: 'c1',
        text: '',
        attachments,
      });

    it.each([
      ['목록이 아님', file],
      ['fileId 없음', [{ name: 'a', contentType: 'b' }]],
      ['숫자 fileId', [{ ...file, fileId: 5 }]],
      ['6개', Array.from({ length: 6 }, () => file)],
    ])('%s이면 400', async (_name, value) => {
      await expect(send(value)).rejects.toBeInstanceOf(BadRequestException);
      expect(chatService.createMessage).not.toHaveBeenCalled();
    });

    it('필요한 칸만 골라 서비스로 넘긴다', async () => {
      await send([{ ...file, extra: 'x' }]);
      expect(chatService.createMessage).toHaveBeenCalledWith(
        'ch1',
        'u1',
        'c1',
        '',
        [],
        [file],
      );
    });
  });
});
