import type { Server as HttpServer } from 'node:http';
import { Server, type Namespace } from 'socket.io';
import type { TeacherActivityView } from '@buzzer/shared';
import type { Realtime, ViewFor } from '../context';
import type { Student } from '../domain/buzzerTypes';
import {
  authenticateCookie,
  authenticateTeacherCookie,
  type SocketAuthDeps,
} from '../http/middleware/auth';
import { toErrorBody } from '../http/middleware/errorHandler';

/** SocketServer（004 組件圖）：createRealtime 回傳的推播伺服器 */
export type SocketServer = Realtime & { io: Server };

export const STATE_EVENT = 'state:update';
export const TEACHER_EVENT = 'teacher:update';
/** 在線人數變化時推播給老師的節流間隔（004 research.md R10） */
export const PRESENCE_THROTTLE_MS = 300;

interface Options extends SocketAuthDeps {
  clientOrigin: string;
  viewFor: ViewFor;
  /** 老師視圖（004 contracts/socket-events.md）；與 GET /api/teacher/activity 相同 */
  teacherView?: () => TeacherActivityView;
}

const rejectWith = (code: 'UNAUTHORIZED' | 'FORBIDDEN') => {
  const { body } = toErrorBody(code);
  const err = new Error(code) as Error & { data?: unknown };
  err.data = body.error;
  return err;
};

/**
 * Socket.IO（002 contracts/socket-events.md；004 contracts/socket-events.md）。只有伺服器 → 客戶端推播。
 * - /student：每次推播都依學生「目前」的組別各自產生視角，絕不對所有人廣播含送出資料的 payload；
 *   同時依學號追蹤在線連線（同一學生多分頁算 1 人）。
 * - /teacher：只限老師，推送 TeacherActivityView（含監控資料），學生無法連線。
 */
export function createRealtime(httpServer: HttpServer, opts: Options): SocketServer {
  // pingInterval／pingTimeout 縮短，異常斷線約 9 秒內偵測（FR-022：在線狀態 10 秒內反映）
  const io = new Server(httpServer, {
    cors: { origin: opts.clientOrigin, credentials: true },
    pingInterval: 4000,
    pingTimeout: 5000,
  });
  const nsp: Namespace = io.of('/student');
  const teachers: Namespace = io.of('/teacher');

  /** 學號 → 連線 id 集合 */
  const presence = new Map<string, Set<string>>();
  let presenceTimer: ReturnType<typeof setTimeout> | null = null;

  const pushTeachers = () => {
    if (!opts.teacherView || teachers.sockets.size === 0) return;
    const view = opts.teacherView();
    teachers.emit(TEACHER_EVENT, view);
  };

  /** 在線人數變化：節流後推播給老師 */
  const presenceChanged = () => {
    if (presenceTimer) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      pushTeachers();
    }, PRESENCE_THROTTLE_MS);
  };

  nsp.use((socket, next) => {
    const student = authenticateCookie(socket.handshake.headers.cookie, opts);
    if (!student) {
      next(rejectWith('UNAUTHORIZED'));
      return;
    }
    socket.data.studentId = student.studentId;
    next();
  });

  /** 依學號重新查出學生（含目前組別）；帳號已不存在時回傳 null */
  const current = (studentId: string): Student | null => opts.repo.getStudent(studentId);

  nsp.on('connection', (socket) => {
    const studentId = socket.data.studentId as string;
    const student = current(studentId);
    // 連線（含重連）成功後立即送出目前的學生視角
    if (student) socket.emit(STATE_EVENT, opts.viewFor(student));

    const set = presence.get(studentId) ?? new Set<string>();
    const wasOnline = set.size > 0;
    set.add(socket.id);
    presence.set(studentId, set);
    if (!wasOnline) presenceChanged();

    socket.on('disconnect', () => {
      const s = presence.get(studentId);
      if (!s) return;
      s.delete(socket.id);
      if (s.size === 0) {
        presence.delete(studentId);
        presenceChanged();
      }
    });
  });

  teachers.use((socket, next) => {
    const result = authenticateTeacherCookie(socket.handshake.headers.cookie, opts);
    if (result === 'UNAUTHORIZED' || result === 'FORBIDDEN') {
      next(rejectWith(result));
      return;
    }
    socket.data.userId = result;
    next();
  });

  teachers.on('connection', (socket) => {
    if (opts.teacherView) socket.emit(TEACHER_EVENT, opts.teacherView());
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
    pushTeachers,
    onlineStudents() {
      return new Set(presence.keys());
    },
    close() {
      if (presenceTimer) clearTimeout(presenceTimer);
      return new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
    },
  };
}
