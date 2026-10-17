import { Outlet } from 'react-router-dom'
import StudentTopBar from '@/components/student/TopBar'
import StudentSidebar from '@/components/student/Sidebar'
import BottomNavigation from '@/components/student/BottomNavigation'
import { OfflineBanner } from '@/components/common/InstallApp'

export default function StudentLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <StudentSidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 md:pl-60">
        <div className="sticky top-0 z-30"><OfflineBanner /></div>
        {/* Mobile top bar only */}
        <StudentTopBar />

        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-10">
          <div className="max-w-3xl mx-auto w-full">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav only */}
        <BottomNavigation />
      </div>
    </div>
  )
}
