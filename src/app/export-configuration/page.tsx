"use client";

import { useEffect, useState } from "react";

type ConfigResponse = {
  organization: { id: string; name: string };
  retention: {
    exportsDays: number;
    sourceDocumentsDays: number;
    generatedDocumentsDays: number | null;
    auditRetentionDays: number | null;
    legalHoldEnabled: boolean;
  };
  backup: {
    retentionDays: number;
    frequency: string;
    schedulingMode: string;
  };
};

type LegalHoldRow = {
  id: string;
  recordType: string;
  recordId: string;
  recordVersionId?: string | null;
  reason?: string | null;
  createdAt?: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  _count: { users: number };
};

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "USER" | "APPROVER" | "REVIEWER" | "VIEWER";
  userStatus?: "ACTIVE" | "LOCKED";
  failedLoginAttempts?: number;
  lockedAt?: string | null;
  mfaEnabled?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
};

type AccessReviewReportRow = {
  id: string;
  reportHash: string;
  reportFormat: string;
  createdAt: string;
  attestedAt?: string | null;
  attestedSignatureId?: string | null;
};

export default function ExportConfigurationPage() {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [legalHolds, setLegalHolds] = useState<LegalHoldRow[]>([]);
  const [auditDays, setAuditDays] = useState<string>("");
  const [docDays, setDocDays] = useState<string>("");
  const [legalHoldEnabled, setLegalHoldEnabled] = useState<boolean>(true);
  const [newHoldType, setNewHoldType] = useState("GENERATED_DOCUMENT");
  const [newHoldRecordId, setNewHoldRecordId] = useState("");
  const [newHoldVersionId, setNewHoldVersionId] = useState("");
  const [newHoldReason, setNewHoldReason] = useState("");
  const [lastPurge, setLastPurge] = useState<{ runId: string; dryRun: boolean } | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [accessReviewReports, setAccessReviewReports] = useState<AccessReviewReportRow[]>([]);
  const [attestationPassword, setAttestationPassword] = useState("");
  const [attestationRemarks, setAttestationRemarks] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgAdminEmail, setNewOrgAdminEmail] = useState("");
  const [newOrgAdminName, setNewOrgAdminName] = useState("");
  const [newOrgAdminPassword, setNewOrgAdminPassword] = useState("");
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    const load = async () => {
      try {
        const [configResponse, holdResponse] = await Promise.all([
          fetch("/api/configuration/export"),
          fetch("/api/admin/retention/legal-holds")
        ]);
        const body = (await configResponse.json()) as ConfigResponse & { error?: string };
        if (!configResponse.ok) {
          setMessage(body.error ?? "Failed to load configuration.");
          return;
        }
        const holdBody = holdResponse.ok ? ((await holdResponse.json()) as LegalHoldRow[]) : [];
        const orgResponse = await fetch("/api/admin/organizations");
        const orgBody = orgResponse.ok ? ((await orgResponse.json()) as OrganizationRow[]) : [];
        const usersResponse = await fetch("/api/users");
        const usersBody = usersResponse.ok ? ((await usersResponse.json()) as UserRow[]) : [];
        const accessReviewsResponse = await fetch("/api/admin/access-reviews/reports");
        const accessReviewsBody = accessReviewsResponse.ok ? ((await accessReviewsResponse.json()) as AccessReviewReportRow[]) : [];
        setData(body);
        setLegalHolds(holdBody);
        setOrganizations(orgBody);
        setUsers(usersBody);
        setAccessReviewReports(accessReviewsBody);
        setAuditDays(body.retention.auditRetentionDays == null ? "" : String(body.retention.auditRetentionDays));
        setDocDays(body.retention.generatedDocumentsDays == null ? "" : String(body.retention.generatedDocumentsDays));
        setLegalHoldEnabled(body.retention.legalHoldEnabled);
        setMessage("");
      } catch {
        setMessage("Failed to load configuration.");
      }
    };
    load().catch(() => undefined);
  }, []);

  const saveRetention = async () => {
    const response = await fetch("/api/admin/retention/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auditEventRetentionDays: auditDays.trim() ? Number(auditDays) : null,
        documentVersionRetentionDays: docDays.trim() ? Number(docDays) : null,
        legalHoldEnabled
      })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to update retention settings.");
      return;
    }
    setMessage("Retention settings saved.");
  };

  const createOrganization = async () => {
    const response = await fetch("/api/admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newOrgName,
        adminEmail: newOrgAdminEmail,
        adminFullName: newOrgAdminName,
        adminPassword: newOrgAdminPassword
      })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to create organization.");
      return;
    }
    setOrganizations((current) => [...current, { ...body.organization, createdAt: new Date().toISOString(), _count: { users: 1 } }]);
    setNewOrgName("");
    setNewOrgAdminEmail("");
    setNewOrgAdminName("");
    setNewOrgAdminPassword("");
    setMessage("Organization created.");
  };

  const deleteOrganization = async (organizationId: string) => {
    const response = await fetch(`/api/admin/organizations/${organizationId}`, {
      method: "DELETE"
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to delete organization.");
      return;
    }
    setOrganizations((current) =>
      current.map((org) => (org.id === organizationId ? { ...org, isActive: false } : org))
    );
    setMessage("Organization deleted.");
  };

  const updateUserRole = async (userId: string, role: UserRow["role"]) => {
    const response = await fetch(`/api/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to update user role.");
      return;
    }
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, role: body.role } : user)));
    setMessage("User role updated.");
  };

  const unlockUser = async (userId: string) => {
    const response = await fetch(`/api/users/${userId}/unlock`, {
      method: "PATCH"
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to unlock user.");
      return;
    }
    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? {
              ...user,
              userStatus: body.userStatus,
              failedLoginAttempts: body.failedLoginAttempts,
              lockedAt: null
            }
          : user
      )
    );
    setMessage("User unlocked.");
  };

  const generateAccessReviewReport = async () => {
    const response = await fetch("/api/admin/access-reviews/reports", { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to generate access review report.");
      return;
    }
    setAccessReviewReports((current) => [body, ...current]);
    setMessage("Access review report generated.");
  };

  const attestAccessReviewReport = async (reportId: string) => {
    const response = await fetch(`/api/admin/access-reviews/reports/${reportId}/attest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: attestationPassword, remarks: attestationRemarks || undefined })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to attest access review report.");
      return;
    }
    setAccessReviewReports((current) =>
      current.map((report) =>
        report.id === reportId
          ? {
              ...report,
              attestedAt: new Date().toISOString(),
              attestedSignatureId: body.signatureId
            }
          : report
      )
    );
    setAttestationPassword("");
    setAttestationRemarks("");
    setMessage("Access review attested.");
  };

  const createHold = async () => {
    const response = await fetch("/api/admin/retention/legal-holds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordType: newHoldType,
        recordId: newHoldRecordId,
        recordVersionId: newHoldVersionId || null,
        reason: newHoldReason || null
      })
    });
    const body = (await response.json()) as LegalHoldRow & { error?: string };
    if (!response.ok) {
      setMessage(body.error ?? "Failed to create legal hold.");
      return;
    }
    setLegalHolds((current) => [body, ...current]);
    setNewHoldRecordId("");
    setNewHoldVersionId("");
    setNewHoldReason("");
    setMessage("Legal hold created.");
  };

  const releaseHold = async (holdId: string) => {
    const response = await fetch(`/api/admin/retention/legal-holds/${holdId}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Released by admin." })
    });
    if (!response.ok) {
      const body = await response.json();
      setMessage(body.error ?? "Failed to release legal hold.");
      return;
    }
    setLegalHolds((current) => current.filter((hold) => hold.id !== holdId));
    setMessage("Legal hold released.");
  };

  const runPurge = async (dryRun: boolean) => {
    const response = await fetch("/api/admin/retention/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun })
    });
    const body = (await response.json()) as { runId?: string; error?: string };
    if (!response.ok || !body.runId) {
      setMessage(body.error ?? "Failed to run purge.");
      return;
    }
    setLastPurge({ runId: body.runId, dryRun });
    setMessage(dryRun ? "Purge dry-run completed." : "Purge completed.");
  };

  return (
    <main className="page">
      <section className="panel">
        <h1>Export Configuration</h1>
        {data ? (
          <>
            <p><strong>Instance Organization:</strong> {data.organization.name}</p>
            <p><strong>Export Retention:</strong> {data.retention.exportsDays} days</p>
            <p><strong>Source Document Retention:</strong> {data.retention.sourceDocumentsDays} days</p>
            <p><strong>Document/Version Retention:</strong> {data.retention.generatedDocumentsDays ?? "Indefinite"}</p>
            <p><strong>Audit Retention:</strong> {data.retention.auditRetentionDays ?? "Indefinite"}</p>
            <p><strong>Legal Hold Enabled:</strong> {data.retention.legalHoldEnabled ? "Yes" : "No"}</p>
            <p><strong>Backup Retention:</strong> {data.backup.retentionDays} days</p>
            <p><strong>Backup Frequency:</strong> {data.backup.frequency}</p>
            <p><strong>Backup Scheduling:</strong> {data.backup.schedulingMode}</p>
            <hr />
            <h2>Retention Settings</h2>
            <p>
              <strong>Audit Event Retention Days</strong><br />
              <input value={auditDays} onChange={(event) => setAuditDays(event.target.value)} placeholder="blank = indefinite" />
            </p>
            <p>
              <strong>Document/Version Retention Days</strong><br />
              <input value={docDays} onChange={(event) => setDocDays(event.target.value)} placeholder="blank = indefinite" />
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={legalHoldEnabled}
                  onChange={(event) => setLegalHoldEnabled(event.target.checked)}
                />{" "}
                Enable legal hold enforcement
              </label>
            </p>
            <button onClick={() => saveRetention().catch(() => setMessage("Failed to update retention settings."))}>
              Save Retention
            </button>
            <hr />
            <h2>Legal Holds</h2>
            <p>
              <strong>Record Type</strong><br />
              <select value={newHoldType} onChange={(event) => setNewHoldType(event.target.value)}>
                <option value="GENERATED_DOCUMENT">GENERATED_DOCUMENT</option>
                <option value="DOCUMENT_VERSION">DOCUMENT_VERSION</option>
              </select>
            </p>
            <p>
              <strong>Record ID</strong><br />
              <input value={newHoldRecordId} onChange={(event) => setNewHoldRecordId(event.target.value)} />
            </p>
            <p>
              <strong>Record Version ID (optional)</strong><br />
              <input value={newHoldVersionId} onChange={(event) => setNewHoldVersionId(event.target.value)} />
            </p>
            <p>
              <strong>Reason (optional)</strong><br />
              <input value={newHoldReason} onChange={(event) => setNewHoldReason(event.target.value)} />
            </p>
            <button onClick={() => createHold().catch(() => setMessage("Failed to create legal hold."))}>Create Legal Hold</button>
            {legalHolds.map((hold) => (
              <p key={hold.id}>
                <strong>{hold.recordType}</strong> {hold.recordId} {hold.recordVersionId ? `(${hold.recordVersionId})` : ""}
                {" - "}
                {hold.reason ?? "No reason"}
                {" "}
                <button onClick={() => releaseHold(hold.id).catch(() => setMessage("Failed to release legal hold."))}>Release</button>
              </p>
            ))}
            <hr />
            <h2>Purge Job</h2>
            <button onClick={() => runPurge(true).catch(() => setMessage("Failed to run dry-run purge."))}>Run Dry-Run</button>{" "}
            <button onClick={() => runPurge(false).catch(() => setMessage("Failed to run purge."))}>Run Purge</button>
            {lastPurge ? (
              <p>
                Last run: {lastPurge.runId} ({lastPurge.dryRun ? "dry-run" : "apply"}){" "}
                <a href={`/api/admin/retention/purge/${lastPurge.runId}/download`}>Download Signed Report</a>
              </p>
            ) : null}
            <hr />
            <h2>Organization Management</h2>
            <p>System owner only: create/delete organizations and seed each one with its own admin.</p>
            <p>
              <strong>Organization name</strong><br />
              <input value={newOrgName} onChange={(event) => setNewOrgName(event.target.value)} />
            </p>
            <p>
              <strong>Initial admin full name</strong><br />
              <input value={newOrgAdminName} onChange={(event) => setNewOrgAdminName(event.target.value)} />
            </p>
            <p>
              <strong>Initial admin email</strong><br />
              <input value={newOrgAdminEmail} onChange={(event) => setNewOrgAdminEmail(event.target.value)} />
            </p>
            <p>
              <strong>Initial admin password</strong><br />
              <input type="password" value={newOrgAdminPassword} onChange={(event) => setNewOrgAdminPassword(event.target.value)} />
            </p>
            <button onClick={() => createOrganization().catch(() => setMessage("Failed to create organization."))}>
              Create Organization
            </button>
            {organizations.map((org) => (
              <p key={org.id}>
                <strong>{org.name}</strong> ({org.isActive ? "active" : "inactive"}) - users: {org._count.users}
                {" "}
                {org.isActive ? (
                  <button onClick={() => deleteOrganization(org.id).catch(() => setMessage("Failed to delete organization."))}>
                    Delete
                  </button>
                ) : null}
              </p>
            ))}
            <hr />
            <h2>Organization Permissions</h2>
            <p>Roles available: ADMIN, REVIEWER, APPROVER, USER.</p>
            {users.map((user) => (
              <p key={user.id}>
                <strong>{user.fullName}</strong> ({user.email}) - {user.userStatus ?? "ACTIVE"}
                {typeof user.failedLoginAttempts === "number" ? `, failed attempts: ${user.failedLoginAttempts}` : ""}{" "}
                <select
                  value={user.role}
                  onChange={(event) => updateUserRole(user.id, event.target.value as UserRow["role"]).catch(() => setMessage("Failed to update user role."))}
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="REVIEWER">REVIEWER</option>
                  <option value="APPROVER">APPROVER</option>
                  <option value="USER">USER</option>
                </select>
                {user.userStatus === "LOCKED" ? (
                  <button onClick={() => unlockUser(user.id).catch(() => setMessage("Failed to unlock user."))}>Unlock</button>
                ) : null}
              </p>
            ))}
            <hr />
            <h2>Periodic Access Review</h2>
            <p>Generate exportable user access review reports and attest completion with e-signature.</p>
            <button onClick={() => generateAccessReviewReport().catch(() => setMessage("Failed to generate access review report."))}>
              Generate Access Review Report
            </button>
            <p>
              <strong>Attestation Password</strong><br />
              <input type="password" value={attestationPassword} onChange={(event) => setAttestationPassword(event.target.value)} />
            </p>
            <p>
              <strong>Attestation Remarks (optional)</strong><br />
              <input value={attestationRemarks} onChange={(event) => setAttestationRemarks(event.target.value)} />
            </p>
            {accessReviewReports.map((report) => (
              <p key={report.id}>
                <strong>{report.id}</strong> ({report.reportFormat}) created {report.createdAt}
                {" | "}
                hash: {report.reportHash.slice(0, 12)}...
                {" | "}
                <a href={`/api/admin/access-reviews/reports/${report.id}/download`}>Download CSV</a>
                {" "}
                {!report.attestedAt ? (
                  <button onClick={() => attestAccessReviewReport(report.id).catch(() => setMessage("Failed to attest access review report."))}>
                    Attest
                  </button>
                ) : (
                  <>Attested {report.attestedAt}</>
                )}
              </p>
            ))}
          </>
        ) : (
          <p>{message}</p>
        )}
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}
