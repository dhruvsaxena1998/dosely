import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { History } from '@/screens/History'
import { Install } from '@/screens/Install'
import { MedicineForm } from '@/screens/MedicineForm'
import { MedicineHistory } from '@/screens/MedicineHistory'
import { Medicines } from '@/screens/Medicines'
import { Settings } from '@/screens/Settings'
import { Today } from '@/screens/Today'
import { gateEnforced, useInstallState } from '@/lib/install'

export default function App() {
  const { installed } = useInstallState()

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
        </Route>
        <Route path="medicines/new" element={<MedicineForm />} />
        <Route path="medicines/:groupId/edit" element={<MedicineForm />} />
        <Route path="history/:groupId" element={<MedicineHistory />} />
      </Routes>
    </BrowserRouter>
  )
}
