import { Navigate, Route, Routes } from "react-router";
import { RequireRole } from "./auth/RequireRole";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { StudentHomePage } from "./pages/StudentHomePage";
import { StudentsPage } from "./pages/StudentsPage";
import { TeacherHomePage } from "./pages/TeacherHomePage";

/** 前端路由（contracts/api.md「前端路由」）。 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/teacher"
        element={
          <RequireRole roles={["TEACHER"]}>
            <TeacherHomePage />
          </RequireRole>
        }
      />
      <Route
        path="/teacher/students"
        element={
          <RequireRole roles={["TEACHER"]}>
            <StudentsPage />
          </RequireRole>
        }
      />
      <Route
        path="/student"
        element={
          <RequireRole roles={["STUDENT"]}>
            <StudentHomePage />
          </RequireRole>
        }
      />
      <Route
        path="/account/password"
        element={
          <RequireRole roles={["TEACHER", "STUDENT"]}>
            <ChangePasswordPage />
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
