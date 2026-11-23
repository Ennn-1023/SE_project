import { Router } from 'express';
import type { UserRepository } from '../domain/ports.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import type { Student } from '../domain/types.js';
import { assignBody, selfSelectBody, setGroupCountBody } from '../schemas/groups.js';
import { studentIdParams } from '../schemas/students.js';
import { toStudentListItem } from './studentRoutes.js';
import type { GroupService } from '../services/groupService.js';
import type { SessionService } from '../services/sessionService.js';

export interface GroupRoutesDeps {
  groups: GroupService;
  sessions: SessionService;
  users: UserRepository;
}

/** GroupRoutes（/api/groups）。 */
export function groupRoutes(deps: GroupRoutesDeps): Router {
  const router = Router();
  router.use(requireAuth(deps.sessions, deps.users));
  const withGroupCount = () => ({ groupCount: deps.groups.getSettings().groupCount });

  router.get('/settings', (_req, res) => {
    res.json(deps.groups.getSettings());
  });

  router.get('/me', requireRole('STUDENT'), (req, res) => {
    res.json(deps.groups.getMyGroup(req.auth!.user.account));
  });

  router.post(
    '/me',
    requireRole('STUDENT'),
    validate({ body: selfSelectBody, details: withGroupCount }),
    (req, res) => {
      const student = deps.groups.selfSelect(req.auth!.user.account, req.body.groupNumber);
      res.json({
        groupNumber: student.groupNumber,
        groupCount: deps.groups.getSettings().groupCount,
      });
    },
  );

  const teacherOnly = requireRole('TEACHER');
  const member = (s: Student) => ({ studentId: s.studentId, name: s.displayName });

  router.put('/settings', teacherOnly, validate({ body: setGroupCountBody }), (req, res) => {
    res.json(deps.groups.setGroupCount(req.body.groupCount));
  });

  router.get('/overview', teacherOnly, (_req, res) => {
    const groups = deps.groups.overview();
    res.json({
      groupCount: deps.groups.getSettings().groupCount,
      groups: groups.map((g) => ({
        groupNumber: g.groupNumber,
        members: g.members.map(member),
        memberCount: g.memberCount,
      })),
      unassigned: deps.groups.unassigned().map(member),
    });
  });

  router.put(
    '/assignments/:studentId',
    teacherOnly,
    validate({ params: studentIdParams, body: assignBody, details: withGroupCount }),
    (req, res) => {
      const student = deps.groups.assign(String(req.params.studentId), req.body.groupNumber);
      res.json({ student: toStudentListItem(student) });
    },
  );

  return router;
}
