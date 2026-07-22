import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthContext } from './AuthContext'
import {
  Sword,
  LayoutGrid,
  BarChart2,
  Layers,
  BookMarked,
  Image,
  LogOut,
  Upload,
  Wand2,  // DECK BUILDER — remove this import to disable feature
} from 'lucide-react'

const navItems = [
  { to: '/collection', label: 'Collection', icon: LayoutGrid },
  { to: '/dashboard',  label: 'Dashboard',  icon: BarChart2  },
  { to: '/decks',      label: 'Decks',      icon: Layers     },
  { to: '/builder',    label: 'Builder',    icon: Wand2      }, // DECK BUILDER — remove this line to disable feature
  { to: '/wishlist',   label: 'Wishlist',   icon: BookMarked },
  { to: '/mosaic',     label: 'Mosaic',     icon: Image      },
  { to: '/upload',     label: 'Upload CSV', icon: Upload     },
]

export function Navbar() {
  const { user, logout } = useAuthContext()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-1">
        {/* Logo */}
        <NavLink to="/collection" className="flex items-center gap-2 mr-4 shrink-0">
          <Sword className="w-5 h-5 text-violet-400" />
          <span className="font-bold text-white text-sm hidden sm:block">MTG Hub</span>
        </NavLink>

        {/* Nav links */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-violet-600/20 text-violet-300'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:block">{label}</span>
            </NavLink>
          ))}
        </div>

        {/* User + logout */}
        {user && (
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-xs text-gray-500 hidden lg:block truncate max-w-32">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
