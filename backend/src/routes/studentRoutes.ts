import { Router } from 'express';
import type { UserRepository } from '../domain/ports.js';
import type { Student } from '../domain/types.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createStudentBody, studentIdParams } from '../schemas/students.js';
import type { AccountService } from '../services/accountService.js';
import type { SessionService } from '../services/sessionService.js';

/** StudentListItem（openapi.yaml）。 */
export function toStudentListItem(s: Student) {
  return {
    studentId: s.studentId,
    name: s.displayName,
    groupNumber: s.groupNumber,
    usingDefaultPassword: s.usingDefaultPassword,
  };
}

export interface StudentRoutesDeps {
  accounts: AccountService;
  sessions: SessionService;
  users: UserRepository;
}

/** StudentRoutes（/api/students）：皆需老師角色。 */
export function studentRoutes(deps: StudentRoutesDeps): Router {
  const router = Router();
  router.use(requireAuth(deps.sessions, deps.users), requireRole('TEACHER'));

  router.get('/', (_req, res) => {
    res.json({ students: deps.accounts.listStudents().map(toStudentListItem) });
  });

  router.post('/', validate({ body: createStudentBody }), async (req, res) => {
    const student = await deps.accounts.createStudent(req.body);
    res.status(201).json({ student: toStudentListItem(student) });
  });

  router.post(
    '/:studentId/reset-password',
    validate({ params: studentIdParams }),
    async (req, res) => {
      await deps.accounts.resetPassword(String(req.params.studentId));
      res.status(204).end();
    },
  );

  return router;
}
