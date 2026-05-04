import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  LayoutDashboard, Users, FileText, Printer,
  Gauge, Upload, Receipt, UserCog, ClipboardList,
  LogOut, Menu, X, ChevronDown, Sun, Moon, Ticket, BarChart2, Package, Layers,
} from 'lucide-react'
import i18n from '../i18n'
import { useAuth } from '../context/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { getRoleLabel } from '../utils/roleLabels'
import { useDarkMode } from '../hooks/useTheme'

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function NavItem({ to, icon: Icon, label, end = false, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400'
            : 'text-gray-600 hover:bg-brand-50 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-400'
        }`
      }
    >
      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

function NavSep() {
  return <hr className="my-2 border-gray-100 dark:border-gray-800" />
}

function SidebarContent({ onClose }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const canManageContracts = usePermission('can_manage_contracts')
  const canSubmitReadings  = usePermission('can_submit_readings')
  const canManageBilling   = usePermission('can_manage_billing')
  const canManageUsers     = usePermission('can_manage_users')
  const isEngineer         = user?.role?.name === 'engineer'
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const roleLabel = getRoleLabel(user?.role?.name, lang)

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-100 dark:border-gray-800">
        <span className="text-base font-bold text-brand-700 dark:text-brand-400">{t('app.name')}</span>
        {onClose && (
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4 space-y-0.5">
        <NavItem to="/" end icon={LayoutDashboard} label={t('nav.dashboard')} onClick={onClose} />

        {canManageContracts && (
          <>
            <NavSep />
            <NavItem to="/customers"       icon={Users}    label={t('nav.customers')}       onClick={onClose} />
            <NavItem to="/contracts"       icon={FileText} label={t('nav.contracts')}       onClick={onClose} />
            <NavItem to="/printers"        icon={Printer}  label={t('nav.printers')}        onClick={onClose} />
            <NavItem to="/contract-groups" icon={Layers}   label={t('nav.contractGroups')}  onClick={onClose} />
          </>
        )}

        {(canSubmitReadings || canManageBilling) && (
          <>
            <NavSep />
            {isEngineer && (
              <NavItem to="/tickets" icon={Ticket} label={t('nav.tickets')} onClick={onClose} />
            )}
            <NavItem to="/meter-readings" icon={Gauge} label={t('nav.meterReadings')} onClick={onClose} />
            {canManageBilling && (
              <NavItem to="/xsm-import" icon={Upload} label={t('nav.xsmImport')} onClick={onClose} />
            )}
          </>
        )}

        {canManageBilling && (
          <>
            <NavSep />
            <NavItem to="/billing-cycles" icon={Receipt}       label={t('nav.billingCycles')} onClick={onClose} />
            <NavItem to="/consumables"    icon={Package}       label={t('nav.consumables')}   onClick={onClose} />
            <NavItem to="/import-logs"    icon={ClipboardList} label={t('nav.importLogs')}    onClick={onClose} />
          </>
        )}

        {canManageUsers && (
          <>
            <NavSep />
            <NavItem to="/users"        icon={UserCog}   label={t('nav.users')}       onClick={onClose} />
            <NavItem to="/performance"  icon={BarChart2} label={t('nav.performance')} onClick={onClose} />
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
            {getInitials(user?.fullName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{user?.fullName}</p>
            <p className="truncate text-xs text-gray-400 dark:text-gray-500">{roleLabel}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {t('app.logout')}
        </button>
      </div>
    </div>
  )
}

function UserAvatarMenu() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const roleLabel = getRoleLabel(user?.role?.name, lang)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors focus:outline-none">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
            {getInitials(user?.fullName)}
          </div>
          <span className="hidden sm:block max-w-[120px] truncate">{user?.fullName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[180px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-900"
        >
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.fullName}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{roleLabel}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-gray-100 dark:bg-gray-800" />
          <DropdownMenu.Item
            onSelect={logout}
            className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400 focus:outline-none transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t('app.logout')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { isDark, toggle } = useDarkMode()

  useEffect(() => {
    function applyDir(lng) {
      document.documentElement.dir  = lng === 'ar' ? 'rtl' : 'ltr'
      document.documentElement.lang = lng
    }
    applyDir(i18n.language)
    i18n.on('languageChanged', applyDir)
    return () => i18n.off('languageChanged', applyDir)
  }, [])

  function closeDrawer() { setDrawerOpen(false) }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col flex-shrink-0 border-e border-gray-200 dark:border-gray-800">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-200 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={closeDrawer} />
        <div
          className={`absolute start-0 top-0 h-full w-64 shadow-xl transition-transform duration-200 ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={i18n.language === 'ar' ? { transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)' } : undefined}
        >
          <SidebarContent onClose={closeDrawer} />
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 px-4 gap-3">
          <button
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden transition-colors"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-400 transition-colors"
          >
            {i18n.language === 'ar' ? 'EN' : 'عربي'}
          </button>

          {/* User menu */}
          <UserAvatarMenu />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-hide p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
