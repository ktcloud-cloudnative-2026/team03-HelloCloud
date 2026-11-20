import { ServiceUnavailableException } from '@nestjs/common';
import { Connection, ConnectionStates } from 'mongoose';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controllerWith = (readyState: ConnectionStates) =>
    new HealthController({ readyState } as Connection);

  it('liveness는 DB와 상관없이 UP', () => {
    expect(controllerWith(ConnectionStates.disconnected).liveness()).toEqual({
      status: 'UP',
    });
  });

  it('readiness는 MongoDB가 연결되면 UP', () => {
    expect(controllerWith(ConnectionStates.connected).readiness()).toEqual({
      status: 'UP',
    });
  });

  it('readiness는 MongoDB가 끊기면 503', () => {
    expect(() =>
      controllerWith(ConnectionStates.disconnected).readiness(),
    ).toThrow(ServiceUnavailableException);
  });
});
