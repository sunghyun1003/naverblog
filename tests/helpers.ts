import { createMockAdapters } from "../server/adapters/mock.js";
import type { Clock, IdFactory } from "../server/domain/utils.js";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import { createAutomationSystem } from "../server/system.js";

export function deterministicClock(): Clock {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 18, 0, 0, tick++)).toISOString();
}

export function deterministicId(): IdFactory {
  let id = 0;
  return () => `test-id-${++id}`;
}

export function testSystem() {
  const clock = deterministicClock();
  const id = deterministicId();
  const repository = new InMemoryAutomationRepository();
  return createAutomationSystem({ repository, adapters: createMockAdapters(clock, id), clock, id });
}
