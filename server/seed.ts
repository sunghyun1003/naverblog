import type { Actor } from "./domain/types.js";
import type { AutomationSystem } from "./system.js";

const demoActor: Actor = { id: "demo-admin", roles: ["admin"] };

export async function seedDemoData(system: AutomationSystem): Promise<void> {
  const existing = await system.contentService.list();
  if (existing.length > 0) return;
  const content = await system.contentService.create(
    {
      title: "실손보험 세대별 차이, 무엇이 달라졌을까?",
      topic: "실손보험 세대별 차이",
      strategy: "trend",
      assigneeId: "demo-editor",
      idempotencyKey: "demo-content-silson-generations",
    },
    demoActor,
  );
  await system.contentService.runPipeline(content.id, "demo-pipeline-silson-generations", demoActor);
}
