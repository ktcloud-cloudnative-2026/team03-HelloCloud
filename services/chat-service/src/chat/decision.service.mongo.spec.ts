// 실제 MongoDB로 결정 등록의 중복 방지를 확인한다. MONGO_TEST_URL이 있을 때만 돈다
import mongoose, { Model, Types } from 'mongoose';

import { DecisionService } from './decision.service';
import { Decision, DecisionSchema } from './schemas/decision.schema';

const url = process.env.MONGO_TEST_URL;
const describeMongo = url ? describe : describe.skip;

describeMongo('DecisionService (MongoDB)', () => {
  let connection: mongoose.Connection;
  let service: DecisionService;

  const message = (text = '배포는 금요일에 하지 않는다') => ({
    _id: new Types.ObjectId(),
    orgId: 'org1',
    channelId: 'c1',
    senderId: 'alice',
    text,
  });

  beforeAll(async () => {
    connection = await mongoose
      .createConnection(`${url}/decision_test_${Date.now()}`)
      .asPromise();
    const model = connection.model(
      Decision.name,
      DecisionSchema,
    ) as unknown as Model<Decision>;
    await model.syncIndexes();
    service = new DecisionService(model);
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  it('작성자 · 등록한 사람 · 원본 위치 · 시각을 남긴다', async () => {
    const source = message();
    const { decision, created } = await service.register(source, 'bob');

    expect(created).toBe(true);
    expect(decision).toMatchObject({
      orgId: 'org1',
      sourceChannelId: 'c1',
      sourceMessageId: String(source._id),
      text: source.text,
      authorId: 'alice',
      registeredBy: 'bob',
    });
    expect(Number.isNaN(Date.parse(decision.registeredAt))).toBe(false);
  });

  it('같은 메시지를 다시 등록하면 처음 기록을 준다(동시에 눌러도)', async () => {
    const source = message('동시 등록');
    const results = await Promise.all(
      ['bob', 'carol', 'dave'].map((u) => service.register(source, u)),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.decision.id)).size).toBe(1);
  });

  it('목록은 그 조직만, 최근 순', async () => {
    await service.register({ ...message('다른 조직'), orgId: 'org2' }, 'bob');
    const last = message('가장 최근');
    await service.register(last, 'bob');

    const list = await service.list('org1');
    expect(list[0].sourceMessageId).toBe(String(last._id));
    expect(list.every((d) => d.orgId === 'org1')).toBe(true);
  });
});
