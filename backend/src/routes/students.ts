import { Router } from "express";
import { createStudentInput, studentIdParam, type CreateStudentData } from "@se/shared";
import type { AppContext } from "../context.js";
import { getAuth, requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validate } from "../middleware/validate.js";
import {
  createStudent,
  deleteStudent,
  listStudents,
  resetPassword,
} from "../services/studentService.js";

/** /api/students 路由（contracts/api.md Students，全部限老師：FR-012～FR-014）。 */
export function studentsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx), requireRole("TEACHER"));

  router.get("/", (_req, res) => {
    res.json({ students: listStudents(ctx) });
  });

  router.post("/", validate({ body: createStudentInput }), async (_req, res) => {
    const student = await createStudent(ctx, res.locals.body as CreateStudentData, getAuth(res).user);
    res.status(201).json({ student });
  });

  router.delete("/:studentId", validate({ params: studentIdParam }), (_req, res) => {
    const { studentId } = res.locals.params as { studentId: string };
    deleteStudent(ctx, studentId, getAuth(res).user);
    res.status(204).end();
  });

  // 沒有內容的 POST，不檢查 Content-Type（contracts/api.md）
  router.post("/:studentId/reset-password", validate({ params: studentIdParam }), async (_req, res) => {
    const { studentId } = res.locals.params as { studentId: string };
    await resetPassword(ctx, studentId, getAuth(res).user);
    res.status(204).end();
  });

  return router;
}
