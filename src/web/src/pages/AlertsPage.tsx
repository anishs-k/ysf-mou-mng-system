/**
 * Purpose: SPEC-08's alert list - every unacknowledged current-MOU expiry
 * alert, newest first, with threshold/zone/scheme/acknowledged filters and an
 * Acknowledge action (ADMIN/DATA_ENTRY only, enforced again on the server).
 * Each row links to the Existing Company view via its zoneId/companyId query
 * parameters (SPEC-07's deep-link support).
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { AlertFilters, AlertRow, EnumOption, ZoneOption } from "../api/client.ts";
import { acknowledgeAlert, fetchAlerts, fetchEnums, fetchZones } from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";

const AUTHORING_ROLES: readonly string[] = ["ADMIN", "DATA_ENTRY"];

export function AlertsPage() {
  const { user } = useAuth();
  const canAcknowledge = user !== null && AUTHORING_ROLES.includes(user.role);

  const [alerts, setAlerts] = useState<readonly AlertRow[]>([]);
  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [schemes, setSchemes] = useState<readonly EnumOption[]>([]);
  const [days, setDays] = useState<AlertFilters["days"]>("all");
  const [zoneId, setZoneId] = useState("");
  const [scheme, setScheme] = useState("");
  const [acknowledged, setAcknowledged] = useState<AlertFilters["acknowledged"]>("false");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchZones().then(setZones).catch(() => undefined);
    fetchEnums()
      .then((enums) => setSchemes(enums.schemes))
      .catch(() => undefined);
  }, []);

  const currentFilters = { days, zoneId: zoneId || undefined, scheme: scheme || undefined, acknowledged };

  // Re-fetches on every filter change and after an acknowledge action, in a
  // plain .then()/.catch() chain rather than an intermediate named async
  // function, so the effect below never calls a function react-hooks flags
  // as "setting state" from an effect body.
  async function load() {
    try {
      setAlerts(await fetchAlerts(currentFilters));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchAlerts(currentFilters)
      .then((rows) => {
        if (!cancelled) setAlerts(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load alerts");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, zoneId, scheme, acknowledged]);

  async function handleAcknowledge(alertId: string) {
    try {
      await acknowledgeAlert(alertId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to acknowledge");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">MOU Expiry Alerts</h1>

      {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          aria-label="Threshold"
          value={days}
          onChange={(event) => setDays(event.target.value as AlertFilters["days"])}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All thresholds</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
        </select>
        <select
          aria-label="Zone"
          value={zoneId}
          onChange={(event) => setZoneId(event.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Scheme"
          value={scheme}
          onChange={(event) => setScheme(event.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All schemes</option>
          {schemes.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Acknowledged"
          value={acknowledged}
          onChange={(event) => setAcknowledged(event.target.value as AlertFilters["acknowledged"])}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="false">Unacknowledged</option>
          <option value="true">Acknowledged</option>
          <option value="all">All</option>
        </select>
      </div>

      {alerts.length === 0 ? (
        <p className="text-sm text-gray-600">No alerts match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-2">Company</th>
                <th className="p-2">Code</th>
                <th className="p-2">Zone</th>
                <th className="p-2">Plant</th>
                <th className="p-2">Scheme</th>
                <th className="p-2">Start</th>
                <th className="p-2">End</th>
                <th className="p-2">Days Remaining</th>
                <th className="p-2">Threshold</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.alertId} className="border-t border-gray-100">
                  <td className="p-2">{alert.companyName}</td>
                  <td className="p-2">{alert.generatedCode}</td>
                  <td className="p-2">{alert.zoneName}</td>
                  <td className="p-2">{alert.plantName}</td>
                  <td className="p-2">{alert.scheme}</td>
                  <td className="p-2">{alert.mouStartDate}</td>
                  <td className="p-2">{alert.endDate}</td>
                  <td className="p-2">{alert.daysRemaining}</td>
                  <td className="p-2">{alert.thresholdDays}</td>
                  <td className="p-2">{alert.status}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <Link
                        to={`/companies?zoneId=${alert.zoneId}&companyId=${alert.companyId}`}
                        className="text-blue-600 hover:underline"
                      >
                        Open
                      </Link>
                      {canAcknowledge && alert.acknowledgedAt === null && (
                        <button
                          type="button"
                          onClick={() => void handleAcknowledge(alert.alertId)}
                          className="text-gray-600 hover:underline"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
