import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Install } from '@/screens/Install'
import { Medicine } from '@/screens/Medicine'
import { MedicineForm } from '@/screens/MedicineForm'
import { Medicines } from '@/screens/Medicines'
import { ReminderLanding } from '@/screens/Reminder'
import { Settings, SettingsSection } from '@/screens/Settings'
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
          <Route path="settings" element={<Settings />} />
          {/* Arriving here inside the app means the tap already landed where it
              was meant to, so there is nothing to sign-post. */}
          <Route path="reminder" element={<Navigate to="/" replace />} />
          {/* A path this app has never had, or one it used to have. History was
              its own tab until the medicines list grew the record; a home screen
              icon or a bookmark still pointing at it lands on Today rather than
              on a blank frame with the tab bar under it. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        {/* Off the shell: each one is a single job you finish and back out of,
            and the tab bar under it would be an invitation to leave halfway. */}
        <Route path="medicines/new" element={<MedicineForm />} />
        <Route path="medicines/:groupId" element={<Medicine />} />
        <Route path="medicines/:groupId/edit" element={<MedicineForm />} />
        <Route path="settings/:section" element={<SettingsSection />} />
      </Routes>
    </BrowserRouter>
  )
}
