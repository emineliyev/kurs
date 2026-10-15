import { Suspense } from 'react'
import { lazyPage } from '@/utils/lazyPage'
import { Routes, Route } from 'react-router-dom'
import PageSpinner from '@/components/common/PageSpinner'
import { useAuthStore } from '@/store/authStore'
import ProtectedRoute from '@/components/common/ProtectedRoute'
import TeacherLayout from '@/layouts/TeacherLayout'
import StudentLayout from '@/layouts/StudentLayout'
import AuthLayout from '@/layouts/AuthLayout'

// Landing page
import LandingPage from '@/pages/LandingPage'

// Pages load on demand: the teacher's editor (PDF, drawing, KaTeX…) isn't downloaded by a student
// Print pages (no layout)
const ExamPrintPage = lazyPage(() => import('@/pages/print/ExamPrintPage'))

// Auth pages
const LoginPage = lazyPage(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazyPage(() => import('@/pages/auth/RegisterPage'))
const VerifyEmailPage = lazyPage(() => import('@/pages/auth/VerifyEmailPage'))
const ForgotPasswordPage = lazyPage(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazyPage(() => import('@/pages/auth/ResetPasswordPage'))

// Public legal pages (texts edited in the admin)
const LegalPage = lazyPage(() => import('@/pages/LegalPage'))

// Error pages
const NotFoundPage = lazyPage(() => import('@/pages/NotFoundPage'))
const ErrorPage = lazyPage(() => import('@/pages/ErrorPage'))

// Teacher pages
const TeacherDashboard = lazyPage(() => import('@/pages/teacher/DashboardPage'))
const TestsPage = lazyPage(() => import('@/pages/teacher/TestsPage'))
const TestCreatePage = lazyPage(() => import('@/pages/teacher/TestCreatePage'))
const TestDetailPage = lazyPage(() => import('@/pages/teacher/TestDetailPage'))
const TestPrintPage = lazyPage(() => import('@/pages/teacher/TestPrintPage'))
const ReportCardsPage = lazyPage(() => import('@/pages/teacher/ReportCardsPage'))
const ClassesPage = lazyPage(() => import('@/pages/teacher/ClassesPage'))
const ClassDetailPage = lazyPage(() => import('@/pages/teacher/ClassDetailPage'))
const StudentsPage = lazyPage(() => import('@/pages/teacher/StudentsPage'))
const ExamsPage = lazyPage(() => import('@/pages/teacher/ExamsPage'))
const ExamCreatePage = lazyPage(() => import('@/pages/teacher/ExamCreatePage'))
const ExamEditPage = lazyPage(() => import('@/pages/teacher/ExamEditPage'))
const ExamResultsPage = lazyPage(() => import('@/pages/teacher/ExamResultsPage'))
const PaperResultsPage = lazyPage(() => import('@/pages/teacher/PaperResultsPage'))
const GradingPage = lazyPage(() => import('@/pages/teacher/GradingPage'))
const AnalyticsPage = lazyPage(() => import('@/pages/teacher/AnalyticsPage'))
const QuestionBankPage = lazyPage(() => import('@/pages/teacher/QuestionBankPage'))
const SubscriptionPage = lazyPage(() => import('@/pages/teacher/SubscriptionPage'))
const FeedbackPage = lazyPage(() => import('@/pages/teacher/FeedbackPage'))
const PaymentPage = lazyPage(() => import('@/pages/teacher/PaymentPage'))
const TeacherProfilePage = lazyPage(() => import('@/pages/teacher/ProfilePage'))

// Student pages
const StudentHome = lazyPage(() => import('@/pages/student/HomePage'))
const StudentExams = lazyPage(() => import('@/pages/student/ExamsPage'))
const TakeExamPage = lazyPage(() => import('@/pages/student/TakeExamPage'))
const ExamResultPage = lazyPage(() => import('@/pages/student/ExamResultPage'))
const StudentProfile = lazyPage(() => import('@/pages/student/ProfilePage'))

export default function App() {
  useAuthStore()

  return (
    <Suspense fallback={<div className="py-16"><PageSpinner /></div>}>
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
      <Route
        path="/teacher/exams/:id/report-cards"
        element={<ProtectedRoute role="teacher"><ReportCardsPage /></ProtectedRoute>}
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
        <Route path="exams/:id/paper" element={<PaperResultsPage />} />
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
      <Route path="/legal/:slug" element={<LegalPage />} />
      <Route path="/privacy" element={<LegalPage slug="privacy" />} />
      <Route path="/terms" element={<LegalPage slug="terms" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  )
}
