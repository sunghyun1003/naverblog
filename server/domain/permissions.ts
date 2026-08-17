import { DomainError } from "./errors.js";
import type { Actor, UserRole } from "./types.js";

export type Permission =
  | "content:create"
  | "content:edit"
  | "pipeline:run"
  | "content:review"
  | "content:approve"
  | "content:schedule"
  | "content:publish"
  | "settings:manage";

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  planner: ["content:create", "content:edit", "pipeline:run"],
  editor: ["content:create", "content:edit", "pipeline:run"],
  reviewer: ["content:review"],
  approver: ["content:review", "content:approve"],
  publisher: ["content:schedule", "content:publish"],
  admin: [
    "content:create",
    "content:edit",
    "pipeline:run",
    "content:review",
    "content:approve",
    "content:schedule",
    "content:publish",
    "settings:manage",
  ],
};

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return actor.roles.some((role) => rolePermissions[role].includes(permission));
}

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor, permission)) {
    throw new DomainError("FORBIDDEN", `권한이 없습니다: ${permission}`, 403, {
      actorId: actor.id,
      roles: actor.roles,
      permission,
    });
  }
}
