/**
 * Purpose: Route table of the Figma-clone UI. `/login` and `/signup` stand alone; every other
 * route sits inside AppShell, which redirects to /login without an API session
 * (ui/SessionProvider.tsx) and shows "Not available" for a path the user's role may
 * not open (ui/access.ts). Screens wired to @mou/api fetch their own data; the rest
 * still render the prototype's hardcoded data from src/data.
 */

import { Route, Routes } from "react-router-dom";

import { AddCompanyScreen } from "./screens/AddCompanyScreen.tsx";
import { AdminApprovalsScreen } from "./screens/AdminApprovalsScreen.tsx";
import { AgreementHistoryScreen } from "./screens/AgreementHistoryScreen.tsx";
import { DashboardScreen } from "./screens/DashboardScreen.tsx";
import { EditAgreementScreen } from "./screens/EditAgreementScreen.tsx";
import { ExistingCompaniesScreen } from "./screens/ExistingCompaniesScreen.tsx";
import { ExpiryAlertsScreen } from "./screens/ExpiryAlertsScreen.tsx";
import { ExportScreen } from "./screens/ExportScreen.tsx";
import { LoginScreen } from "./screens/LoginScreen.tsx";
import { SignUpScreen } from "./screens/SignUpScreen.tsx";
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
        <Route path="/signup" element={<SignUpScreen />} />
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
          <Route path="/admin/approvals" element={<AdminApprovalsScreen />} />
          <Route path="*" element={<DashboardScreen />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
