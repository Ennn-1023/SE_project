import type { Server as HttpServer } from 'node:http';
import { Server, type Namespace } from 'socket.io';
import type { Repository } from '../data/repositories';
import type { Realtime, ViewFor } from '../context';
import type { Student } from '../domain/types';
import { authenticate } from '../http/middleware/auth';
import { toErrorBody } from '../http/middleware/errorHandler';

export const STATE_EVENT = 'state:update';

const teamRoom = (teamId: string) => `team:${teamId}`;
const studentRoom = (studentId: string) => `student:${studentId}`;

interface Options {
  secret: string;
  clientOrigin: string;
  repo: Repository;
  viewFor: ViewFor;
}

/**
 * /student namespace（contracts/socket-events.md）。只有伺服器 → 學生推播；
 * 每個 room 各自產生視角後才送出，絕不對所有人廣播含送出資料的 payload。
 */
export function createRealtime(httpServer: HttpServer, opts: Options): Realtime & { io: Server } {
  const io = new Server(httpServer, { cors: { origin: opts.clientOrigin } });
  const nsp: Namespace = io.of('/student');

  nsp.use((socket, next) => {
    const student = authenticate(socket.handshake.auth?.token, opts.secret, opts.repo);
    if (!student) {
      const { body } = toErrorBody('UNAUTHORIZED');
      const err = new Error('UNAUTHORIZED') as Error & { data?: unknown };
      err.data = body.error;
      next(err);
      return;
    }
    socket.data.student = student;
    next();
  });

  nsp.on('connection', (socket) => {
    const student = socket.data.student as Student;
    void socket.join(student.teamId ? teamRoom(student.teamId) : studentRoom(student.studentId));
    // 連線（含重連）成功後立即送出目前的學生視角
    socket.emit(STATE_EVENT, opts.viewFor(student));
  });

  const pushToRoom = (room: string, student: { studentId: string; teamId: string | null }) => {
    nsp.to(room).emit(STATE_EVENT, opts.viewFor(student));
  };

  return {
    io,
    pushToTeam(teamId) {
      pushToRoom(teamRoom(teamId), { studentId: '', teamId });
    },
    pushAll() {
      for (const room of nsp.adapter.rooms.keys()) {
        if (room.startsWith('team:')) {
          pushToRoom(room, { studentId: '', teamId: room.slice('team:'.length) });
        } else if (room.startsWith('student:')) {
          pushToRoom(room, { studentId: room.slice('student:'.length), teamId: null });
        }
      }
    },
    close() {
      return new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
    },
  };
}
