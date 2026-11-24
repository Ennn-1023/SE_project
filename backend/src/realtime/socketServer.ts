import type { Server as HttpServer } from 'node:http';
import { Server, type Namespace } from 'socket.io';
import type { Realtime, ViewFor } from '../context';
import type { Student } from '../domain/buzzerTypes';
import { authenticateCookie, type SocketAuthDeps } from '../http/middleware/auth';
import { toErrorBody } from '../http/middleware/errorHandler';

export const STATE_EVENT = 'state:update';

interface Options extends SocketAuthDeps {
  clientOrigin: string;
  viewFor: ViewFor;
}

/**
 * /student namespace（contracts/socket-events.md）。只有伺服器 → 學生推播。
 * 以與 REST 相同的 session cookie 驗證（整合 001 F1）。每次推播都依學生「目前」的組別
 * 各自產生視角後才送出（老師或學生在連線後改變組別也正確），絕不對所有人廣播含送出資料的 payload。
 */
export function createRealtime(httpServer: HttpServer, opts: Options): Realtime & { io: Server } {
  const io = new Server(httpServer, { cors: { origin: opts.clientOrigin, credentials: true } });
  const nsp: Namespace = io.of('/student');

  nsp.use((socket, next) => {
    const student = authenticateCookie(socket.handshake.headers.cookie, opts);
    if (!student) {
      const { body } = toErrorBody('UNAUTHORIZED');
      const err = new Error('UNAUTHORIZED') as Error & { data?: unknown };
      err.data = body.error;
      next(err);
      return;
    }
    socket.data.studentId = student.studentId;
    next();
  });

  /** 依學號重新查出學生（含目前組別）；帳號已不存在時回傳 null */
  const current = (studentId: string): Student | null => opts.repo.getStudent(studentId);

  nsp.on('connection', (socket) => {
    const student = current(socket.data.studentId as string);
    // 連線（含重連）成功後立即送出目前的學生視角
    if (student) socket.emit(STATE_EVENT, opts.viewFor(student));
  });

  /** 對符合條件的每個連線，依其學生目前的組別產生視角並送出 */
  const pushWhere = (match: (s: Student) => boolean) => {
    for (const socket of nsp.sockets.values()) {
      const student = current(socket.data.studentId as string);
      if (student && match(student)) socket.emit(STATE_EVENT, opts.viewFor(student));
    }
  };

  return {
    io,
    pushToTeam(teamId) {
      pushWhere((s) => s.teamId === teamId);
    },
    pushAll() {
      pushWhere(() => true);
    },
    close() {
      return new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
    },
  };
}
