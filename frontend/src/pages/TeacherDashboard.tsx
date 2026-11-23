import { useState } from 'react';
import { Link } from 'react-router';
import { Layout } from '../components/Layout';
import { GroupManagePanel } from './GroupManagePanel';
import { StudentCreatePanel } from './StudentCreatePanel';

/** TeacherDashboard：老師管理頁（建立學生帳號與學生清單、組別管理；003 新增「題目管理」入口）。兩個面板的變更會互相觸發重新整理。 */
export function TeacherDashboard() {
  const [studentsVersion, setStudentsVersion] = useState(0);
  const [groupsVersion, setGroupsVersion] = useState(0);
  return (
    <Layout title="老師管理頁">
      <div className="flex flex-col gap-6">
        <nav className="flex flex-wrap gap-2">
          <Link
            to="/teacher/questions"
            className="flex min-h-11 items-center justify-center rounded-md bg-accent px-4 font-medium text-ink"
          >
            題目管理
          </Link>
        </nav>
        <StudentCreatePanel
          refreshKey={groupsVersion}
          onChanged={() => setStudentsVersion((v) => v + 1)}
        />
        <GroupManagePanel
          refreshKey={studentsVersion}
          onChanged={() => setGroupsVersion((v) => v + 1)}
        />
        {import.meta.env.DEV && (
          <Link
            to="/dev"
            className="flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-white self-start"
          >
            模擬老師搶答操作（開發工具）
          </Link>
        )}
      </div>
    </Layout>
  );
}
