"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";

type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "USER" | "APPROVER" | "REVIEWER" | "VIEWER" | "AUTHOR" | "ENGINEER";
  organization: { id: string; name: string };
};

type Machine = {
  id: string;
  name: string;
  modelNumber: string;
  manufacturer: string;
};

type Job = {
  id: string;
  status: string;
  machine: { name: string };
  documents: Array<{
    id: string;
    title: string;
    status: string;
    docType: string;
    stage: "PRE_EXECUTION" | "EXECUTION" | "POST_EXECUTION";
    currentContent: string;
    latestVersionId?: string | null;
    latestVersionNumber?: number | null;
    latestVersionState?: "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE" | null;
  }>;
};

type Unit = {
  id: string;
  unitCode: string;
  status: string;
  unitGroupId?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  procurementDate?: string | null;
  calibrationDate?: string | null;
  calibrationDueDate?: string | null;
  pmPlanNumber?: string | null;
};

type UnitGroup = {
  id: string;
  name: string;
  description?: string | null;
};

type MachineDocument = {
  id: string;
  title: string;
  docType: string;
  stage: "PRE_EXECUTION" | "EXECUTION" | "POST_EXECUTION";
  status: string;
};

type UnitExecutedDocument = {
  id: string;
  title: string;
  documentType: "VENDOR_DOCUMENT" | "VENDOR_IOQ" | "OWNER_IOQ" | "EXECUTED_PROTOCOL" | "OTHER";
  fileName: string;
};

type EquipmentFact = {
  id: string;
  factType: string;
  key: string;
  value: string;
  units?: string | null;
  createdAt: string;
};

type UploadedSourceDocument = {
  id: string;
  title: string;
  version: string;
  uploadedAt: string;
};

type QualityIssue = {
  code: string;
  message: string;
};

type AuditEventItem = {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  detailsJson?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  actor?: { email: string; fullName: string; role: string } | null;
};

type AuditChainVerification = {
  pass: boolean;
  firstBrokenEventId: string | null;
  reason?: string | null;
  checkedEvents: number;
};

type SystemTimeStatus = {
  serverTimeUtc: string;
  appTimezone: string;
  ntp: {
    status: string;
    lastSyncUtc: string | null;
    assumption: string;
  };
};

type LoginOrganization = {
  id: string;
  name: string;
};

const sourceTypes = ["MANUAL", "DATASHEET", "DRAWING", "SOP", "CLIENT_CRITERIA", "SITE_STANDARD", "TEMPLATE"];
const docTemplateTypes = [
  "URS",
  "SIA",
  "RID",
  "DIA",
  "IOQ",
  "EXECUTED_PROTOCOL",
  "PROTOCOL_SUMMARY",
  "SUMMARY",
  "TRACEABILITY"
] as const;
type DocTemplateType = (typeof docTemplateTypes)[number];

type DocumentTemplate = {
  id: string;
  templateId?: string;
  version?: number;
  status?: "DRAFT" | "APPROVED" | "RETIRED";
  approvedAt?: string | null;
  docType: DocTemplateType;
  title: string;
  contentTemplate: string;
  templateKind?: "EXAMPLE" | "PRIMARY";
  isPrimary?: boolean;
  sourceFileName?: string | null;
  sourceFilePath?: string | null;
  sourceMimeType?: string | null;
};

type TemplateSuggestion = {
  title: string;
  contentTemplate: string;
  sourceCount: number;
};

type TemplateUploadState = {
  fileName: string;
  status: "PENDING" | "SAVED" | "FAILED";
};

const defaultTemplates: Record<DocTemplateType, { title: string; content: string }> = {
  URS: {
    title: "URS Template - TSX2320FA20 (General Equipment Format)",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\nModel: TSX2320FA20\n\n## 1 Purpose and Scope\n{{FACTS}}\n\n## 2 Area of Application\n\n## 3 Responsibilities\n\n## 4 Process\n\n## 5 Requirements\n\n### 5.1 Product Quality Critical Assessment\n\n### 5.2 General Requirements\n\n### 5.3 Functional Requirements\n\n### 5.4 Cleaning, Sanitization and Sterilization Requirements\n\n### 5.5 Utility Requirements\n\n### 5.6 Automation Requirements\n\n### 5.7 Metrology Requirements\n\n### 5.8 Electrical Requirements\n\n### 5.9 Health, Safety, and Environment\n\n### 5.10 Maintenance Requirements\n\n### 5.11 Flexibility\n\n### 5.12 Scope of Required Documentation\n\n## 6 Abbreviations and Acronyms\n\n## 7 Attachments and References\n\n## Citations\n{{CITATIONS}}"
  },
  SIA: {
    title: "SIA Template - TSX2320FA20",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Purpose\n\n## Scope\n\n## System Impact Assessment\n\n## Interfaces and Dependencies\n\n## GMP Risk Notes\n\n## Citations\n{{CITATIONS}}"
  },
  RID: {
    title: "RID Template - TSX2320FA20",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Purpose\n\n## Requirement Impact Details\n\n## Risk and Controls\n\n## Traceability References\n\n## Citations\n{{CITATIONS}}"
  },
  DIA: {
    title: "DIA Template - TSX2320FA20",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Purpose\n\n## Glossary\n\n## System/Software Overview\n\n## System Description\n\n## Data Integrity Requirements\n\n## Revision History\n\n## Appendices\n\n## Citations\n{{CITATIONS}}"
  },
  IOQ: {
    title: "IOQ Template - TSX2320FA20",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Purpose\n\n## Prerequisites\n\n## Installation Checks\n\n## Operational Checks\n\n## Acceptance Criteria\n\n## Deviations\n\n## Citations\n{{CITATIONS}}"
  },
  EXECUTED_PROTOCOL: {
    title: "Executed Protocol Template",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Execution Record\n\n## Results\n\n## Deviations and CAPA\n\n## Evidence Index\n\n## Citations\n{{CITATIONS}}"
  },
  PROTOCOL_SUMMARY: {
    title: "Protocol Summary Template",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Purpose\n\n## Execution Outcome Summary\n\n## Outstanding Actions\n\n## Conclusion\n\n## Citations\n{{CITATIONS}}"
  },
  SUMMARY: {
    title: "Validation Summary Template",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Scope\n\n## Summary of Qualification Activities\n\n## Final Compliance Assessment\n\n## Release Recommendation\n\n## Citations\n{{CITATIONS}}"
  },
  TRACEABILITY: {
    title: "Traceability Matrix Template",
    content:
      "# {{DOC_TITLE}}\n\nMachine: {{MACHINE_NAME}}\n\n## Requirement to Risk to Test Mapping\n\n## Matrix Rows\n\n## Citations\n{{CITATIONS}}"
  }
};

const callApi = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string; issues?: QualityIssue[] };
    const apiError = new Error(error.error ?? `HTTP ${response.status}`) as Error & { issues?: QualityIssue[] };
    if (Array.isArray(error.issues)) {
      apiError.issues = error.issues;
    }
    throw apiError;
  }
  return (await response.json()) as T;
};

const withTwoPersonRuleGuidance = (message: string) => {
  if (!message.toLowerCase().includes("two-person rule")) {
    return message;
  }
  return `${message} Remediation: ask a different Reviewer/Admin to approve, or use emergency override with documented justification.`;
};

const toDateInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatDateForDisplay = (value: string) => {
  if (!value) return "Not set";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return "Not set";
  const monthIndex = Number(month) - 1;
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const monthCode = monthNames[monthIndex];
  if (!monthCode) return "Not set";
  return `${day}${monthCode}${year}`;
};

const formatFactDisplayValue = (value: string, units?: string | null) => {
  const normalizedValue = value.trim();
  const normalizedUnits = units?.trim() ?? "";
  const toleranceMatch = normalizedValue.match(/^(.+?)\s*\+\/-\s*([0-9]+(?:\.[0-9]+)?)%$/);
  if (toleranceMatch) {
    const nominal = toleranceMatch[1]?.trim() ?? "";
    const tolerance = toleranceMatch[2]?.trim() ?? "";
    if (normalizedUnits) {
      return `${nominal} ${normalizedUnits} +/- ${tolerance}%`;
    }
    return `${nominal} +/- ${tolerance}%`;
  }
  if (normalizedUnits) {
    return `${normalizedValue} ${normalizedUnits}`;
  }
  return normalizedValue;
};

const formatUploadDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toISOString().slice(0, 10);
};

const stopDragDefaults = (event: DragEvent<HTMLElement>) => {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
};

