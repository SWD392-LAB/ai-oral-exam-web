import { createBrowserRouter, Navigate } from 'react-router-dom'
import ThemeLayout from '../layouts/ThemeLayout.jsx'
import RequireRole, { GuestOnly } from './RequireRole.jsx'
import { paths } from './paths.js'
import SignInPage from '../../features/auth/SignInPage.jsx'
import RegisterPage from '../../features/auth/RegisterPage.jsx'
import ForgotPasswordPage from '../../features/auth/ForgotPasswordPage.jsx'
import EmailLinkPage from '../../features/auth/EmailLinkPage.jsx'
import GoogleWelcomePage from '../../features/auth/GoogleWelcomePage.jsx'
import AccountSettingsPage from '../../features/account/AccountSettingsPage.jsx'
import AdminUsersPage from '../../features/admin/AdminUsersPage.jsx'
import AdminCoursesPage from '../../features/admin/AdminCoursesPage.jsx'
import AdminAIPage from '../../features/admin/AdminAIPage.jsx'
import AdminAuditPage from '../../features/admin/AdminAuditPage.jsx'
import StudentHomePage from '../../features/interview/StudentHomePage.jsx'
import ExamLobbyPage from '../../features/interview/ExamLobbyPage.jsx'
import InterviewRoomPage from '../../features/interview/InterviewRoomPage.jsx'
import AttemptDonePage from '../../features/interview/AttemptDonePage.jsx'
import LecturerSessionsPage from '../../features/exam-config/LecturerSessionsPage.jsx'
import SessionSetupPage from '../../features/exam-config/SessionSetupPage.jsx'
import NewSessionPage from '../../features/exam-config/NewSessionPage.jsx'
import SessionStudentsPage from '../../features/exam-config/SessionStudentsPage.jsx'
import ReviewAttemptPage from '../../features/score-review/ReviewAttemptPage.jsx'
import StudentReportPage from '../../features/reporting/StudentReportPage.jsx'
import SessionResultsPage from '../../features/reporting/SessionResultsPage.jsx'
import ClassStatsPage from '../../features/reporting/ClassStatsPage.jsx'

const student = ['Student']
const lecturer = ['Lecturer']
const admin = ['Administrator']

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to={paths.signIn} replace /> },

  // signed out and students: Night
  {
    element: <ThemeLayout theme="night" />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: paths.signIn, element: <SignInPage /> },
          { path: paths.register, element: <RegisterPage /> },
          { path: paths.forgotPassword, element: <ForgotPasswordPage /> },
        ],
      },
      // email links open whether or not someone is signed in on this browser
      { path: '/email-link/:token', element: <EmailLinkPage /> },
      {
        element: <RequireRole roles={student} />,
        children: [
          { path: paths.studentHome, element: <StudentHomePage /> },
          { path: paths.welcome, element: <GoogleWelcomePage /> },
          { path: '/student/sessions/:sessionId/lobby', element: <ExamLobbyPage /> },
          { path: '/student/attempts/:attemptId', element: <InterviewRoomPage /> },
          { path: '/student/attempts/:attemptId/done', element: <AttemptDonePage /> },
          { path: '/student/attempts/:attemptId/report', element: <StudentReportPage /> },
        ],
      },
    ],
  },

  // lecturers: Moonlight
  {
    element: <ThemeLayout theme="moonlight" />,
    children: [
      {
        element: <RequireRole roles={lecturer} />,
        children: [
          { path: paths.sessions, element: <LecturerSessionsPage /> },
          { path: paths.results, element: <LecturerSessionsPage mode="results" /> },
          { path: paths.newSession, element: <NewSessionPage /> },
          { path: '/lecturer/sessions/:sessionId/setup', element: <SessionSetupPage /> },
          { path: '/lecturer/sessions/:sessionId/students', element: <SessionStudentsPage /> },
          { path: '/lecturer/sessions/:sessionId/results', element: <SessionResultsPage /> },
          { path: '/lecturer/attempts/:attemptId/review', element: <ReviewAttemptPage /> },
          { path: paths.statistics, element: <ClassStatsPage /> },
        ],
      },
    ],
  },

  // administrators: Moonlight
  {
    element: <ThemeLayout theme="moonlight" />,
    children: [
      {
        element: <RequireRole roles={admin} />,
        children: [
          { path: paths.adminUsers, element: <AdminUsersPage /> },
          { path: paths.adminCourses, element: <AdminCoursesPage /> },
          { path: paths.adminAi, element: <AdminAIPage /> },
          { path: paths.adminAudit, element: <AdminAuditPage /> },
        ],
      },
    ],
  },

  // every role: the theme follows the signed-in role
  {
    element: <ThemeLayout theme="role" />,
    children: [
      {
        element: <RequireRole />,
        children: [
          { path: paths.account, element: <AccountSettingsPage /> },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to={paths.signIn} replace /> },
])
