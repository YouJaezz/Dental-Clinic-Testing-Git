export const en = {
  nav: {
    patients: "Patients",
    registrationQr: "Registration QR",
    workspace: "Workspace",
    ongoingVisits: "Ongoing visits",
    dailySales: "Daily sales",
    analytics: "Analytics",
    administration: "Administration",
    changeHistory: "Change history",
    visitBilling: "Visit billing",
  },
  common: {
    ok: "OK",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    close: "Close",
    language: "Language",
    english: "English",
    tagalog: "Tagalog",
    settings: "Settings",
    loading: "Loading…",
  },
  visit: {
    startNew: "Start new visit",
    closeCurrent: "Close current visit",
    deleteVisit: "Delete visit",
    changePatient: "Change patient",
    selectVisit: "Select visit…",
    open: "Open",
    closed: "Closed",
    oneOpenHint:
      "One open visit — ask your supervisor to close it before starting another.",
    manyOpenHint:
      "{count} open visits — ask an admin to close or delete mistaken visits.",
    selectedClosedHint:
      "Selected visit is closed. To work on treatment, start a new visit or select another.",
    charges: "Charges",
    paid: "Paid",
    balance: "Balance",
    openBlockTitle: "Visit still open",
    openBlockLead:
      "This patient already has an open visit. You cannot start a new visit from here.",
    openBlockHelp:
      "Please tell the dental assistant or your supervisor. They will close the old visit or open the correct chart for you.",
    openBlockOk: "OK, I understand",
    startBlockedTitle: "Open visit already in progress",
    startBlockedLead:
      "Please close the existing visit first before opening a new one. Only one open visit is allowed per patient.",
    startBlockedCurrent: "Current open visit",
    startBlockedAndMore: " (and {count} more)",
    startBlockedCloseAndStart: "Close existing visit & start new",
    startBlockedCancelManual: "Cancel — I'll close it manually",
    startBlockedOrManual:
      "If today's treatment is finished, you can close the previous visit and open a new one in one step. Otherwise use Close current visit first.",
    closeTitle: "Close this visit?",
    closeNoProcedures:
      "No procedures are on this visit yet. Close only if the visit was opened by mistake.",
    closeSummary:
      "{count} procedure(s) recorded · Paid {paid}{balance}",
    closeBalanceDue: " · Balance due {amount}",
    closeBalanceSettled: " · Balance settled",
    closeLocks:
      "Closing locks this visit for new procedures and payments. Make sure treatment for this visit is finished.",
    closeTip:
      "Tip: Use this button once when the visit is complete. Repeated clicks cause confusion.",
    closeKeepOpen: "Keep visit open",
    closeConfirm: "Yes, close visit",
    deleteTitle: "Delete visit permanently",
    deleteAdminOnly:
      "Admin only. This removes the visit and all procedures and payments on it. Cannot be undone.",
    deleteUnderstand: "I understand this visit will be permanently deleted",
    reopenVisit: "Reopen closed visit",
    reopenHint: "Admin II only — opens a closed visit for corrections.",
    reopenConfirm: "Reopen visit",
  },
  workspace: {
    overview: "Overview",
    procedures: "Procedures",
    record: "Record",
    payment: "Payment",
  },
  dev: {
    tab: "Advanced",
    devices: "Devices / sessions",
    audit: "Audit log",
    users: "User roles",
    deviceEmail: "User",
    deviceLabel: "Device",
    deviceIp: "IP",
    deviceWhen: "Signed in",
    deviceExpires: "Expires",
    deleteAudit: "Delete entry",
    role: "Role",
    changeRole: "Update role",
    visitId: "Visit ID",
    loadSessions: "Refresh devices",
    noSessions: "No session records yet.",
    blockDevice: "Block device",
    unblockDevice: "Unblock",
    blockedDevices: "Blocked devices",
  },
} as const;

export type TranslationDict = typeof en;
