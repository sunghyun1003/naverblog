import { createMockAdapters } from "./adapters/mock.js";
import type { AutomationAdapters } from "./adapters/contracts.js";
import { randomId, systemClock, type Clock, type IdFactory } from "./domain/utils.js";
import { InMemoryAutomationRepository } from "./repositories/in-memory.js";
import type { AutomationRepository } from "./repositories/contracts.js";
import { ContentService } from "./services/content-service.js";

export interface AutomationSystem {
  repository: AutomationRepository;
  adapters: AutomationAdapters;
  contentService: ContentService;
}

export interface SystemOptions {
  repository?: AutomationRepository;
  adapters?: AutomationAdapters;
  clock?: Clock;
  id?: IdFactory;
}

export function createAutomationSystem(options: SystemOptions = {}): AutomationSystem {
  const clock = options.clock ?? systemClock;
  const id = options.id ?? randomId;
  const repository = options.repository ?? new InMemoryAutomationRepository();
  const adapters = options.adapters ?? createMockAdapters(clock, id);
  return {
    repository,
    adapters,
    contentService: new ContentService(repository, adapters, clock, id),
  };
}
