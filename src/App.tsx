import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './components/shared/AuthContext'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import { Layout } from './components/shared/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Collection from './pages/Collection'
import Dashboard from './pages/Dashboard'
import Decks from './pages/Decks'
import Wishlist from './pages/Wishlist'
import Mosaic from './pages/Mosaic'
import Upload from './pages/Upload'
import Builder from './pages/Builder' // DECK BUILDER — remove this line to disable feature

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes inside layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/collection" element={<Collection />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/decks" element={<Decks />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/mosaic" element={<Mosaic />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/builder" element={<Builder />} /> {/* DECK BUILDER — remove to disable */}
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
