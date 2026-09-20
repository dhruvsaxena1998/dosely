import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { History } from '@/screens/History'
import { Install } from '@/screens/Install'
import { MedicineForm } from '@/screens/MedicineForm'
import { MedicineHistory } from '@/screens/MedicineHistory'
import { Medicines } from '@/screens/Medicines'
import { ReminderLanding } from '@/screens/Reminder'
import { Settings } from '@/screens/Settings'
import { Today } from '@/screens/Today'
import { gateEnforced, useInstallState } from '@/lib/install'
import { REMINDER_PATH } from '@/lib/reminders'

export default function App() {
  const { installed } = useInstallState()

  // Where a reminder's tap lands in a browser, and checked before the door
  // rather than behind it. Someone tapping a reminder has already installed the
  // app — being told to install it would be the app arguing with a notification
  // it sent itself.
  if (!installed && window.location.pathname === REMINDER_PATH) return <ReminderLanding />

  // Not a route: there is nowhere else to be until it is installed, and a route
  // would let a link past the door.
  if (!installed && gateEnforced()) return <Install />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Today />} />
          <Route path="medicines" element={<Medicines />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
          {/* Arriving here inside the app means the tap already landed where it
              was meant to, so there is nothing to sign-post. */}
          <Route path="reminder" element={<Navigate to="/" replace />} />
        </Route>
        <Route path="medicines/new" element={<MedicineForm />} />
        <Route path="medicines/:groupId/edit" element={<MedicineForm />} />
        <Route path="history/:groupId" element={<MedicineHistory />} />
      </Routes>
    </BrowserRouter>
  )
}
