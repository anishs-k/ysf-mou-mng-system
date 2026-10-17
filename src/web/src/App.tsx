/**
 * Purpose: Route table of the static UI clone of the Figma prototype. Nothing here
 * talks to the API: sign-in is checked in the browser (ui/session.tsx) and every
 * screen renders hardcoded data from src/data. `/login` stands alone; every other
 * route sits inside AppShell, which redirects to /login without a session.
 */

import { Route, Routes } from "react-router-dom";

import { AddCompanyScreen } from "./screens/AddCompanyScreen.tsx";
import { AgreementHistoryScreen } from "./screens/AgreementHistoryScreen.tsx";
import { DashboardScreen } from "./screens/DashboardScreen.tsx";
import { EditAgreementScreen } from "./screens/EditAgreementScreen.tsx";
import { ExistingCompaniesScreen } from "./screens/ExistingCompaniesScreen.tsx";
import { ExpiryAlertsScreen } from "./screens/ExpiryAlertsScreen.tsx";
import { ExportScreen } from "./screens/ExportScreen.tsx";
import { LoginScreen } from "./screens/LoginScreen.tsx";
import { UploadMouScreen } from "./screens/UploadMouScreen.tsx";
import { UserManualScreen } from "./screens/UserManualScreen.tsx";
import { ZoneDashboardScreen } from "./screens/ZoneDashboardScreen.tsx";
import { AppShell } from "./ui/layout/AppShell.tsx";
import { SessionProvider } from "./ui/SessionProvider.tsx";

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/companies/new" element={<AddCompanyScreen />} />
          <Route path="/companies" element={<ExistingCompaniesScreen />} />
          <Route path="/agreements/edit" element={<EditAgreementScreen />} />
          <Route path="/upload-mou" element={<UploadMouScreen />} />
          <Route path="/alerts" element={<ExpiryAlertsScreen />} />
          <Route path="/agreements/history" element={<AgreementHistoryScreen />} />
          <Route path="/zones/overview" element={<ZoneDashboardScreen />} />
          <Route path="/export" element={<ExportScreen />} />
          <Route path="/user-manual" element={<UserManualScreen />} />
          <Route path="*" element={<DashboardScreen />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