export default function EnterpriseWorkspace() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [loginOrganizations, setLoginOrganizations] = useState<LoginOrganization[]>([]);
  const [selectedLoginOrganizationId, setSelectedLoginOrganizationId] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [sourceType, setSourceType] = useState("MANUAL");
  const [executedIoqUnitId, setExecutedIoqUnitId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [newMachine, setNewMachine] = useState({ name: "", modelNumber: "", manufacturer: "" });
  const [machineUnits, setMachineUnits] = useState<Unit[]>([]);
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([]);
  const [machineDocs, setMachineDocs] = useState<MachineDocument[]>([]);
  const [equipmentFacts, setEquipmentFacts] = useState<EquipmentFact[]>([]);
  const [unitBaseCode, setUnitBaseCode] = useState("TSX");
  const [unitCount, setUnitCount] = useState(5);
  const [newUnitGroupName, setNewUnitGroupName] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [unitDetails, setUnitDetails] = useState({
    serialNumber: "",
    location: "",
    procurementDate: "",
    calibrationDate: "",
    calibrationDueDate: "",
    pmPlanNumber: ""
  });
  const [unitExecutedDocs, setUnitExecutedDocs] = useState<UnitExecutedDocument[]>([]);
  const [unitExecutedTitle, setUnitExecutedTitle] = useState("");
  const [unitExecutedType, setUnitExecutedType] = useState<"VENDOR_DOCUMENT" | "VENDOR_IOQ" | "EXECUTED_PROTOCOL" | "OTHER">("EXECUTED_PROTOCOL");
  const [unitExecutedFile, setUnitExecutedFile] = useState<File | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [templateDocType, setTemplateDocType] = useState<DocTemplateType>("URS");
  const [templateTitle, setTemplateTitle] = useState(defaultTemplates.URS.title);
  const [templateFiles, setTemplateFiles] = useState<File[]>([]);
  const [templateUploadStates, setTemplateUploadStates] = useState<TemplateUploadState[]>([]);
  const [templateDragOver, setTemplateDragOver] = useState(false);
  const [templateMode, setTemplateMode] = useState<"UPLOAD_OR_EDIT" | "AUTO_SUGGEST">("UPLOAD_OR_EDIT");
  const [templateLibraryView, setTemplateLibraryView] = useState<"UPLOAD" | "DATABASE">("UPLOAD");
  const [templateSuggestions, setTemplateSuggestions] = useState<TemplateSuggestion[]>([]);
  const [factForm, setFactForm] = useState({
    factType: "RANGE",
    key: "",
    value: "",
    units: "",
    fluctuationPercent: ""
  });
  const [workspaceMode, setWorkspaceMode] = useState<"VIEW_EQUIPMENT" | "MANAGE_DOCUMENTS" | "TEMPLATE_GENERATOR">("VIEW_EQUIPMENT");
  const [isEquipmentFactsOpen, setIsEquipmentFactsOpen] = useState(false);
  const [isUnitDetailsOpen, setIsUnitDetailsOpen] = useState(false);
  const [isUnitDetailsEditing, setIsUnitDetailsEditing] = useState(false);
  const [isFactsFolderOpen, setIsFactsFolderOpen] = useState(false);
  const [isUploadsFolderOpen, setIsUploadsFolderOpen] = useState(false);
  const [uploadedSourceDocuments, setUploadedSourceDocuments] = useState<UploadedSourceDocument[]>([]);
  const [message, setMessage] = useState<string>("");
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [auditChainVerification, setAuditChainVerification] = useState<AuditChainVerification | null>(null);
  const [systemTimeStatus, setSystemTimeStatus] = useState<SystemTimeStatus | null>(null);
  const [auditFilters, setAuditFilters] = useState({
    action: "",
    entityType: "",
    actorUserId: "",
    dateFrom: "",
    dateTo: ""
  });
  const [loading, setLoading] = useState(false);
  const [signingDocumentId, setSigningDocumentId] = useState<string | null>(null);
  const canCreateMachine = user?.role === "ADMIN";

  const selectedJob = useMemo(() => jobs[0] ?? null, [jobs]);

  const refreshAuditEvents = useCallback(async () => {
    if (user?.role !== "ADMIN") {
      return;
    }
    const query = new URLSearchParams();
    if (auditFilters.action.trim()) query.set("action", auditFilters.action.trim());
    if (auditFilters.entityType.trim()) query.set("entityType", auditFilters.entityType.trim());
    if (auditFilters.actorUserId.trim()) query.set("actorUserId", auditFilters.actorUserId.trim());
    if (auditFilters.dateFrom.trim()) query.set("dateFrom", auditFilters.dateFrom.trim());
    if (auditFilters.dateTo.trim()) query.set("dateTo", auditFilters.dateTo.trim());

    try {
      const events = await callApi<AuditEventItem[]>(`/api/audit-events?${query.toString()}`);
      setAuditEvents(events);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load audit logs.");
    }
  }, [user?.role, auditFilters]);

  const verifyAuditChain = useCallback(async () => {
    if (user?.role !== "ADMIN") {
      return;
    }
    try {
      const verification = await callApi<AuditChainVerification>("/api/admin/audit/verify-chain");
      setAuditChainVerification(verification);
      if (verification.pass) {
        setMessage(`Audit chain verified (${verification.checkedEvents} events checked).`);
      } else {
        setMessage(
          `Audit chain verification failed at event ${verification.firstBrokenEventId ?? "unknown"} (${verification.reason ?? "unknown_reason"}).`
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to verify audit chain.");
    }
  }, [user?.role]);

  const refreshSystemTimeStatus = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    try {
      const status = await callApi<SystemTimeStatus>("/api/admin/system-time-status");
      setSystemTimeStatus(status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load system time status.");
    }
  }, [user?.role]);

  const refreshData = useCallback(async () => {
    const [machinesResult, jobsResult, templatesResult] = await Promise.allSettled([
      callApi<Machine[]>("/api/machines"),
      callApi<Job[]>("/api/jobs"),
      callApi<DocumentTemplate[]>("/api/templates")
    ]);

    if (machinesResult.status === "fulfilled") {
      setMachines(machinesResult.value);
      if (!selectedMachineId && machinesResult.value.length > 0) {
        setSelectedMachineId(machinesResult.value[0].id);
      }
    }

    if (jobsResult.status === "fulfilled") {
      setJobs(jobsResult.value);
    }

    if (templatesResult.status === "fulfilled") {
      setTemplates(templatesResult.value);
    }

  }, [selectedMachineId]);

  const refreshMachineContext = useCallback(async () => {
    if (!selectedMachineId) {
      setMachineUnits([]);
      setUnitGroups([]);
      setMachineDocs([]);
      setUploadedSourceDocuments([]);
      setExecutedIoqUnitId("");
      return;
    }

    const [unitsResult, groupsResult, docsResult, factsResult, uploadsResult] = await Promise.allSettled([
      callApi<Unit[]>(`/api/machines/${selectedMachineId}/units`),
      callApi<UnitGroup[]>(`/api/machines/${selectedMachineId}/unit-groups`),
      callApi<MachineDocument[]>(`/api/machines/${selectedMachineId}/documents`),
      callApi<EquipmentFact[]>(`/api/machines/${selectedMachineId}/facts`),
      callApi<UploadedSourceDocument[]>(`/api/machines/${selectedMachineId}/uploads`)
    ]);

    if (unitsResult.status === "fulfilled") {
      setMachineUnits(unitsResult.value);
      if (sourceType === "EXECUTED_IOQ") {
        const selectedUnitStillExists = unitsResult.value.some((unit) => unit.id === executedIoqUnitId);
        if (!selectedUnitStillExists) {
          setExecutedIoqUnitId(unitsResult.value[0]?.id ?? "");
        }
      }
      if (unitsResult.value.length === 0) {
        setSelectedUnitId("");
      } else if (selectedUnitId) {
        const current = unitsResult.value.find((u) => u.id === selectedUnitId);
        if (!current) {
          setSelectedUnitId("");
        } else {
          setUnitDetails({
            serialNumber: current.serialNumber ?? "",
            location: current.location ?? "",
            procurementDate: toDateInput(current.procurementDate),
            calibrationDate: toDateInput(current.calibrationDate),
            calibrationDueDate: toDateInput(current.calibrationDueDate),
            pmPlanNumber: current.pmPlanNumber ?? ""
          });
        }
      }
    } else {
      setMachineUnits([]);
    }

    if (groupsResult.status === "fulfilled") {
      setUnitGroups(groupsResult.value);
    } else {
      setUnitGroups([]);
    }

    if (docsResult.status === "fulfilled") {
      setMachineDocs(docsResult.value);
    } else {
      setMachineDocs([]);
    }

    if (factsResult.status === "fulfilled") {
      setEquipmentFacts(factsResult.value);
    } else {
      setEquipmentFacts([]);
    }
    if (uploadsResult.status === "fulfilled") {
      setUploadedSourceDocuments(uploadsResult.value);
    } else {
      setUploadedSourceDocuments([]);
    }
  }, [selectedMachineId, selectedUnitId, sourceType, executedIoqUnitId]);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const organizations = await callApi<LoginOrganization[]>("/api/auth/organizations");
        setLoginOrganizations(organizations);
      } catch {
        setLoginOrganizations([]);
      }

      try {
        const session = await callApi<SessionUser>("/api/auth/me");
        setUser(session);
        setSelectedLoginOrganizationId(session.organization.id);
        await refreshData();
      } catch {
        setUser(null);
      } finally {
        setSessionResolved(true);
      }
    };

    hydrate().catch(() => {
      setUser(null);
      setSessionResolved(true);
    });
  }, [refreshData]);

  useEffect(() => {
    refreshMachineContext().catch(() => {
      setMachineUnits([]);
      setUnitGroups([]);
      setMachineDocs([]);
      setEquipmentFacts([]);
      setUploadedSourceDocuments([]);
    });
  }, [refreshMachineContext]);

  useEffect(() => {
    setIsFactsFolderOpen(false);
    setIsUploadsFolderOpen(false);
    setIsEquipmentFactsOpen(false);
    setIsUnitDetailsOpen(false);
    setIsUnitDetailsEditing(false);
  }, [selectedMachineId]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    refreshAuditEvents().catch(() => undefined);
    refreshSystemTimeStatus().catch(() => undefined);
  }, [user?.role, refreshAuditEvents, refreshSystemTimeStatus]);

  useEffect(() => {
    const loadUnitExecutedDocs = async () => {
      if (!selectedUnitId) {
        setUnitExecutedDocs([]);
        return;
      }
      try {
        const docs = await callApi<UnitExecutedDocument[]>(`/api/units/${selectedUnitId}/executed-documents`);
        setUnitExecutedDocs(docs);
      } catch {
        setUnitExecutedDocs([]);
      }
    };

    loadUnitExecutedDocs().catch(() => {
      setUnitExecutedDocs([]);
    });
  }, [selectedUnitId]);

  useEffect(() => {
    const selected = defaultTemplates[templateDocType];
    setTemplateTitle(selected.title);
    setTemplateFiles([]);
    setTemplateUploadStates([]);
    setTemplateSuggestions([]);
  }, [templateDocType]);

  const templatesByDocType = useMemo(() => {
    return templates.reduce<Record<string, DocumentTemplate[]>>((acc, template) => {
      const key = template.docType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(template);
      return acc;
    }, {});
  }, [templates]);

  const login = async () => {
    if (!selectedLoginOrganizationId) {
      setMessage("Select organization before signing in.");
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      await callApi<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: selectedLoginOrganizationId, email: loginEmail, password: loginPassword })
      });

      const session = await callApi<SessionUser>("/api/auth/me");
      setUser(session);
      setSelectedLoginOrganizationId(session.organization.id);
      await refreshData();
      setMessage("Login successful.");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Login failed.";
      setMessage(messageText);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await callApi<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
      setUser(null);
      setMachines([]);
      setJobs([]);
      setSelectedMachineId("");
      setMessage("Signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign out failed.");
    }
  };

  const createMachine = async () => {
    if (!canCreateMachine) {
      setMessage("Only Admin or Engineer roles can create equipment.");
      return;
    }

    if (!newMachine.name || !newMachine.modelNumber || !newMachine.manufacturer) {
      setMessage("Provide machine name, model number, and manufacturer.");
      return;
    }

    try {
      const created = await callApi<Machine>("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMachine)
      });
      setMachines((current) => [created, ...current]);
      setSelectedMachineId(created.id);
      setNewMachine({ name: "", modelNumber: "", manufacturer: "" });
      await refreshData();
      setMessage("Machine created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create machine.");
    }
  };

  const deleteMachine = async () => {
    if (user?.role !== "ADMIN") {
      setMessage("Only Admin can delete equipment.");
      return;
    }
    if (!selectedMachineId) {
      setMessage("Select a machine to delete.");
      return;
    }

    try {
      await callApi("/api/machines", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId: selectedMachineId })
      });
      setSelectedMachineId("");
      await refreshData();
      setMessage("Machine deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete machine.");
    }
  };

  const createUnits = async () => {
    if (!selectedMachineId) {
      setMessage("Select a machine first.");
      return;
    }
    if (!unitBaseCode || unitCount < 1) {
      setMessage("Provide a unit base code and count.");
      return;
    }

    try {
      await callApi<{ created: Unit[] }>(`/api/machines/${selectedMachineId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseCode: unitBaseCode, count: unitCount })
      });
      await refreshMachineContext();
      setMessage("Units created/updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create units.");
    }
  };

  const deleteUnit = async (unitId: string) => {
    if (user?.role !== "ADMIN") {
      setMessage("Only Admin can delete units.");
      return;
    }
    if (!selectedMachineId) return;

    try {
      await callApi(`/api/machines/${selectedMachineId}/units`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId })
      });
      await refreshMachineContext();
      setMessage("Unit deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete unit.");
    }
  };

  const createUnitGroup = async () => {
    if (!selectedMachineId) {
      setMessage("Select a machine first.");
      return;
    }
    if (!newUnitGroupName.trim()) {
      setMessage("Enter a group name.");
      return;
    }

    try {
      await callApi(`/api/machines/${selectedMachineId}/unit-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newUnitGroupName.trim() })
      });
      setNewUnitGroupName("");
      await refreshMachineContext();
      setMessage("Unit group saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save unit group.");
    }
  };

  const assignUnitToGroup = async (unitId: string, unitGroupId: string | null) => {
    if (!selectedMachineId) return;

    try {
      await callApi(`/api/machines/${selectedMachineId}/unit-groups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, unitGroupId })
      });
      await refreshMachineContext();
      setMessage("Unit group assignment updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to assign unit to group.");
    }
  };

  const selectedUnit = machineUnits.find((unit) => unit.id === selectedUnitId) ?? null;
  const ungroupedUnits = useMemo(
    () => machineUnits.filter((unit) => !unit.unitGroupId),
    [machineUnits]
  );
  const groupNameById = useMemo(
    () => Object.fromEntries(unitGroups.map((group) => [group.id, group.name])),
    [unitGroups]
  );

  const selectUnit = (unitId: string) => {
    if (!unitId) {
      setSelectedUnitId("");
      return;
    }
    const unit = machineUnits.find((item) => item.id === unitId);
    if (!unit) return;
    setSelectedUnitId(unit.id);
    setIsUnitDetailsOpen(false);
    setIsUnitDetailsEditing(false);
    setUnitDetails({
      serialNumber: unit.serialNumber ?? "",
      location: unit.location ?? "",
      procurementDate: toDateInput(unit.procurementDate),
      calibrationDate: toDateInput(unit.calibrationDate),
      calibrationDueDate: toDateInput(unit.calibrationDueDate),
      pmPlanNumber: unit.pmPlanNumber ?? ""
    });
  };

  const saveUnitDetails = async () => {
    if (user?.role !== "ADMIN") {
      setMessage("Only Admin can edit unit details.");
      return;
    }
    if (!selectedMachineId || !selectedUnitId) {
      setMessage("Select a unit first.");
      return;
    }

    try {
      const updated = await callApi<Unit>(`/api/machines/${selectedMachineId}/units`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selectedUnitId,
          ...unitDetails
        })
      });
      setMachineUnits((current) =>
        current.map((unit) => (unit.id === updated.id ? { ...unit, ...updated } : unit))
      );
      setUnitDetails({
        serialNumber: updated.serialNumber ?? "",
        location: updated.location ?? "",
        procurementDate: toDateInput(updated.procurementDate),
        calibrationDate: toDateInput(updated.calibrationDate),
        calibrationDueDate: toDateInput(updated.calibrationDueDate),
        pmPlanNumber: updated.pmPlanNumber ?? ""
      });
      await refreshMachineContext();
      setSelectedUnitId("");
      setMessage("Unit details updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update unit details.");
    }
  };

  const upload = async () => {
    if (!uploadFile || !selectedMachineId) {
      setMessage("Select a machine and file first.");
      return;
    }

    if (sourceType === "EXECUTED_IOQ") {
      if (!executedIoqUnitId) {
        setMessage("Select the executed IOQ unit.");
        return;
      }
      const executedForm = new FormData();
      executedForm.set("title", uploadFile.name.replace(/\.[^/.]+$/, ""));
      executedForm.set("documentType", "EXECUTED_PROTOCOL");
      executedForm.set("file", uploadFile);
      try {
        await callApi(`/api/units/${executedIoqUnitId}/executed-documents`, {
          method: "POST",
          body: executedForm
        });
        await refreshMachineContext();
        setMessage("Executed IOQ uploaded to selected unit.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Executed IOQ upload failed.");
      }
      return;
    }

    const formData = new FormData();
    formData.set("machineId", selectedMachineId);
    formData.set("sourceType", sourceType);
    formData.set("file", uploadFile);

    try {
      await callApi("/api/uploads", { method: "POST", body: formData });
      setMessage("Upload processed and indexed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    }
  };

  const uploadUnitExecutedDocument = async () => {
    if (!selectedUnitId) {
      setMessage("Select a unit first.");
      return;
    }
    if (!unitExecutedFile) {
      setMessage("Select an executed document file.");
      return;
    }

    const formData = new FormData();
    formData.set("title", unitExecutedTitle);
    formData.set("documentType", unitExecutedType);
    formData.set("file", unitExecutedFile);

    try {
      await callApi(`/api/units/${selectedUnitId}/executed-documents`, {
        method: "POST",
        body: formData
      });
      setUnitExecutedTitle("");
      setUnitExecutedType("EXECUTED_PROTOCOL");
      setUnitExecutedFile(null);
      const docs = await callApi<UnitExecutedDocument[]>(`/api/units/${selectedUnitId}/executed-documents`);
      setUnitExecutedDocs(docs);
      setMessage("Unit executed document uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to upload executed unit document.");
    }
  };

  const createEquipmentFact = async () => {
    if (!selectedMachineId) {
      setMessage("Select a machine first.");
      return;
    }
    const fluctuationText = factForm.fluctuationPercent.trim();
    if (fluctuationText) {
      const fluctuationNumber = Number(fluctuationText);
      if (!Number.isFinite(fluctuationNumber) || fluctuationNumber < 0) {
        setMessage("Fluctuation % must be a non-negative number.");
        return;
      }
    }
    const valueWithTolerance = fluctuationText
      ? `${factForm.value.trim()} +/- ${fluctuationText}%`
      : factForm.value;
    try {
      await callApi(`/api/machines/${selectedMachineId}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fact_type: factForm.factType,
          key: factForm.key,
          value: valueWithTolerance,
          units: factForm.units || null
        })
      });
      setFactForm({
        factType: "RANGE",
        key: "",
        value: "",
        units: "",
        fluctuationPercent: ""
      });
      await refreshMachineContext();
      setMessage("Equipment fact created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create fact.");
    }
  };

  const updateEquipmentFact = async (fact: EquipmentFact) => {
    if (!selectedMachineId) return;
    try {
      await callApi(`/api/machines/${selectedMachineId}/facts/${fact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: fact.value,
          units: fact.units ?? null
        })
      });
      await refreshMachineContext();
      setMessage("Fact updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update fact.");
    }
  };

  const deleteEquipmentFact = async (factId: string) => {
    if (!selectedMachineId) return;
    try {
      await callApi(`/api/machines/${selectedMachineId}/facts/${factId}`, {
        method: "DELETE"
      });
      await refreshMachineContext();
      setMessage("Fact deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete fact.");
    }
  };

  const generate = async (phase: "pre_execution" | "post_execution") => {
    if (!selectedMachineId) {
      setMessage("Select a machine to generate documents.");
      return;
    }

    try {
      const generatedJob = await callApi<Job>("/api/generation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId: selectedMachineId,
          phase
        })
      });
      if (phase === "post_execution" && sourceType === "EXECUTED_IOQ" && executedIoqUnitId) {
        const summaryDocument = generatedJob.documents.find((document) => document.docType === "PROTOCOL_SUMMARY");
        if (summaryDocument) {
          const exportResponse = await fetch(
            `/api/export/${generatedJob.id}?format=pdf&documentId=${summaryDocument.id}`
          );
          if (!exportResponse.ok) {
            throw new Error("Failed to export post-execution summary PDF.");
          }
          const summaryBlob = await exportResponse.blob();
          const summaryFile = new File(
            [summaryBlob],
            `${summaryDocument.title.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`,
            { type: "application/pdf" }
          );
          const summaryForm = new FormData();
          summaryForm.set("title", summaryDocument.title);
          summaryForm.set("documentType", "EXECUTED_PROTOCOL");
          summaryForm.set("file", summaryFile);
          await callApi(`/api/units/${executedIoqUnitId}/executed-documents`, {
            method: "POST",
            body: summaryForm
          });
        }
      }
      await refreshData();
      await refreshMachineContext();
      setMessage(`${phase === "pre_execution" ? "Pre-execution" : "Post-execution"} generation completed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generation failed.");
    }
  };

  const uploadTemplateExamples = async () => {
    if (templateFiles.length === 0) {
      setMessage("Add one or more template files first.");
      return;
    }
    if (templateFiles.length > 10) {
      setMessage("You can upload up to 10 template files at once.");
      return;
    }
    const formData = new FormData();
    formData.set("docType", templateDocType);
    templateFiles.forEach((file) => formData.append("files", file));

    try {
      const result = await callApi<{ created: DocumentTemplate[] }>("/api/templates", {
        method: "POST",
        body: formData
      });
      const createdNames = new Set(result.created.map((item) => item.title));
      setTemplateUploadStates((current) =>
        current.map((item) => ({
          ...item,
          status: createdNames.has(item.fileName) ? "SAVED" : "FAILED"
        }))
      );
      await refreshData();
      setTemplateFiles([]);
      setMessage(`${result.created.length} template example(s) uploaded for ${templateDocType}.`);
    } catch (error) {
      setTemplateUploadStates((current) =>
        current.map((item) => ({
          ...item,
          status: "FAILED"
        }))
      );
      setMessage(error instanceof Error ? error.message : "Failed to upload template examples.");
    }
  };

  const generateTemplateOptions = async () => {
    try {
      const options = await callApi<TemplateSuggestion[]>(
        `/api/templates/suggestions?docType=${templateDocType}`
      );
      setTemplateSuggestions(options);
      setMessage(`${templateDocType} template options generated from existing knowledge base.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate template options.");
    }
  };

const deleteTemplate = async (templateId: string) => {
    if (user?.role !== "ADMIN") {
      setMessage("Only Admin can retire templates.");
      return;
    }

    try {
      await callApi(`/api/templates/${templateId}`, { method: "DELETE" });
      await refreshData();
      setMessage("Template retired.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to retire template.");
    }
  };

  const loadTemplateFromFile = async (file: File) => {
    try {
      await file.text();
      if (!templateTitle.trim()) {
        setTemplateTitle(file.name.replace(/\.[^.]+$/, ""));
      }
      setMessage("Template file loaded.");
    } catch {
      setMessage("Failed to read template file.");
    }
  };

  const setTemplateFilesFromList = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).slice(0, 10);
    setTemplateFiles(files);
    setTemplateUploadStates(
      files.map((file) => ({
        fileName: file.name,
        status: "PENDING"
      }))
    );
    if (files[0]) {
      loadTemplateFromFile(files[0]).catch(() => {
        setMessage("Failed to read template file.");
      });
    }
  };

  const saveVersion = async (documentId: string, content: string, changeReason: string) => {
    try {
      await callApi(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_json: content,
          change_reason: changeReason.trim() || "Manual edit from review UI"
        })
      });
      await refreshData();
      setMessage("Version saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save version.");
    }
  };

  const transitionVersionState = async (
    documentId: string,
    versionId: string,
    toState: "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE",
    options?: {
      replacementVersionId?: string;
      justification?: string;
      emergencyOverride?: boolean;
      overrideJustification?: string;
    }
  ) => {
    try {
      await callApi(`/api/documents/${documentId}/versions/${versionId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_state: toState,
          replacement_version_id: options?.replacementVersionId,
          justification: options?.justification,
          emergency_override: options?.emergencyOverride,
          override_justification: options?.overrideJustification
        })
      });
      await refreshData();
      setMessage(`Version transitioned to ${toState}.`);
    } catch (error) {
      setMessage(
        withTwoPersonRuleGuidance(error instanceof Error ? error.message : "Failed to transition version state.")
      );
    }
  };


  const decide = async (documentId: string, decision: "APPROVED" | "REJECTED") => {
    try {
      setQualityIssues([]);
      await callApi(`/api/review/${documentId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      await refreshData();
      setMessage(`Document ${decision.toLowerCase()}.`);
    } catch (error) {
      const issues = (error as Error & { issues?: QualityIssue[] })?.issues;
      if (Array.isArray(issues)) {
        setQualityIssues(issues);
      }
      setMessage(error instanceof Error ? error.message : "Review update failed.");
    }
  };

  const signRecordVersion = async (params: {
    recordType: "generated-document";
    recordId: string;
    versionId: string;
    meaning: "AUTHOR" | "REVIEW" | "APPROVE";
    password: string;
    remarks?: string;
    emergencyOverride?: boolean;
    overrideJustification?: string;
  }) => {
    try {
      setSigningDocumentId(params.recordId);
      await callApi(`/api/records/${params.recordType}/${params.recordId}/versions/${params.versionId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meaning: params.meaning,
          password: params.password,
          remarks: params.remarks,
          emergency_override: params.emergencyOverride,
          override_justification: params.overrideJustification
        })
      });
      await refreshData();
      setMessage("Electronic signature recorded.");
    } catch (error) {
      setMessage(withTwoPersonRuleGuidance(error instanceof Error ? error.message : "Failed to sign record version."));
    } finally {
      setSigningDocumentId(null);
    }
  };

  if (!sessionResolved) {
    return (
      <main className="page">
        <section className="panel authPanel">
          <h1>ValDoc.AI</h1>
          <p>Checking session...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page">
        <section className="panel authPanel">
          <h1>ValDoc.AI Enterprise Login</h1>
          <p>Multi-tenant access with organization-level data isolation.</p>
          <label htmlFor="organization-select">Organization</label>
          <select
            id="organization-select"
            aria-label="Organization"
            value={selectedLoginOrganizationId}
            onChange={(event) => setSelectedLoginOrganizationId(event.target.value)}
          >
            <option value="">
              {loginOrganizations.length === 0 ? "No organizations available" : "Select organization"}
            </option>
            {loginOrganizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="email" />
          <input
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            placeholder="password"
          />
          <button className="authButton" onClick={login} disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <p>{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="topBar">
        <div className="topBarBrand">
          <h1>ValDoc.AI</h1>
          <p>Organization: {user.organization.name} | User: {user.fullName} ({user.role})</p>
          <div className="modeTabs topBarModes" style={{ marginTop: "8px" }}>
            <button
              className={workspaceMode === "VIEW_EQUIPMENT" ? "activeTab" : ""}
              onClick={() => setWorkspaceMode("VIEW_EQUIPMENT")}
            >View Equipment and Units</button>
            <button
              className={workspaceMode === "MANAGE_DOCUMENTS" ? "activeTab" : ""}
              onClick={() => setWorkspaceMode("MANAGE_DOCUMENTS")}
            >
              Manage Documents
            </button>
            <button
              className={workspaceMode === "TEMPLATE_GENERATOR" ? "activeTab" : ""}
              onClick={() => setWorkspaceMode("TEMPLATE_GENERATOR")}
            >
              Template Generator
            </button>
          </div>
        </div>
        <div className="row topBarControls">
          {user.role === "ADMIN" ? (
            <button className="topBarAction" onClick={() => window.location.assign("/export-configuration")}>Export Configuration</button>
          ) : null}
          <button className="topBarAction" onClick={refreshData}>Refresh</button>
          <button className="authButton" onClick={logout}>Sign out</button>
        </div>
      </header>

      {workspaceMode === "VIEW_EQUIPMENT" ? (
      <section className="grid3">
        <article className="panel">
          <h2>1. Equipment Scope</h2>
          <div className="inputs">
            <input
              value={newMachine.name}
              onChange={(event) => setNewMachine((current) => ({ ...current, name: event.target.value }))}
              placeholder="Machine name"
            />
            <input
              value={newMachine.modelNumber}
              onChange={(event) => setNewMachine((current) => ({ ...current, modelNumber: event.target.value }))}
              placeholder="Model number"
            />
            <input
              value={newMachine.manufacturer}
              onChange={(event) => setNewMachine((current) => ({ ...current, manufacturer: event.target.value }))}
              placeholder="Manufacturer"
            />
            <button onClick={createMachine} disabled={!canCreateMachine}>
              Create machine
            </button>
            <button onClick={deleteMachine} disabled={user?.role !== "ADMIN" || !selectedMachineId}>
              Delete selected machine
            </button>
            {!canCreateMachine ? (
              <p>Role restriction: only Admin/Engineer can create equipment.</p>
            ) : null}
            <select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)}>
              <option value="">Select machine</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name} ({machine.modelNumber})
                </option>
              ))}
            </select>
            <div className="docCard">
              <button type="button" onClick={() => setIsEquipmentFactsOpen((current) => !current)}>
                Equipment Setpoints (MVP Manual Entry)
              </button>
              {isEquipmentFactsOpen ? (
                <>
                  <div className="row">
                    <input
                      value={factForm.factType}
                      onChange={(event) => setFactForm((current) => ({ ...current, factType: event.target.value }))}
                      placeholder="Fact type (e.g. RANGE)"
                    />
                    <input
                      value={factForm.key}
                      onChange={(event) => setFactForm((current) => ({ ...current, key: event.target.value }))}
                      placeholder="Fact key (e.g. temperature_range)"
                    />
                    <input
                      value={factForm.value}
                      onChange={(event) => setFactForm((current) => ({ ...current, value: event.target.value }))}
                      placeholder="Value"
                    />
                    <input
                      value={factForm.units}
                      onChange={(event) => setFactForm((current) => ({ ...current, units: event.target.value }))}
                      placeholder="Units"
                    />
                    <input
                      value={factForm.fluctuationPercent}
                      onChange={(event) => setFactForm((current) => ({ ...current, fluctuationPercent: event.target.value }))}
                      placeholder="Fluctuation % (optional)"
                    />
                    <button onClick={createEquipmentFact}>Add Fact</button>
                  </div>
                  {equipmentFacts.length === 0 ? (
                    <p>No facts yet.</p>
                  ) : (
                    equipmentFacts.map((fact) => (
                      <div className="docCard" key={fact.id}>
                        <p><strong>{fact.factType}</strong> | {fact.key}</p>
                        <input
                          value={fact.value}
                          onChange={(event) =>
                            setEquipmentFacts((current) =>
                              current.map((item) => (item.id === fact.id ? { ...item, value: event.target.value } : item))
                            )
                          }
                        />
                        <input
                          value={fact.units ?? ""}
                          onChange={(event) =>
                            setEquipmentFacts((current) =>
                              current.map((item) => (item.id === fact.id ? { ...item, units: event.target.value } : item))
                            )
                          }
                          placeholder="Units"
                        />
                        <div className="row">
                          <button onClick={() => updateEquipmentFact(fact)}>Save</button>
                          <button onClick={() => deleteEquipmentFact(fact.id)} disabled={user?.role !== "ADMIN"}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              ) : null}
            </div>
          </div>
        </article>

        <article className="panel">
          <h2>2. Units and Governing Documents</h2>
          <p>Create sub-units and view pre-execution governing docs by folder.</p>
          <div className="row">
            <input
              value={unitBaseCode}
              onChange={(event) => setUnitBaseCode(event.target.value)}
              placeholder="Unit base code (e.g., TSX)"
            />
            <input
              type="number"
              min={1}
              value={unitCount}
              onChange={(event) => setUnitCount(Number(event.target.value))}
              placeholder="Count"
            />
            <button onClick={createUnits} disabled={!selectedMachineId}>Create units</button>
          </div>
          <div className="docCard">
            <p><strong>Applicable Units</strong></p>
            <div className="row">
              <input
                value={newUnitGroupName}
                onChange={(event) => setNewUnitGroupName(event.target.value)}
                placeholder="New unit group name"
              />
              <button onClick={createUnitGroup} disabled={!selectedMachineId}>Save Group</button>
            </div>
            <div className="unitBoard">
              <div
                className="unitLane"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const unitId = event.dataTransfer.getData("text/plain");
                  if (unitId) {
                    assignUnitToGroup(unitId, null).catch(() => {
                      setMessage("Failed to unassign unit group.");
                    });
                  }
                }}
              >
                <p><strong>Applicable Units (Unassigned)</strong></p>
                {ungroupedUnits.length === 0 ? (
                  <p>No unassigned units.</p>
                ) : (
                  ungroupedUnits.map((unit) => (
                    <div className="unitChip" key={unit.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", unit.id)}>
                      <button type="button" onClick={() => selectUnit(unit.id)}>{unit.unitCode}</button>
                      <button onClick={() => deleteUnit(unit.id)} disabled={user?.role !== "ADMIN"}>Delete</button>
                    </div>
                  ))
                )}
              </div>
              <div className="unitLane">
                <p><strong>Unit Groups</strong></p>
                {unitGroups.length === 0 ? (
                  <p>No groups yet.</p>
                ) : (
                  unitGroups.map((group) => (
                    <div
                      key={group.id}
                      className="groupLane"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const unitId = event.dataTransfer.getData("text/plain");
                        if (unitId) {
                          assignUnitToGroup(unitId, group.id).catch(() => {
                            setMessage("Failed to assign unit group.");
                          });
                        }
                      }}
                    >
                      <p><strong>{group.name}</strong></p>
                      {machineUnits.filter((unit) => unit.unitGroupId === group.id).length === 0 ? (
                        <p>Drop units here.</p>
                      ) : (
                        machineUnits
                          .filter((unit) => unit.unitGroupId === group.id)
                          .map((unit) => (
                            <div className="unitChip" key={unit.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", unit.id)}>
                              <button type="button" onClick={() => selectUnit(unit.id)}>{unit.unitCode}</button>
                              <button onClick={() => deleteUnit(unit.id)} disabled={user?.role !== "ADMIN"}>Delete</button>
                            </div>
                          ))
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <h2>3. Unit Records and Documents</h2>
          <p>Select a specific unit to review details and related folders.</p>
          <select value={selectedUnitId} onChange={(event) => selectUnit(event.target.value)}>
            <option value="">Select unit</option>
            {machineUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.unitCode}
              </option>
            ))}
          </select>
          {selectedUnit ? (
            <div className="docCard">
              <button
                type="button"
                onClick={() =>
                  setIsUnitDetailsOpen((current) => {
                    if (current) setIsUnitDetailsEditing(false);
                    return !current;
                  })
                }
              >
                Unit Details ({selectedUnit.unitCode})
              </button>
              {isUnitDetailsOpen ? (
                <>
                  <p><strong>Unit Group:</strong> {selectedUnit.unitGroupId ? groupNameById[selectedUnit.unitGroupId] : "Unassigned"}</p>
                  {isUnitDetailsEditing ? (
                    <>
                      <label>Serial Number (S/N)</label>
                      <input
                        value={unitDetails.serialNumber}
                        onChange={(event) => setUnitDetails((current) => ({ ...current, serialNumber: event.target.value }))}
                        placeholder="Serial Number (S/N)"
                        disabled={user?.role !== "ADMIN"}
                      />
                      <label>Location</label>
                      <input
                        value={unitDetails.location}
                        onChange={(event) => setUnitDetails((current) => ({ ...current, location: event.target.value }))}
                        placeholder="Location"
                        disabled={user?.role !== "ADMIN"}
                      />
                      <label>Procurement Date</label>
                      <p>{formatDateForDisplay(unitDetails.procurementDate)}</p>
                      <input
                        type="date"
                        value={unitDetails.procurementDate}
                        onChange={(event) => setUnitDetails((current) => ({ ...current, procurementDate: event.target.value }))}
                        disabled={user?.role !== "ADMIN"}
                      />
                      <label>Calibration Date</label>
                      <p>{formatDateForDisplay(unitDetails.calibrationDate)}</p>
                      <input
                        type="date"
                        value={unitDetails.calibrationDate}
                        onChange={(event) => setUnitDetails((current) => ({ ...current, calibrationDate: event.target.value }))}
                        disabled={user?.role !== "ADMIN"}
                      />
                      <label>Calibration Due Date</label>
                      <p>{formatDateForDisplay(unitDetails.calibrationDueDate)}</p>
                      <input
                        type="date"
                        value={unitDetails.calibrationDueDate}
                        onChange={(event) => setUnitDetails((current) => ({ ...current, calibrationDueDate: event.target.value }))}
                        disabled={user?.role !== "ADMIN"}
                      />
                      <input
                        value={unitDetails.pmPlanNumber}
                        onChange={(event) => setUnitDetails((current) => ({ ...current, pmPlanNumber: event.target.value }))}
                        placeholder="PM Plan Number"
                        disabled={user?.role !== "ADMIN"}
                      />
                      <div className="row">
                        <button onClick={saveUnitDetails} disabled={user?.role !== "ADMIN"}>Save Unit Details</button>
                        <button
                          type="button"
                          onClick={() => {
                            selectUnit(selectedUnit.id);
                            setIsUnitDetailsOpen(true);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p><strong>Serial Number (S/N):</strong> {unitDetails.serialNumber || "Not set"}</p>
                      <p><strong>Location:</strong> {unitDetails.location || "Not set"}</p>
                      <p><strong>Procurement Date:</strong> {formatDateForDisplay(unitDetails.procurementDate)}</p>
                      <p><strong>Calibration Date:</strong> {formatDateForDisplay(unitDetails.calibrationDate)}</p>
                      <p><strong>Calibration Due Date:</strong> {formatDateForDisplay(unitDetails.calibrationDueDate)}</p>
                      <p><strong>PM Plan Number:</strong> {unitDetails.pmPlanNumber || "Not set"}</p>
                      {user?.role === "ADMIN" ? (
                        <button type="button" onClick={() => setIsUnitDetailsEditing(true)}>Edit Unit Details</button>
                      ) : null}
                    </>
                  )}
                  <hr />
                  <p><strong>Executed Documents for {selectedUnit.unitCode}</strong></p>
                  <div className="row">
                    <input
                      value={unitExecutedTitle}
                      onChange={(event) => setUnitExecutedTitle(event.target.value)}
                      placeholder="Document title"
                    />
                    <select
                      value={unitExecutedType}
                      onChange={(event) =>
                        setUnitExecutedType(
                          event.target.value as "VENDOR_DOCUMENT" | "VENDOR_IOQ" | "EXECUTED_PROTOCOL" | "OTHER"
                        )
                      }
                    >
                      <option value="VENDOR_DOCUMENT">Vendor Document</option>
                      <option value="VENDOR_IOQ">Vendor IOQ</option>
                      <option value="EXECUTED_PROTOCOL">Owner IOQ / Executed Protocol</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input
                      type="file"
                      onChange={(event) => setUnitExecutedFile(event.target.files?.item(0) ?? null)}
                    />
                    <button onClick={uploadUnitExecutedDocument}>Upload Document</button>
                  </div>
                  {unitExecutedDocs.length === 0 ? (
                    <p>No unit-specific documents yet.</p>
                  ) : (
                    unitExecutedDocs
                      .map((doc) => (
                        <p key={doc.id}>
                          <a href={`/api/units/${selectedUnit.id}/executed-documents/${doc.id}`} target="_blank">
                            {doc.title}
                          </a>{" "}
                          ({doc.documentType})
                        </p>
                      ))
                  )}
                </>
              ) : null}
            </div>
          ) : (
            <p>Select a unit to view details and documents.</p>
          )}
          <div className="docCard">
            <p><strong>Folder: URS</strong></p>
            {machineDocs.filter((doc) => doc.docType === "URS").length === 0 ? (
              <p>No URS documents yet.</p>
            ) : (
              machineDocs
                .filter((doc) => doc.docType === "URS")
                .map((doc) => <p key={doc.id}>{doc.title} ({doc.status})</p>)
            )}
          </div>
          <div className="docCard">
            <p><strong>Folder: DIA</strong></p>
            {machineDocs.filter((doc) => doc.docType === "DIA").length === 0 ? (
              <p>No DIA documents yet.</p>
            ) : (
              machineDocs
                .filter((doc) => doc.docType === "DIA")
                .map((doc) => <p key={doc.id}>{doc.title} ({doc.status})</p>)
            )}
          </div>
          <div className="docCard">
            <button type="button" onClick={() => setIsFactsFolderOpen((current) => !current)}>
              Folder: Setpoints
            </button>
            {isFactsFolderOpen ? (
              equipmentFacts.length === 0 ? (
                <p>No saved facts yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th align="left">Title</th>
                      <th align="left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentFacts.map((fact) => (
                      <tr key={fact.id}>
                        <td>{fact.key}</td>
                        <td>{formatFactDisplayValue(fact.value, fact.units)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}
          </div>
          <div className="docCard">
            <button type="button" onClick={() => setIsUploadsFolderOpen((current) => !current)}>
              Folder: Document Uploads
            </button>
            {isUploadsFolderOpen ? (
              uploadedSourceDocuments.length === 0 ? (
                <p>No uploaded source documents yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th align="left">Title</th>
                      <th align="left">Version</th>
                      <th align="left">Upload Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedSourceDocuments.map((doc) => (
                      <tr key={doc.id}>
                        <td>{doc.title}</td>
                        <td>{doc.version}</td>
                        <td>{formatUploadDate(doc.uploadedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}
          </div>
          <p>{message}</p>
        </article>
      </section>
      ) : null}

      {workspaceMode === "VIEW_EQUIPMENT" && user.role === "ADMIN" ? (
        <section className="panel" style={{ marginTop: "14px" }}>
          <h2>Audit Logs</h2>
          <p>Filter and export append-only security and compliance events.</p>
          <div className="docCard auditTimeStatus">
            <p><strong>System Time Status</strong></p>
            <button onClick={refreshSystemTimeStatus}>Refresh Time Status</button>
            {systemTimeStatus ? (
              <>
                <p>Current Server Time (UTC): {systemTimeStatus.serverTimeUtc}</p>
                <p>App Timezone Config: {systemTimeStatus.appTimezone}</p>
                <p>NTP Sync Status: {systemTimeStatus.ntp.status}</p>
                <p>Last NTP Sync (UTC): {systemTimeStatus.ntp.lastSyncUtc ?? "Not reported"}</p>
                <p>{systemTimeStatus.ntp.assumption}</p>
              </>
            ) : (
              <p>System time status unavailable.</p>
            )}
          </div>
          <div className="row auditFiltersRow">
            <input
              value={auditFilters.action}
              onChange={(event) => setAuditFilters((current) => ({ ...current, action: event.target.value }))}
              placeholder="Action (e.g. auth.login.failed)"
            />
            <input
              value={auditFilters.entityType}
              onChange={(event) => setAuditFilters((current) => ({ ...current, entityType: event.target.value }))}
              placeholder="Entity type (e.g. Machine)"
            />
            <input
              value={auditFilters.actorUserId}
              onChange={(event) => setAuditFilters((current) => ({ ...current, actorUserId: event.target.value }))}
              placeholder="Actor user id"
            />
            <input
              type="date"
              value={auditFilters.dateFrom}
              onChange={(event) => setAuditFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            />
            <input
              type="date"
              value={auditFilters.dateTo}
              onChange={(event) => setAuditFilters((current) => ({ ...current, dateTo: event.target.value }))}
            />
            <button onClick={refreshAuditEvents}>Apply Filters</button>
            <button onClick={verifyAuditChain}>Verify Chain</button>
            <a
              href={`/api/audit-events?${new URLSearchParams({
                ...(auditFilters.action.trim() ? { action: auditFilters.action.trim() } : {}),
                ...(auditFilters.entityType.trim() ? { entityType: auditFilters.entityType.trim() } : {}),
                ...(auditFilters.actorUserId.trim() ? { actorUserId: auditFilters.actorUserId.trim() } : {}),
                ...(auditFilters.dateFrom.trim() ? { dateFrom: auditFilters.dateFrom.trim() } : {}),
                ...(auditFilters.dateTo.trim() ? { dateTo: auditFilters.dateTo.trim() } : {}),
                format: "csv"
              }).toString()}`}
              target="_blank"
            >
              Export CSV
            </a>
          </div>
          {auditChainVerification ? (
            <p>
              Chain: {auditChainVerification.pass ? "PASS" : "FAIL"} | Checked: {auditChainVerification.checkedEvents}
              {auditChainVerification.pass
                ? ""
                : ` | First Broken Event: ${auditChainVerification.firstBrokenEventId ?? "unknown"} (${auditChainVerification.reason ?? "unknown"})`}
            </p>
          ) : null}
          {auditEvents.length === 0 ? (
            <p>No audit events found for current filter.</p>
          ) : (
            <table className="auditTable">
              <thead>
                <tr>
                  <th align="left">Timestamp</th>
                  <th align="left">Action</th>
                  <th align="left">Organization</th>
                  <th align="left">Actor</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{formatUploadDate(event.timestamp)}</td>
                    <td>{event.action}</td>
                    <td>{user.organization.name}</td>
                    <td>{event.actor?.email ?? "unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {workspaceMode === "MANAGE_DOCUMENTS" ? (
        <section className="panel" style={{ marginTop: "14px" }}>
          <h2>2. Drag-and-Drop Upload</h2>
          <p>Store and manage relevant source documents. Upload executed IOQ to generate post-execution summaries.</p>
          <select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)}>
            <option value="">Select machine</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name} ({machine.modelNumber})
              </option>
            ))}
          </select>
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
            {sourceTypes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
            <option value="EXECUTED_IOQ">EXECUTED_IOQ</option>
          </select>
          {sourceType === "EXECUTED_IOQ" ? (
            <>
              <label htmlFor="executedIoqUnit">Executed IOQ Unit</label>
              <select
                id="executedIoqUnit"
                value={executedIoqUnitId}
                onChange={(event) => setExecutedIoqUnitId(event.target.value)}
              >
                <option value="">Select unit</option>
                {machineUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.unitCode}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <div
            className={`dropZone ${dragOver ? "dragOver" : ""}`}
            onDragEnter={(event) => {
              stopDragDefaults(event);
              setDragOver(true);
            }}
            onDragOver={(event) => {
              stopDragDefaults(event);
              setDragOver(true);
            }}
            onDragLeave={(event) => {
              stopDragDefaults(event);
              setDragOver(false);
            }}
            onDrop={(event) => {
              stopDragDefaults(event);
              const file = event.dataTransfer.files.item(0);
              if (file) setUploadFile(file);
              setDragOver(false);
            }}
          >
            <p>{uploadFile ? uploadFile.name : "Drop source file here"}</p>
            <input
              type="file"
              onChange={(event) => setUploadFile(event.target.files?.item(0) ?? null)}
            />
          </div>
          <button onClick={upload}>Process upload</button>
          <button onClick={() => generate("post_execution")}>Generate Post-Execution Summaries</button>
          <p>{message}</p>
        </section>
      ) : null}

      {workspaceMode === "TEMPLATE_GENERATOR" ? (
        <section className="panel" style={{ marginTop: "14px" }}>
          <h2>Review and Export</h2>
          {selectedJob ? (
            <div className="docList">
              <p><strong>Latest Job:</strong> {selectedJob.id} ({selectedJob.status})</p>
              <p><strong>Pre-execution documents</strong></p>
              {selectedJob.documents
                .filter((document) => document.stage === "PRE_EXECUTION" || document.stage === "EXECUTION")
                .map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    onSave={saveVersion}
                    onDecision={decide}
                    onTransition={transitionVersionState}
                    onSign={signRecordVersion}
                    jobId={selectedJob.id}
                    userRole={user.role}
                    isSigning={signingDocumentId === document.id}
                  />
                ))}
              <p><strong>Post-execution documents</strong></p>
              {selectedJob.documents
                .filter((document) => document.stage === "POST_EXECUTION")
                .map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    onSave={saveVersion}
                    onDecision={decide}
                    onTransition={transitionVersionState}
                    onSign={signRecordVersion}
                    jobId={selectedJob.id}
                    userRole={user.role}
                    isSigning={signingDocumentId === document.id}
                  />
                ))}
              {qualityIssues.length > 0 ? (
                <div className="docCard">
                  <p><strong>Quality Gate Failures</strong></p>
                  {qualityIssues.map((issue) => (
                    <p key={`${issue.code}-${issue.message}`}>
                      [{issue.code}] {issue.message}
                    </p>
                  ))}
                </div>
              ) : null}
              <a href={`/api/export/${selectedJob.id}?format=zip`} target="_blank">Download Package ZIP</a>
            </div>
          ) : (
            <p>No generation jobs yet.</p>
          )}
        </section>
      ) : null}

      {workspaceMode === "TEMPLATE_GENERATOR" ? (
        <section className="panel" style={{ marginTop: "14px" }}>
          <h2>Template Builder</h2>
          <p>Choose how your organization manages templates for generation.</p>
          <div className="row">
            <button
              className={templateMode === "UPLOAD_OR_EDIT" ? "authButton" : ""}
              onClick={() => setTemplateMode("UPLOAD_OR_EDIT")}
            >
              Option 1: Use Company Template
            </button>
            <button
              className={templateMode === "AUTO_SUGGEST" ? "authButton" : ""}
              onClick={() => setTemplateMode("AUTO_SUGGEST")}
            >
              Option 2: Auto-Generate 2 Template Options
            </button>
          </div>
          <div className="row">
            <select value={templateDocType} onChange={(event) => setTemplateDocType(event.target.value as DocTemplateType)}>
              {docTemplateTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {templateMode === "AUTO_SUGGEST" ? (
              <button onClick={generateTemplateOptions}>Generate 2 options</button>
            ) : (
              <input value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} placeholder="Primary template title" />
            )}
          </div>
          {templateMode === "UPLOAD_OR_EDIT" ? (
            <>
              <p>Upload up to 10 example templates for this document type. First file is previewed and can be set as primary.</p>
              <div
                className={`dropZone ${templateDragOver ? "dragOver" : ""}`}
                onDragEnter={(event) => {
                  stopDragDefaults(event);
                  setTemplateDragOver(true);
                }}
                onDragOver={(event) => {
                  stopDragDefaults(event);
                  setTemplateDragOver(true);
                }}
                onDragLeave={(event) => {
                  stopDragDefaults(event);
                  setTemplateDragOver(false);
                }}
                onDrop={(event) => {
                  stopDragDefaults(event);
                  setTemplateFilesFromList(event.dataTransfer.files);
                  setTemplateDragOver(false);
                }}
              >
                <p>Drop template files here (max 10)</p>
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    setTemplateFilesFromList(event.target.files);
                  }}
                />
              </div>
              <div className="row">
                <button onClick={uploadTemplateExamples}>Upload Examples to Database</button>
                <button
                  className={templateLibraryView === "DATABASE" ? "authButton" : ""}
                  onClick={() => setTemplateLibraryView(templateLibraryView === "UPLOAD" ? "DATABASE" : "UPLOAD")}
                >
                  {templateLibraryView === "UPLOAD" ? "Database" : "Back to Upload"}
                </button>
              </div>
              {templateLibraryView === "UPLOAD" ? (
                <div className="docCard">
                  <p><strong>Queued files ({templateFiles.length})</strong></p>
                  {templateUploadStates.length === 0 ? (
                    <p>No files selected.</p>
                  ) : (
                    templateUploadStates.map((file) => (
                      <p key={file.fileName}>
                        {file.fileName}{" "}
                        {file.status === "SAVED" ? <span className="statusSaved">✓ Saved</span> : null}
                        {file.status === "FAILED" ? <span className="statusFailed">[FAILED]</span> : null}
                        {file.status === "PENDING" ? <span>[PENDING]</span> : null}
                      </p>
                    ))
                  )}
                </div>
              ) : (
                <div className="docList">
                  <p><strong>Template Database</strong></p>
                  {Object.keys(templatesByDocType).length === 0 ? (
                    <p>No templates in database yet.</p>
                  ) : (
                    docTemplateTypes.map((type) => {
                      const docs = templatesByDocType[type] ?? [];
                      if (docs.length === 0) return null;
                      return (
                        <div className="docCard" key={type}>
                          <p><strong>{type}</strong></p>
                          {docs.map((template) => (
                            <p key={template.id}>
                              <a href={`/api/templates/${template.id}/download`} target="_blank">
                                {template.sourceFileName ?? template.title}
                              </a>{" "}
                              {(template.status ?? (template.isPrimary ? "APPROVED" : "DRAFT"))}{" "}
                              {`v${template.version ?? 1}`}{" "}
                              <a href={`/api/templates/${template.id}/history`} target="_blank">
                                history
                              </a>{" "}
                              {user.role === "ADMIN" ? (
                                <button
                                  type="button"
                                  onClick={() => deleteTemplate(template.id)}
                                  style={{ marginLeft: "8px", padding: "4px 8px" }}
                                >
                                  Retire
                                </button>
                              ) : null}
                            </p>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="docList">
              {templateSuggestions.length === 0 ? (
                <p>No options generated yet. Click &quot;Generate 2 options&quot;.</p>
              ) : (
                templateSuggestions.map((option, index) => (
                  <div className="docCard" key={`${option.title}-${index}`}>
                    <p><strong>{option.title}</strong></p>
                    <p>Built from {option.sourceCount} documents/templates in your organization workspace.</p>
                    <div className="row">
                      <button
                        onClick={() => {
                          setTemplateTitle(option.title);
                          setTemplateMode("UPLOAD_OR_EDIT");
                          setMessage("Template option selected.");
                        }}
                      >
                        Use this option
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}

function DocumentCard(props: {
  document: Job["documents"][number];
  onSave: (id: string, content: string, changeReason: string) => Promise<void>;
  onDecision: (id: string, decision: "APPROVED" | "REJECTED") => Promise<void>;
  onTransition: (
    documentId: string,
    versionId: string,
    toState: "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE",
    options?: {
      replacementVersionId?: string;
      justification?: string;
      emergencyOverride?: boolean;
      overrideJustification?: string;
    }
  ) => Promise<void>;
  onSign: (params: {
    recordType: "generated-document";
    recordId: string;
    versionId: string;
    meaning: "AUTHOR" | "REVIEW" | "APPROVE";
    password: string;
    remarks?: string;
    emergencyOverride?: boolean;
    overrideJustification?: string;
  }) => Promise<void>;
  jobId: string;
  userRole: SessionUser["role"];
  isSigning: boolean;
}) {
  const [content, setContent] = useState(props.document.currentContent);
  const [isSignOpen, setIsSignOpen] = useState(false);
  const [signMeaning, setSignMeaning] = useState<"AUTHOR" | "REVIEW" | "APPROVE">("APPROVE");
  const [signPassword, setSignPassword] = useState("");
  const [signRemarks, setSignRemarks] = useState("");
  const [changeReason, setChangeReason] = useState("Manual edit from review UI");
  const [transitionTarget, setTransitionTarget] = useState<"DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE">("IN_REVIEW");
  const [obsoleteReplacementVersionId, setObsoleteReplacementVersionId] = useState("");
  const [obsoleteJustification, setObsoleteJustification] = useState("");
  const [transitionEmergencyOverride, setTransitionEmergencyOverride] = useState(false);
  const [transitionOverrideJustification, setTransitionOverrideJustification] = useState("");
  const [signEmergencyOverride, setSignEmergencyOverride] = useState(false);
  const [signOverrideJustification, setSignOverrideJustification] = useState("");

  return (
    <div className="docCard">
      <p><strong>{props.document.docType}</strong> | {props.document.status}</p>
      <p>{props.document.title}</p>
      <p>Latest Version: {props.document.latestVersionNumber ?? "N/A"}</p>
      <p>Lifecycle State: {props.document.latestVersionState ?? "N/A"}</p>
      <input
        value={changeReason}
        onChange={(event) => setChangeReason(event.target.value)}
        placeholder="Change reason (required)"
      />
      <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={8} />
      <div className="row">
        <button onClick={() => props.onSave(props.document.id, content, changeReason)}>Save version</button>
        <button onClick={() => props.onDecision(props.document.id, "APPROVED")}>Approve</button>
        <button onClick={() => props.onDecision(props.document.id, "REJECTED")}>Reject</button>
        <select
          value={transitionTarget}
          onChange={(event) => setTransitionTarget(event.target.value as "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE")}
          disabled={!props.document.latestVersionId}
        >
          <option value="DRAFT">DRAFT</option>
          <option value="IN_REVIEW">IN_REVIEW</option>
          <option value="APPROVED">APPROVED</option>
          <option value="OBSOLETE">OBSOLETE</option>
        </select>
        <button
          onClick={() => {
            if (!props.document.latestVersionId) return;
            props.onTransition(props.document.id, props.document.latestVersionId, transitionTarget, {
              replacementVersionId: transitionTarget === "OBSOLETE" ? obsoleteReplacementVersionId : undefined,
              justification: transitionTarget === "OBSOLETE" ? obsoleteJustification : undefined,
              emergencyOverride: transitionTarget === "APPROVED" ? transitionEmergencyOverride : undefined,
              overrideJustification: transitionTarget === "APPROVED" ? transitionOverrideJustification : undefined
            });
          }}
          disabled={!props.document.latestVersionId}
        >
          Apply Lifecycle Transition
        </button>
        <button
          onClick={() => setIsSignOpen((current) => !current)}
          disabled={!props.document.latestVersionId}
        >
          {isSignOpen ? "Cancel Sign" : "Electronic Sign"}
        </button>
      </div>
      {transitionTarget === "OBSOLETE" ? (
        <div className="row">
          <input
            value={obsoleteReplacementVersionId}
            onChange={(event) => setObsoleteReplacementVersionId(event.target.value)}
            placeholder="Replacement version id (optional)"
          />
          <input
            value={obsoleteJustification}
            onChange={(event) => setObsoleteJustification(event.target.value)}
            placeholder="Obsolete justification"
          />
        </div>
      ) : null}
      {transitionTarget === "APPROVED" ? (
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={transitionEmergencyOverride}
              onChange={(event) => setTransitionEmergencyOverride(event.target.checked)}
            />
            Emergency override
          </label>
          <input
            value={transitionOverrideJustification}
            onChange={(event) => setTransitionOverrideJustification(event.target.value)}
            placeholder="Override justification"
          />
        </div>
      ) : null}
      {isSignOpen ? (
        <div className="docCard" style={{ marginTop: "8px" }}>
          <p><strong>Signature Modal</strong></p>
          <select value={signMeaning} onChange={(event) => setSignMeaning(event.target.value as "AUTHOR" | "REVIEW" | "APPROVE")}>
            <option value="AUTHOR">AUTHOR</option>
            <option value="REVIEW">REVIEW</option>
            <option value="APPROVE">APPROVE</option>
          </select>
          <input
            type="password"
            value={signPassword}
            onChange={(event) => setSignPassword(event.target.value)}
            placeholder="Re-enter password"
          />
          <input
            value={signRemarks}
            onChange={(event) => setSignRemarks(event.target.value)}
            placeholder="Remarks (optional)"
          />
          {signMeaning === "APPROVE" ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={signEmergencyOverride}
                  onChange={(event) => setSignEmergencyOverride(event.target.checked)}
                />
                Emergency override
              </label>
              <input
                value={signOverrideJustification}
                onChange={(event) => setSignOverrideJustification(event.target.value)}
                placeholder="Override justification"
              />
            </>
          ) : null}
          <button
            disabled={!props.document.latestVersionId || !signPassword || props.isSigning}
            onClick={async () => {
              if (!props.document.latestVersionId) return;
              await props.onSign({
                recordType: "generated-document",
                recordId: props.document.id,
                versionId: props.document.latestVersionId,
                meaning: signMeaning,
                password: signPassword,
                remarks: signRemarks,
                emergencyOverride: signEmergencyOverride,
                overrideJustification: signOverrideJustification
              });
              setSignPassword("");
              setSignRemarks("");
              setSignEmergencyOverride(false);
              setSignOverrideJustification("");
              setIsSignOpen(false);
            }}
          >
            {props.isSigning ? "Signing..." : "Confirm Signature"}
          </button>
          <p>Signed by: {props.userRole} user with password re-authentication.</p>
        </div>
      ) : null}
      <div className="row">
        <a href={`/api/export/${props.jobId}?format=docx&documentId=${props.document.id}`} target="_blank">DOCX</a>
        <a href={`/api/export/${props.jobId}?format=pdf&documentId=${props.document.id}`} target="_blank">PDF</a>
      </div>
    </div>
  );
}

