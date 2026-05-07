import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../layouts/AppLayout'
import ScrollToTop from '../components/ScrollToTop'
import Login from '../pages/Login'
import DashboardPage from '../pages/dashboard/DashboardPage'
import CustomersPage from '../pages/customers/CustomersPage'
import CustomerDetail from '../pages/customers/CustomerDetail'
import ContractsPage from '../pages/contracts/ContractsPage'
import ContractDetail from '../pages/contracts/ContractDetail'
import PrintersPage from '../pages/printers/PrintersPage'
import PrinterDetail from '../pages/printers/PrinterDetail'
import AssignmentsPage from '../pages/assignments/AssignmentsPage'
import MeterReadingsPage from '../pages/meter-readings/MeterReadingsPage'
import SubmitReadingPage from '../pages/meter-readings/SubmitReadingPage'
import XsmImportPage from '../pages/xsm-import/XsmImportPage'
import BillingCyclesPage from '../pages/billing-cycles/BillingCyclesPage'
import BillingCycleDetail from '../pages/billing-cycles/BillingCycleDetail'
import CycleGroupDetail from '../pages/billing-cycles/CycleGroupDetail'
import UsersPage from '../pages/users/UsersPage'
import ImportLogsPage from '../pages/import-logs/ImportLogsPage'
import TicketsPage from '../pages/tickets/TicketsPage'
import PerformancePage from '../pages/performance/PerformancePage'
import EngineerPerformancePage from '../pages/performance/EngineerPerformancePage'
import NotFound from '../pages/NotFound'
import ConsumablesPage from '../pages/consumables/ConsumablesPage'
import ContractGroupsPage from '../pages/contract-groups/ContractGroupsPage'
import ContractGroupDetail from '../pages/contract-groups/ContractGroupDetail'
import MapPage from '../pages/map/MapPage'
import SettingsPage from '../pages/settings/SettingsPage'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading…</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (isAuthenticated) return <Navigate to="/" replace />
  return children
}

export default function RouterConfig() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="contracts/:id" element={<ContractDetail />} />
          <Route path="printers" element={<PrintersPage />} />
          <Route path="printers/:id" element={<PrinterDetail />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="meter-readings" element={<MeterReadingsPage />} />
          <Route path="meter-readings/submit" element={<SubmitReadingPage />} />
          <Route path="xsm-import" element={<XsmImportPage />} />
          <Route path="billing-cycles" element={<BillingCyclesPage />} />
          <Route path="billing-cycles/:id" element={<BillingCycleDetail />} />
          <Route path="cycle-groups/:id" element={<CycleGroupDetail />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="import-logs" element={<ImportLogsPage />} />
          <Route path="consumables" element={<ConsumablesPage />} />
          <Route path="contract-groups" element={<ContractGroupsPage />} />
          <Route path="contract-groups/:id" element={<ContractGroupDetail />} />
          <Route path="map" element={<MapPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="performance" element={<PerformancePage />} />
          <Route path="performance/:id" element={<EngineerPerformancePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
