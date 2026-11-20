export * from "./errors.js";
export * from "./schemas/common.js";
export * from "./schemas/auth.js";
export * from "./schemas/students.js";

/** contracts/api.md「共用物件」 */
export type Role = "TEACHER" | "STUDENT";

export interface CurrentUser {
  username: string;
  displayName: string;
  role: Role;
  usesDefaultPassword: boolean;
}

export interface StudentSummary {
  studentId: string;
  name: string;
  group: string | null;
  usesDefaultPassword: boolean;
  createdAt: string;
}

export interface LoginResponse {
  user: CurrentUser;
  redirectTo: "/teacher" | "/student";
}

export function homePathFor(role: Role): "/teacher" | "/student" {
  return role === "TEACHER" ? "/teacher" : "/student";
}
