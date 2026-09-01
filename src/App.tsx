import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { History } from '@/screens/History'
import { MedicineForm } from '@/screens/MedicineForm'
import { MedicineHistory } from '@/screens/MedicineHistory'
import { Medicines } from '@/screens/Medicines'
import { Today } from '@/screens/Today'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Today />} />
          <Route path="medicines" element={<Medicines />} />
          <Route path="history" element={<History />} />
        </Route>
        <Route path="medicines/new" element={<MedicineForm />} />
        <Route path="medicines/:groupId/edit" element={<MedicineForm />} />
        <Route path="history/:groupId" element={<MedicineHistory />} />
      </Routes>
    </BrowserRouter>
  )
}
