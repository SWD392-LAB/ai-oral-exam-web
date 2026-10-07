import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext.jsx'
import { router } from './routes/router.jsx'

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
