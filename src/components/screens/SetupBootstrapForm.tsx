"use client";

import { useState } from "react";

export default function SetupBootstrapForm() {
  const [organizationName, setOrganizationName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const bootstrap = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/setup/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName, adminEmail, adminFullName, adminPassword })
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Setup failed.");
        return;
      }
      setMessage("Setup complete. You can now sign in.");
      window.location.assign("/");
    } catch {
      setMessage("Setup failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page">
      <section className="panel authPanel">
        <h1>ValDoc.AI Setup</h1>
        <p>Create the single deployment organization and first admin account.</p>
        <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Organization name" />
        <input value={adminFullName} onChange={(event) => setAdminFullName(event.target.value)} placeholder="Admin full name" />
        <input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="Admin email" />
        <input
          type="password"
          value={adminPassword}
          onChange={(event) => setAdminPassword(event.target.value)}
          placeholder="Admin password"
        />
        <button className="authButton" onClick={bootstrap} disabled={saving}>
          {saving ? "Creating..." : "Create Organization"}
        </button>
        <p>{message}</p>
      </section>
    </main>
  );
}
