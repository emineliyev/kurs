import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  const isTeacher = user.role === 'teacher' || user.role === 'admin'
  const isStudent = user.role === 'student'

  if (role === 'teacher' && !isTeacher) {
    return <Navigate to={isStudent ? '/student' : '/login'} replace />
  }
  if (role === 'student' && !isStudent) {
    return <Navigate to={isTeacher ? '/teacher' : '/login'} replace />
  }

  return children
}
