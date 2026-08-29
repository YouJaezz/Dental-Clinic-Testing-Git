import type { TranslationDict } from "@/lib/i18n/locales/en";

export const tl: TranslationDict = {
  nav: {
    patients: "Mga pasyente",
    registrationQr: "QR para magparehistro",
    workspace: "Workspace",
    ongoingVisits: "Mga bukas na bisita",
    dailySales: "Araw-araw na benta",
    analytics: "Analytics",
    administration: "Administrasyon",
    changeHistory: "Kasaysayan ng pagbabago",
    visitBilling: "Bayad sa bisita",
    prescriptions: "Reseta",
  },
  common: {
    ok: "Sige",
    cancel: "Kanselahin",
    save: "I-save",
    delete: "Burahin",
    close: "Isara",
    language: "Wika",
    english: "Ingles",
    tagalog: "Tagalog",
    settings: "Mga setting",
    loading: "Naglo-load…",
  },
  visit: {
    startNew: "Magsimula ng bagong bisita",
    closeCurrent: "Isara ang kasalukuyang bisita",
    deleteVisit: "Burahin ang bisita",
    changePatient: "Palitan ang pasyente",
    selectVisit: "Pumili ng bisita…",
    open: "Bukas",
    closed: "Sarado",
    oneOpenHint:
      "May isang bukas na bisita — sabihin sa supervisor na isara muna bago magbukas ng bago.",
    manyOpenHint:
      "May {count} bukas na bisita — humingi ng tulong sa admin na isara o burahin ang maling bisita.",
    selectedClosedHint:
      "Sarado na ang napiling bisita. Para magpatuloy, magsimula ng bagong bisita o pumili ng iba.",
    charges: "Mga singil",
    paid: "Nabayaran",
    balance: "Balanse",
    openBlockTitle: "May bukas pa na bisita",
    openBlockLead:
      "May bukas na bisita ang pasyenteng ito. Hindi ka makakapagbukas ng bago dito.",
    openBlockHelp:
      "Pakiusap, sabihin sa dental assistant o supervisor. Sila ang mag-iisara ng lumang bisita o magbubukas ng tamang chart.",
    openBlockOk: "Sige, naiintindihan ko",
    startBlockedTitle: "May bisita pa na bukas",
    startBlockedLead:
      "Pakiusap, isara muna ang dating bisita bago magbukas ng bago. Isang bukas na bisita lang bawat pasyente.",
    startBlockedCurrent: "Kasalukuyang bukas na bisita",
    startBlockedAndMore: " (at {count} pa)",
    startBlockedCloseAndStart: "Isara ang dating bisita at magbukas ng bago",
    startBlockedCancelManual: "Kanselahin — isasara ko na lang",
    startBlockedOrManual:
      "Kung tapos na ang gamutan ngayon, maaari mong isara ang dating bisita at magbukas ng bago sa isang hakbang. Kung hindi, gamitin muna ang Isara ang kasalukuyang bisita.",
    closeTitle: "Isara ang bisitang ito?",
    closeNoProcedures:
      "Wala pang procedura sa bisitang ito. Isara lang kung mali ang pagbukas ng bisita.",
    closeSummary:
      "{count} procedura · Nabayaran {paid}{balance}",
    closeBalanceDue: " · Balanse {amount}",
    closeBalanceSettled: " · Walang balanse",
    closeLocks:
      "Kapag sarado na, hindi na makakapagdagdag ng procedura o bayad. Siguraduhing tapos na ang gamutan sa bisitang ito.",
    closeTip:
      "Tip: Pindutin lang nang isang beses kapag tapos na. Ang paulit-ulit na pindot ay nakakalito.",
    closeKeepOpen: "Panatilihing bukas",
    closeConfirm: "Oo, isara ang bisita",
    deleteTitle: "Permanenteng burahin ang bisita",
    deleteAdminOnly:
      "Para sa admin lang. Mabubura ang bisita at lahat ng procedura at bayad dito. Hindi na maibabalik.",
    deleteUnderstand: "Naiintindihan kong permanenteng mabubura ang bisitang ito",
    reopenVisit: "Buksan muli ang saradong bisita",
    reopenHint: "Admin II lang — para sa pagwawasto.",
    reopenConfirm: "Buksan muli ang bisita",
  },
  workspace: {
    overview: "Buod",
    procedures: "Mga procedura",
    record: "Rekord",
    payment: "Bayad",
    prescription: "Reseta",
    documents: "Mga file",
  },
  dev: {
    tab: "Advanced",
    devices: "Mga device / session",
    audit: "Audit log",
    users: "Mga role ng user",
    deviceEmail: "User",
    deviceLabel: "Device",
    deviceIp: "IP",
    deviceWhen: "Nag-sign in",
    deviceExpires: "Mag-e-expire",
    deleteAudit: "Burahin ang entry",
    role: "Role",
    changeRole: "I-update ang role",
    visitId: "Visit ID",
    loadSessions: "I-refresh ang mga device",
    noSessions: "Wala pang session.",
    blockDevice: "I-block ang device",
    unblockDevice: "Alisin ang block",
    blockedDevices: "Mga naka-block na device",
  },
};
