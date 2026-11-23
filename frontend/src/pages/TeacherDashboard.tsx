import { useState } from 'react';
import { Layout } from '../components/Layout';
import { GroupManagePanel } from './GroupManagePanel';
import { StudentCreatePanel } from './StudentCreatePanel';

/** TeacherDashboard：老師管理頁（建立學生帳號與學生清單、組別管理）。兩個面板的變更會互相觸發重新整理。 */
export function TeacherDashboard() {
  const [studentsVersion, setStudentsVersion] = useState(0);
  const [groupsVersion, setGroupsVersion] = useState(0);
  return (
    <Layout title="老師管理頁">
      <div className="flex flex-col gap-6">
        <StudentCreatePanel
          refreshKey={groupsVersion}
          onChanged={() => setStudentsVersion((v) => v + 1)}
        />
        <GroupManagePanel
          refreshKey={studentsVersion}
          onChanged={() => setGroupsVersion((v) => v + 1)}
        />
      </div>
    </Layout>
  );
}
