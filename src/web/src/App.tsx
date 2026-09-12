/**
 * Purpose: The application shell and route table for SPEC-02. Every route except
 * /login sits behind RequireAuth, so section 2.1's "every screen except login
 * requires an authenticated session" is enforced in one place rather than per
 * screen. Every Dashboard Home entry point (`dashboard/entry-points.ts`) now has
 * a real route here - SPEC-13 was the last spec to land, so `ComingSoonPage` is
 * kept only as the catch-all for an unrecognised path.
 */

import { Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext.tsx";
import { RequireAuth } from "./auth/RequireAuth.tsx";
import { AddCompanyPage } from "./pages/AddCompanyPage.tsx";
import { AgreementHistoryPage } from "./pages/AgreementHistoryPage.tsx";
import { AlertsPage } from "./pages/AlertsPage.tsx";
import { ComingSoonPage } from "./pages/ComingSoonPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { EditAgreementPage } from "./pages/EditAgreementPage.tsx";
import { ExistingCompanyPage } from "./pages/ExistingCompanyPage.tsx";
import { ExportExcelPage } from "./pages/ExportExcelPage.tsx";
import { ExportPdfPage } from "./pages/ExportPdfPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { UploadMouPage } from "./pages/UploadMouPage.tsx";
import { ZoneWiseDashboardPage } from "./pages/ZoneWiseDashboardPage.tsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/companies/new"
          element={
            <RequireAuth>
              <AddCompanyPage />
            </RequireAuth>
          }
        />
        <Route
          path="/companies"
          element={
            <RequireAuth>
              <ExistingCompanyPage />
            </RequireAuth>
          }
        />
        <Route
          path="/alerts"
          element={
            <RequireAuth>
              <AlertsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/upload-mou"
          element={
            <RequireAuth>
              <UploadMouPage />
            </RequireAuth>
          }
        />
        <Route
          path="/agreements/edit"
          element={
            <RequireAuth>
              <EditAgreementPage />
            </RequireAuth>
          }
        />
        <Route
          path="/agreements/history"
          element={
            <RequireAuth>
              <AgreementHistoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/zones/overview"
          element={
            <RequireAuth>
              <ZoneWiseDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/search"
          element={
            <RequireAuth>
              <SearchPage />
            </RequireAuth>
          }
        />
        <Route
          path="/export/excel"
          element={
            <RequireAuth>
              <ExportExcelPage />
            </RequireAuth>
          }
        />
        <Route
          path="/export/pdf"
          element={
            <RequireAuth>
              <ExportPdfPage />
            </RequireAuth>
          }
        />
        {/* Every SPEC-07-13 destination now has a real page; ComingSoonPage
            remains only as the catch-all below for an unrecognised path. */}
        <Route
          path="*"
          element={
            <RequireAuth>
              <ComingSoonPage />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
