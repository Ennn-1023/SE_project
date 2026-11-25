import { useState } from 'react';
import { TeacherLayout } from '../components/TeacherLayout';
import { GroupManagePanel } from './GroupManagePanel';
import { StudentCreatePanel } from './StudentCreatePanel';

/**
 * StudentManagePage（006 由 TeacherDashboard 改名；FR-008～FR-011）：學生管理畫面，
 * 包含建立學生帳號與學生清單、組別管理。兩個面板的變更會互相觸發重新整理。
 * 搶答活動與題目管理改由側邊選單進入。
 */
export function StudentManagePage() {
  const [studentsVersion, setStudentsVersion] = useState(0);
  const [groupsVersion, setGroupsVersion] = useState(0);
  return (
    <TeacherLayout title="學生管理">
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
    </TeacherLayout>
  );
}
