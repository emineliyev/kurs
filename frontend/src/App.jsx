import { Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import ProtectedRoute from '@/components/common/ProtectedRoute'
import TeacherLayout from '@/layouts/TeacherLayout'
import StudentLayout from '@/layouts/StudentLayout'
import AuthLayout from '@/layouts/AuthLayout'

// Landing page
import LandingPage from '@/pages/LandingPage'

// Print pages (no layout)
import ExamPrintPage from '@/pages/print/ExamPrintPage'

// Auth pages
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'

// Error pages
import NotFoundPage from '@/pages/NotFoundPage'
import ErrorPage from '@/pages/ErrorPage'

// Teacher pages
import TeacherDashboard from '@/pages/teacher/DashboardPage'
import TestsPage from '@/pages/teacher/TestsPage'
import TestCreatePage from '@/pages/teacher/TestCreatePage'
import TestDetailPage from '@/pages/teacher/TestDetailPage'
import TestPrintPage from '@/pages/teacher/TestPrintPage'
import ClassesPage from '@/pages/teacher/ClassesPage'
import ClassDetailPage from '@/pages/teacher/ClassDetailPage'
import StudentsPage from '@/pages/teacher/StudentsPage'
import ExamsPage from '@/pages/teacher/ExamsPage'
import ExamCreatePage from '@/pages/teacher/ExamCreatePage'
import ExamEditPage from '@/pages/teacher/ExamEditPage'
import ExamResultsPage from '@/pages/teacher/ExamResultsPage'
import GradingPage from '@/pages/teacher/GradingPage'
import AnalyticsPage from '@/pages/teacher/AnalyticsPage'
import QuestionBankPage from '@/pages/teacher/QuestionBankPage'
import SubscriptionPage from '@/pages/teacher/SubscriptionPage'
import FeedbackPage from '@/pages/teacher/FeedbackPage'
import PaymentPage from '@/pages/teacher/PaymentPage'
import TeacherProfilePage from '@/pages/teacher/ProfilePage'

// Student pages
import StudentHome from '@/pages/student/HomePage'
import StudentExams from '@/pages/student/ExamsPage'
import TakeExamPage from '@/pages/student/TakeExamPage'
import ExamResultPage from '@/pages/student/ExamResultPage'
import StudentProfile from '@/pages/student/ProfilePage'

export default function App() {
  useAuthStore()

  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Standalone pages (no layout) */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/403" element={<ErrorPage code={403} />} />
      <Route path="/500" element={<ErrorPage code={500} />} />

      {/* Printable test — full page, no app layout */}
      <Route
        path="/teacher/tests/:id/print"
        element={<ProtectedRoute role="teacher"><TestPrintPage /></ProtectedRoute>}
      />

      {/* Teacher routes */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute role="teacher">
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="tests" element={<TestsPage />} />
        <Route path="tests/create" element={<TestCreatePage />} />
        <Route path="tests/:id/edit" element={<TestCreatePage />} />
        <Route path="tests/:id" element={<TestDetailPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="classes/:id" element={<ClassDetailPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="exams" element={<ExamsPage />} />
        <Route path="exams/create" element={<ExamCreatePage />} />
        <Route path="exams/:id/edit" element={<ExamEditPage />} />
        <Route path="exams/:id/results" element={<ExamResultsPage />} />
        <Route path="exams/:id/grade" element={<GradingPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="question-bank" element={<QuestionBankPage />} />
        <Route path="subscription" element={<SubscriptionPage />} />
        <Route path="payment" element={<PaymentPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="profile" element={<TeacherProfilePage />} />
      </Route>

      {/* Student routes */}
      <Route
        path="/student"
        element={
          <ProtectedRoute role="student">
            <StudentLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentHome />} />
        <Route path="exams" element={<StudentExams />} />
        <Route path="exams/:id/take" element={<TakeExamPage />} />
        <Route path="exams/:id/result" element={<ExamResultPage />} />
        <Route path="profile" element={<StudentProfile />} />
      </Route>

      {/* Print pages (standalone, no layout) */}
      <Route path="/print/exams/:id" element={<ExamPrintPage />} />

      {/* Landing page */}
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
