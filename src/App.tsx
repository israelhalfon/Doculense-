import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Upload,
  FileText,
  Search,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sliders,
  RefreshCw,
  Edit3,
  Save,
  Plus,
  Trash2,
  Send,
  Camera,
  X,
  AlertCircle,
  FileSpreadsheet,
  FolderOpen,
  Smartphone,
  LogOut,
  File,
  Mail,
  Paperclip,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { User } from "firebase/auth";
import {
  DocumentRecord,
  ExtractedDocumentData,
  DocumentLineItem,
} from "./types/document";
import {
  INITIAL_SAMPLE_DOCUMENTS,
  formatDocumentToMarkdown,
  formatDocumentToEmailHtml,
} from "./data/sampleDocuments";
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  listDriveFiles,
  downloadDriveFileAsDataUrl,
  DriveFileItem,
  sendEmailViaGmail,
  utf8ToBase64,
  EmailAttachmentPayload,
} from "./services/googleDriveAuth";

const STORAGE_KEY = "doculens_il_records_v2";
const EMAIL_RECIPIENTS_STORAGE_KEY = "doculens_il_saved_emails_v1";

export interface SavedEmailRecipient {
  email: string;
  label?: string;
  useCount: number;
  lastUsedAt: number;
  createdAt: number;
}

async function preparePayloadForGemini(
  dataUrl: string,
  originalMimeType: string,
  textContent?: string
): Promise<{
  base64?: string;
  mimeType: string;
  textContent?: string;
}> {
  if (textContent) {
    return {
      mimeType: originalMimeType || "text/plain",
      textContent,
    };
  }

  // If PDF or raster image data URL (jpeg, png, webp)
  if (
    dataUrl.startsWith("data:") &&
    !dataUrl.startsWith("data:image/svg+xml")
  ) {
    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*?);/);
    const detectedMime = mimeMatch
      ? mimeMatch[1]
      : originalMimeType || "application/pdf";
    return {
      base64,
      mimeType: detectedMime,
    };
  }

  // Rasterize SVG onto canvas as PNG for Gemini Vision
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 680;
      canvas.height = img.naturalHeight || 860;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("לא ניתן ליצור משטח ציור לעיבוד התמונה."));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const pngDataUrl = canvas.toDataURL("image/png");
      const base64 = pngDataUrl.split(",")[1];
      resolve({ base64, mimeType: "image/png" });
    };
    img.onerror = () => reject(new Error("שגיאה בטעינת הקובץ לפענוח."));
    img.src = dataUrl;
  });
}

function OfficialGoogleSignInButton({
  onClick,
  disabled,
  label = "Sign in with Google",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gsi-material-button disabled:opacity-50"
    >
      <div className="gsi-material-button-state"></div>
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            style={{ display: "block" }}
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            ></path>
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            ></path>
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            ></path>
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            ></path>
            <path fill="none" d="M0 0h48v48H0z"></path>
          </svg>
        </div>
        <span className="gsi-material-button-contents">{label}</span>
        <span style={{ display: "none" }}>{label}</span>
      </div>
    </button>
  );
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_SAMPLE_DOCUMENTS;
  });

  const [selectedId, setSelectedId] = useState<string>(
    () => documents[0]?.id || INITIAL_SAMPLE_DOCUMENTS[0].id
  );
  const [activeView, setActiveView] = useState<
    "workspace" | "ledger" | "markdown"
  >("workspace");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "invoice" | "note" | "menu"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Upload & AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [customFocus, setCustomFocus] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Image viewer controls
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [highContrastInk, setHighContrastInk] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<ExtractedDocumentData | null>(
    null
  );

  // Copy feedback
  const [copiedReport, setCopiedReport] = useState(false);

  // Follow-up Q&A state
  const [questionInput, setQuestionInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  // Camera capture modal state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Google Drive state
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [driveSearch, setDriveSearch] = useState("");
  const [driveFilter, setDriveFilter] = useState<
    "all" | "pdf" | "docs" | "image"
  >("all");
  const [driveError, setDriveError] = useState<string | null>(null);
  const [importingFileId, setImportingFileId] = useState<string | null>(null);

  // Email sending & remembered email addresses state
  const [savedEmails, setSavedEmails] = useState<SavedEmailRecipient[]>(() => {
    try {
      const raw = localStorage.getItem(EMAIL_RECIPIENTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailDocId, setEmailDocId] = useState<string | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [emailLabelInput, setEmailLabelInput] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailPersonalNote, setEmailPersonalNote] = useState("");
  const [attachOriginalFile, setAttachOriginalFile] = useState(true);
  const [attachAnalysisReport, setAttachAnalysisReport] = useState(true);
  const [isConfirmingEmailSend, setIsConfirmingEmailSend] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);

  // File inputs:
  // 1) All files (PDF, TXT, CSV, Images) from phone/device
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 2) Direct phone camera capture input
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
        setNeedsAuth(false);
      },
      () => {
        setGoogleUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
    } catch {
      // ignore quota errors
    }
  }, [documents]);

  useEffect(() => {
    try {
      localStorage.setItem(
        EMAIL_RECIPIENTS_STORAGE_KEY,
        JSON.stringify(savedEmails)
      );
    } catch {
      // ignore quota errors
    }
  }, [savedEmails]);

  // Sort saved emails: those that were USED (useCount > 0) ALWAYS on top (by most recent use, then count),
  // followed by addresses that were written/saved but not yet sent to.
  const sortedSavedEmails = useMemo(() => {
    return [...savedEmails].sort((a, b) => {
      const aUsed = a.useCount > 0 ? 1 : 0;
      const bUsed = b.useCount > 0 ? 1 : 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      if (aUsed && bUsed) {
        if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
        return b.useCount - a.useCount;
      }
      return b.createdAt - a.createdAt;
    });
  }, [savedEmails]);

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === selectedId) || documents[0],
    [documents, selectedId]
  );

  const emailTargetDoc = useMemo(
    () =>
      (emailDocId && documents.find((d) => d.id === emailDocId)) || activeDoc,
    [documents, emailDocId, activeDoc]
  );

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setIsEditing(false);
    setEditDraft(null);
    setAnalysisError(null);
  }, [selectedId]);

  // Support Ctrl+V clipboard paste anywhere on page
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (
          items[i].type.startsWith("image/") ||
          items[i].type === "application/pdf"
        ) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileUpload(file, "local");
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesCat =
        categoryFilter === "all" || doc.data.category === categoryFilter;
      if (!matchesCat) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.data.vendor.name.toLowerCase().includes(q) ||
        doc.data.documentNumber.toLowerCase().includes(q) ||
        doc.data.customer.name.toLowerCase().includes(q) ||
        doc.data.lineItems.some((item) =>
          item.description.toLowerCase().includes(q)
        )
      );
    });
  }, [documents, categoryFilter, searchQuery]);

  const financialTotals = useMemo(() => {
    return filteredDocuments.reduce(
      (acc, doc) => {
        acc.subtotal += doc.data.financials.subtotal || 0;
        acc.vat += doc.data.financials.vatAmount || 0;
        acc.total += doc.data.financials.totalAmount || 0;
        return acc;
      },
      { subtotal: 0, vat: 0, total: 0 }
    );
  }, [filteredDocuments]);

  async function runGeminiAnalysis(
    dataUrl: string,
    mimeType: string,
    fileNameHint: string,
    options?: {
      existingId?: string;
      textContent?: string;
      sourceType?: "local" | "drive" | "camera" | "sample";
    }
  ) {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const prepared = await preparePayloadForGemini(
        dataUrl,
        mimeType,
        options?.textContent
      );

      const response = await fetch("/api/analyze-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: prepared.base64,
          mimeType: prepared.mimeType,
          textContent: prepared.textContent,
          fileName: fileNameHint,
          customFocus: customFocus.trim() || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "שגיאה בפענוח המסמך.");
      }

      const extracted: ExtractedDocumentData = payload.result;
      const newTitle = `${extracted.vendor.name || fileNameHint} — ${
        extracted.documentType || "מסמך"
      }${extracted.documentNumber ? ` ${extracted.documentNumber}` : ""}`;

      if (options?.existingId) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === options.existingId
              ? { ...d, title: newTitle, data: extracted }
              : d
          )
        );
      } else {
        const newRecord: DocumentRecord = {
          id: `doc-${Date.now()}`,
          title: newTitle,
          createdAt: new Date().toISOString(),
          imageUrl: dataUrl,
          mimeType: prepared.mimeType,
          textContent: options?.textContent,
          sourceType: options?.sourceType || "local",
          data: extracted,
          qaHistory: [],
        };
        setDocuments((prev) => [newRecord, ...prev]);
        setSelectedId(newRecord.id);
      }
      setActiveView("workspace");
    } catch (err: any) {
      setAnalysisError(
        err?.message || "אירעה שגיאה בעת פענוח הקובץ. נסה שנית."
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleFileUpload(
    file: File,
    sourceType: "local" | "camera" = "local"
  ) {
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const isTextLike =
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      /\.(txt|csv|md|json|html)$/i.test(file.name);

    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImage =
      file.type.startsWith("image/") ||
      /\.(jpg|jpeg|png|webp|gif|bmp|heic)$/i.test(file.name);

    if (!isImage && !isPdf && !isTextLike) {
      setAnalysisError(
        "ניתן להעלות קובצי PDF, תמונות (JPG, PNG, WEBP) או קובצי טקסט ונתונים (TXT, CSV, MD)."
      );
      return;
    }

    if (isTextLike) {
      const textReader = new FileReader();
      textReader.onload = () => {
        const textContent = textReader.result as string;
        const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(
          textContent
        )}`;
        runGeminiAnalysis(dataUrl, file.type || "text/plain", cleanName, {
          textContent,
          sourceType,
        });
      };
      textReader.readAsText(file, "utf-8");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const resolvedMime = isPdf
        ? "application/pdf"
        : file.type || "image/jpeg";
      runGeminiAnalysis(dataUrl, resolvedMime, cleanName, { sourceType });
    };
    reader.readAsDataURL(file);
  }

  // Google Drive Modal Handlers
  async function fetchDriveFilesList(
    query = driveSearch,
    filter = driveFilter
  ) {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsLoadingDrive(true);
    setDriveError(null);
    try {
      const files = await listDriveFiles(query, filter);
      setDriveFiles(files);
    } catch (err: any) {
      setDriveError(err?.message || "שגיאה בטעינת קבצים מ-Google Drive.");
      const currentToken = await getAccessToken();
      if (!currentToken) setNeedsAuth(true);
    } finally {
      setIsLoadingDrive(false);
    }
  }

  async function handleGoogleLogin() {
    setIsLoggingIn(true);
    setDriveError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setNeedsAuth(false);
        await fetchDriveFilesList(driveSearch, driveFilter);
      }
    } catch (err: any) {
      setDriveError(
        err?.message || "ההתחברות לחשבון Google נכשלה. נסה שנית."
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleGoogleLogout() {
    await logout();
    setGoogleUser(null);
    setNeedsAuth(true);
    setDriveFiles([]);
  }

  async function openDriveModal() {
    setIsDriveModalOpen(true);
    setDriveError(null);
    const token = await getAccessToken();
    if (token) {
      setNeedsAuth(false);
      await fetchDriveFilesList(driveSearch, driveFilter);
    } else {
      setNeedsAuth(true);
    }
  }

  async function handleSelectDriveFile(file: DriveFileItem) {
    setImportingFileId(file.id);
    setDriveError(null);
    try {
      const downloaded = await downloadDriveFileAsDataUrl(file);
      setIsDriveModalOpen(false);
      await runGeminiAnalysis(
        downloaded.dataUrl,
        downloaded.mimeType,
        file.name,
        {
          textContent: downloaded.textContent,
          sourceType: "drive",
        }
      );
    } catch (err: any) {
      setDriveError(
        err?.message || "שגיאה בייבוא הקובץ מ-Google Drive."
      );
    } finally {
      setImportingFileId(null);
    }
  }

  async function handleAskQuestion(questionText?: string) {
    const q = (questionText ?? questionInput).trim();
    if (!q || !activeDoc || isAsking) return;

    setIsAsking(true);
    setAnalysisError(null);
    if (!questionText) setQuestionInput("");

    try {
      const prepared = await preparePayloadForGemini(
        activeDoc.imageUrl,
        activeDoc.mimeType,
        activeDoc.textContent
      );

      const response = await fetch("/api/ask-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: prepared.base64,
          mimeType: prepared.mimeType,
          textContent: prepared.textContent,
          question: q,
          currentExtraction: activeDoc.data,
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "שגיאה בביצוע השאילתה.");
      }

      const timeStr = new Date().toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      });

      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === activeDoc.id
            ? {
                ...doc,
                qaHistory: [
                  ...(doc.qaHistory || []),
                  { question: q, answer: payload.answer, timestamp: timeStr },
                ],
              }
            : doc
        )
      );
    } catch (err: any) {
      setAnalysisError(err?.message || "שגיאה בקבלת תשובה על המסמך.");
    } finally {
      setIsAsking(false);
    }
  }

  function startEditing() {
    if (!activeDoc) return;
    setEditDraft(JSON.parse(JSON.stringify(activeDoc.data)));
    setIsEditing(true);
  }

  function saveEditing() {
    if (!activeDoc || !editDraft) return;
    const updatedTitle = `${editDraft.vendor.name || "מסמך"} — ${
      editDraft.documentType
    }${editDraft.documentNumber ? ` ${editDraft.documentNumber}` : ""}`;
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === activeDoc.id
          ? { ...doc, title: updatedTitle, data: editDraft }
          : doc
      )
    );
    setIsEditing(false);
    setEditDraft(null);
  }

  function deleteDocument(id: string) {
    if (documents.length <= 1) return;
    const remaining = documents.filter((d) => d.id !== id);
    setDocuments(remaining);
    if (selectedId === id) {
      setSelectedId(remaining[0].id);
    }
  }

  function handleCopyMarkdown() {
    if (!activeDoc) return;
    const md = formatDocumentToMarkdown(activeDoc.data, {
      qaHistory: activeDoc.qaHistory,
    });
    navigator.clipboard.writeText(md);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  }

  function isValidEmailAddress(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function upsertSavedEmails(
    addresses: string[],
    options?: { label?: string; markUsed?: boolean }
  ) {
    const now = Date.now();
    const validAddresses = addresses
      .map((a) => a.trim().toLowerCase())
      .filter(isValidEmailAddress);
    if (validAddresses.length === 0) return;

    setSavedEmails((prev) => {
      const map = new Map<string, SavedEmailRecipient>();
      for (const item of prev) {
        map.set(item.email.toLowerCase(), { ...item });
      }
      for (const addr of validAddresses) {
        const existing = map.get(addr);
        if (existing) {
          map.set(addr, {
            ...existing,
            label: options?.label?.trim() || existing.label,
            useCount: options?.markUsed
              ? (existing.useCount || 0) + 1
              : existing.useCount || 0,
            lastUsedAt: options?.markUsed ? now : existing.lastUsedAt || 0,
          });
        } else {
          map.set(addr, {
            email: addr,
            label: options?.label?.trim() || undefined,
            useCount: options?.markUsed ? 1 : 0,
            lastUsedAt: options?.markUsed ? now : 0,
            createdAt: now,
          });
        }
      }
      return Array.from(map.values());
    });
  }

  function openEmailModal(targetDoc?: DocumentRecord) {
    const doc = targetDoc || activeDoc;
    if (!doc) return;
    setEmailDocId(doc.id);
    const defaultSubject = `דוח פענוח מסמך: ${
      doc.data.vendor.name || doc.title
    }${doc.data.documentNumber ? ` (#${doc.data.documentNumber})` : ""}`;
    setEmailSubject(defaultSubject);
    setEmailPersonalNote("");
    setEmailInput("");
    setEmailLabelInput("");
    setAttachOriginalFile(true);
    setAttachAnalysisReport(true);
    setIsConfirmingEmailSend(false);
    setEmailError(null);
    setEmailSuccessMsg(null);

    // Pre-select the top most-recently-used address if none selected yet
    if (sortedSavedEmails.length > 0 && sortedSavedEmails[0].useCount > 0) {
      setSelectedRecipients([sortedSavedEmails[0].email]);
    } else {
      setSelectedRecipients([]);
    }

    getAccessToken().then((token) => {
      setNeedsAuth(!token);
    });
    setIsEmailModalOpen(true);
  }

  function handleAddEmailFromInput() {
    const parts = emailInput
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (parts.length === 0) return;

    const invalid = parts.filter((p) => !isValidEmailAddress(p));
    if (invalid.length > 0) {
      setEmailError(`כתובת המייל אינה תקינה: ${invalid.join(", ")}`);
      return;
    }

    setEmailError(null);
    // Remember immediately in savedEmails so any address the user writes is saved for next time
    upsertSavedEmails(parts, {
      label: parts.length === 1 ? emailLabelInput : undefined,
      markUsed: false,
    });

    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      parts.forEach((p) => next.add(p));
      return Array.from(next);
    });
    setEmailInput("");
    setEmailLabelInput("");
  }

  function toggleRecipientEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    setSelectedRecipients((prev) =>
      prev.includes(normalized)
        ? prev.filter((e) => e !== normalized)
        : [...prev, normalized]
    );
    setIsConfirmingEmailSend(false);
  }

  function removeSavedEmailAddress(email: string) {
    const normalized = email.trim().toLowerCase();
    setSavedEmails((prev) =>
      prev.filter((item) => item.email.toLowerCase() !== normalized)
    );
    setSelectedRecipients((prev) => prev.filter((e) => e !== normalized));
  }

  function resolveFinalRecipients(): string[] | null {
    const pendingParts = emailInput
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (pendingParts.length > 0) {
      const invalid = pendingParts.filter((p) => !isValidEmailAddress(p));
      if (invalid.length > 0) {
        setEmailError(`כתובת המייל אינה תקינה: ${invalid.join(", ")}`);
        return null;
      }
      upsertSavedEmails(pendingParts, {
        label: pendingParts.length === 1 ? emailLabelInput : undefined,
        markUsed: false,
      });
    }

    const combined = Array.from(
      new Set([...selectedRecipients, ...pendingParts])
    );
    if (combined.length === 0) {
      setEmailError("נא לבחור או להקליד לפחות כתובת מייל אחת למשלוח.");
      return null;
    }

    setSelectedRecipients(combined);
    if (pendingParts.length > 0) {
      setEmailInput("");
      setEmailLabelInput("");
    }
    return combined;
  }

  async function buildDocumentAttachments(
    doc: DocumentRecord
  ): Promise<EmailAttachmentPayload[]> {
    const attachments: EmailAttachmentPayload[] = [];
    const safeBaseName = (doc.data.vendor.name || doc.title || "document")
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 60);

    if (attachOriginalFile) {
      if (doc.textContent) {
        const ext = doc.mimeType === "text/csv" ? "csv" : "txt";
        attachments.push({
          fileName: `${safeBaseName}-מקור.${ext}`,
          mimeType: doc.mimeType || "text/plain",
          base64Data: utf8ToBase64(doc.textContent),
        });
      } else {
        const prepared = await preparePayloadForGemini(
          doc.imageUrl,
          doc.mimeType,
          doc.textContent
        );
        if (prepared.base64) {
          const ext =
            prepared.mimeType === "application/pdf"
              ? "pdf"
              : prepared.mimeType === "image/png"
              ? "png"
              : prepared.mimeType === "image/webp"
              ? "webp"
              : "jpg";
          attachments.push({
            fileName: `${safeBaseName}-מקור.${ext}`,
            mimeType: prepared.mimeType,
            base64Data: prepared.base64,
          });
        }
      }
    }

    if (attachAnalysisReport) {
      const mdReport = formatDocumentToMarkdown(doc.data, {
        personalNote: emailPersonalNote,
        qaHistory: doc.qaHistory,
      });
      attachments.push({
        fileName: `${safeBaseName}-דוח-ניתוח.md`,
        mimeType: "text/markdown",
        base64Data: utf8ToBase64(mdReport),
      });
    }

    return attachments;
  }

  function handleRequestEmailConfirmation() {
    setEmailError(null);
    setEmailSuccessMsg(null);
    const recipients = resolveFinalRecipients();
    if (!recipients) return;
    if (!emailSubject.trim()) {
      setEmailError("נא להזין נושא להודעת המייל.");
      return;
    }
    setIsConfirmingEmailSend(true);
  }

  async function handleConfirmAndSendEmail() {
    if (!emailTargetDoc) return;
    const recipients = resolveFinalRecipients();
    if (!recipients) return;

    setIsSendingEmail(true);
    setEmailError(null);
    setEmailSuccessMsg(null);

    try {
      const attachments = await buildDocumentAttachments(emailTargetDoc);
      const attachedNames = attachments.map((a) => a.fileName);

      const plainTextBody = formatDocumentToMarkdown(emailTargetDoc.data, {
        personalNote: emailPersonalNote,
        qaHistory: emailTargetDoc.qaHistory,
      });
      const htmlBody = formatDocumentToEmailHtml(emailTargetDoc.data, {
        title: emailTargetDoc.title,
        personalNote: emailPersonalNote,
        qaHistory: emailTargetDoc.qaHistory,
        attachedFileNames: attachedNames,
      });

      await sendEmailViaGmail({
        to: recipients,
        subject: emailSubject.trim(),
        plainTextBody,
        htmlBody,
        attachments,
      });

      // Mark these addresses as USED so they appear at the top next time!
      upsertSavedEmails(recipients, { markUsed: true });

      setIsConfirmingEmailSend(false);
      setEmailSuccessMsg(
        `המייל נשלח בהצלחה אל ${recipients.join(", ")}${
          attachedNames.length > 0
            ? ` יחד עם ${attachedNames.length} קבצים מצורפים`
            : ""
        }!`
      );
    } catch (err: any) {
      setEmailError(err?.message || "שגיאה בשליחת המייל. נסה שנית.");
      const token = await getAccessToken();
      if (!token) setNeedsAuth(true);
      setIsConfirmingEmailSend(false);
    } finally {
      setIsSendingEmail(false);
    }
  }

  function handleSendViaMailtoClient() {
    if (!emailTargetDoc) return;
    const recipients = resolveFinalRecipients();
    if (!recipients) return;

    // Remember and mark as used so it appears on top next time
    upsertSavedEmails(recipients, { markUsed: true });

    const bodyText = formatDocumentToMarkdown(emailTargetDoc.data, {
      personalNote: emailPersonalNote,
      qaHistory: emailTargetDoc.qaHistory,
    });
    const mailtoUrl = `mailto:${encodeURIComponent(
      recipients.join(",")
    )}?subject=${encodeURIComponent(
      emailSubject.trim()
    )}&body=${encodeURIComponent(bodyText)}`;
    window.location.href = mailtoUrl;
    setEmailSuccessMsg(
      "נפתחה תוכנת המייל במכשיר והכתובות נשמרו לראש הרשימה לפעמים הבאות."
    );
  }

  function exportAllToCsv() {
    const headers = [
      "סוג מסמך",
      "מספר מסמך",
      "תאריך",
      "שם הספק",
      "עוסק מורשה / ח.פ",
      "טלפון ספק",
      "כתובת ספק",
      "שם לקוח",
      "פירוט פריטים",
      'לפני מע"מ',
      'מע"מ',
      'סה"כ לתשלום',
      "מטבע",
      "אמצעי תשלום",
    ];

    const rows = documents.map((d) => {
      const x = d.data;
      const itemsSummary = x.lineItems
        .map((i) => `${i.description} (${i.quantity})`)
        .join(" ; ");
      return [
        x.documentType,
        x.documentNumber,
        x.date,
        x.vendor.name,
        x.vendor.taxId,
        [x.vendor.phone, x.vendor.mobile].filter(Boolean).join(" / "),
        x.vendor.address,
        x.customer.name,
        itemsSummary,
        x.financials.subtotal.toFixed(2),
        x.financials.vatAmount.toFixed(2),
        x.financials.totalAmount.toFixed(2),
        x.financials.currency,
        x.financials.paymentMethod,
      ].map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`);
    });

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `פענוח-מסמכים-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openCamera() {
    setAnalysisError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      // Fallback to native phone camera input if WebRTC stream is blocked
      mobileCameraInputRef.current?.click();
    }
  }

  function closeCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  }

  function captureCameraPhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    closeCamera();
    runGeminiAnalysis(dataUrl, "image/jpeg", "צילום מצלמה", {
      sourceType: "camera",
    });
  }

  const currentData = isEditing && editDraft ? editDraft : activeDoc?.data;

  const isActiveDocPdf = activeDoc?.mimeType === "application/pdf";
  const isActiveDocText =
    Boolean(activeDoc?.textContent) ||
    activeDoc?.mimeType.startsWith("text/") ||
    activeDoc?.mimeType === "application/json";

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]"
    >
      {/* Hidden File Input: Supports PDF, Text/CSV, and Images from Phone/Desktop */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*,text/plain,text/csv,text/markdown,application/json,.pdf,.txt,.csv,.md,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file, "local");
          e.target.value = "";
        }}
      />

      {/* Hidden Native Phone Camera Input */}
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file, "camera");
          e.target.value = "";
        }}
      />

      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView("workspace");
          }}
          className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          DocuLens IL
        </a>

        {/* Zone 2: 5 clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveView("workspace")}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeView === "workspace"
                ? "text-slate-900 border-b-2 border-slate-900 font-semibold"
                : ""
            }`}
          >
            סביבת פענוח
          </button>
          <button
            onClick={openDriveModal}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Google Drive
          </button>
          <button
            onClick={() => setActiveView("markdown")}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeView === "markdown"
                ? "text-slate-900 border-b-2 border-slate-900 font-semibold"
                : ""
            }`}
          >
            דוח מובנה להעתקה
          </button>
          <button
            onClick={() => setActiveView("ledger")}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 cursor-pointer ${
              activeView === "ledger"
                ? "text-slate-900 border-b-2 border-slate-900 font-semibold"
                : ""
            }`}
          >
            יומן מסמכים ({documents.length})
          </button>
          <button
            onClick={exportAllToCsv}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            ייצוא לאקסל
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isAnalyzing ? "מפענח קובץ..." : "העלאת קובץ / מסמך"}
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1440px] w-full mx-auto">
        {/* Right Sidebar (RTL): Document Queue & Multi-Source Upload */}
        <aside className="w-full lg:w-[340px] shrink-0 bg-white border-b lg:border-b-0 lg:border-l border-slate-200 flex flex-col">
          {/* Upload Dropzone & Multi-Source Triggers */}
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file, "local");
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isDraggingOver
                  ? "border-blue-600 bg-blue-50/60"
                  : "border-slate-300 hover:border-slate-400 bg-slate-50/60"
              }`}
            >
              <Upload className="w-5 h-5 text-slate-600 mx-auto mb-1.5" />
              <p className="text-sm font-semibold text-slate-900">
                העלאת קובץ מהטלפון או מהמחשב
              </p>
              <p className="text-xs text-slate-500 mt-1">
                PDF · קובצי טקסט ו-CSV · תמונות קבלות ומסמכים
              </p>
            </div>

            {/* Dedicated Source Buttons: Google Drive, Phone Files, Camera */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openDriveModal}
                disabled={isAnalyzing}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>ייבוא מ-Google Drive</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Smartphone className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                <span>קבצים מהטלפון</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openCamera}
                disabled={isAnalyzing}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span>צילום מסמך</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeDoc) {
                    runGeminiAnalysis(
                      activeDoc.imageUrl,
                      activeDoc.mimeType,
                      activeDoc.title,
                      {
                        existingId: activeDoc.id,
                        textContent: activeDoc.textContent,
                        sourceType: activeDoc.sourceType,
                      }
                    );
                  }
                }}
                disabled={isAnalyzing || !activeDoc}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isAnalyzing ? "animate-spin" : ""
                  }`}
                />
                <span>פענח מחדש (AI)</span>
              </button>
            </div>

            <input
              type="text"
              value={customFocus}
              onChange={(e) => setCustomFocus(e.target.value)}
              placeholder="דגש מיוחד לפענוח (למשל: בדוק סעיפי חוזה / מע״מ)..."
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Search & Interactive Segmented Filter */}
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש לפי ספק, מספר מסמך או פריט..."
                className="w-full pr-9 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setCategoryFilter("all")}
                className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === "all"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                הכל
              </button>
              <button
                onClick={() => setCategoryFilter("invoice")}
                className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === "invoice"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                חשבוניות
              </button>
              <button
                onClick={() => setCategoryFilter("note")}
                className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === "note"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                מסמכים ופתקים
              </button>
            </div>
          </div>

          {/* Document List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredDocuments.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">
                  לא נמצאו מסמכים התואמים לחיפוש.
                </p>
              </div>
            ) : (
              filteredDocuments.map((doc) => {
                const isSelected = doc.id === activeDoc?.id;
                const formatLabel =
                  doc.mimeType === "application/pdf"
                    ? "PDF"
                    : doc.textContent || doc.mimeType.startsWith("text/")
                    ? "טקסט / נתונים"
                    : doc.sourceType === "drive"
                    ? "Drive"
                    : "";

                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setSelectedId(doc.id);
                    }}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-slate-100/90"
                        : "hover:bg-slate-50 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                        {doc.data.vendor.name || doc.title}
                      </h3>
                      <span className="text-sm font-semibold text-slate-900 font-mono-tabular tabular-nums whitespace-nowrap shrink-0">
                        {doc.data.financials.totalAmount > 0
                          ? `${doc.data.financials.totalAmount.toFixed(2)} ₪`
                          : "—"}
                      </span>
                    </div>

                    {/* Clean Unboxed Metadata with · separators */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-slate-500">
                      <span>{doc.data.documentType}</span>
                      {formatLabel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatLabel}</span>
                        </>
                      )}
                      {doc.data.documentNumber && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular tabular-nums">
                            #{doc.data.documentNumber}
                          </span>
                        </>
                      )}
                      {doc.data.date && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular tabular-nums">
                            {doc.data.date.split(" ")[0]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Cumulative Summary Footer in Sidebar */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>סה"כ לפני מע"מ ({filteredDocuments.length} מסמכים):</span>
              <span className="font-mono-tabular tabular-nums font-medium text-slate-900">
                {financialTotals.subtotal.toFixed(2)} ש"ח
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>סה"כ מע"מ מצטבר:</span>
              <span className="font-mono-tabular tabular-nums font-medium text-slate-900">
                {financialTotals.vat.toFixed(2)} ש"ח
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 font-semibold text-slate-900 text-sm">
              <span>סה"כ כולל מע"מ:</span>
              <span className="font-mono-tabular tabular-nums">
                {financialTotals.total.toFixed(2)} ש"ח
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          {/* Error Banner if any */}
          {analysisError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-4 text-sm text-red-800">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{analysisError}</span>
              </div>
              <button
                onClick={() => setAnalysisError(null)}
                className="text-xs font-medium underline hover:text-red-950 whitespace-nowrap shrink-0 cursor-pointer"
              >
                סגור הודעה
              </button>
            </div>
          )}

          {/* Loading Skeleton Overlay during AI analysis */}
          {isAnalyzing && (
            <div className="mb-6 p-5 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-blue-950">
                  מפענח את הקובץ ומחלץ שדות בעברית...
                </p>
                <p className="text-xs text-blue-700">
                  מנתח קובץ (PDF / מסמך / תמונה), מזהה פרטי ספק, פריטים, מע"מ
                  ונקודות עיקריות
                </p>
              </div>
              <RefreshCw className="w-5 h-5 text-blue-700 animate-spin shrink-0" />
            </div>
          )}

          {/* Mobile View Switcher */}
          <div className="flex md:hidden items-center gap-1 p-1 mb-6 bg-slate-200/70 rounded-lg">
            <button
              onClick={() => setActiveView("workspace")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeView === "workspace"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600"
              }`}
            >
              סביבת פענוח
            </button>
            <button
              onClick={openDriveModal}
              className="flex-1 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 text-slate-600"
            >
              Drive
            </button>
            <button
              onClick={() => setActiveView("markdown")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeView === "markdown"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600"
              }`}
            >
              דוח מובנה
            </button>
            <button
              onClick={() => setActiveView("ledger")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeView === "ledger"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600"
              }`}
            >
              יומן
            </button>
          </div>

          {activeView === "workspace" && activeDoc && currentData && (
            <div className="space-y-8">
              {/* Top Document Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  {/* Quiet Unboxed Kicker Metadata */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                    <span className="font-medium text-slate-700">
                      {currentData.documentType}
                    </span>
                    {currentData.documentNumber && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular tabular-nums">
                          מספר {currentData.documentNumber}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular tabular-nums">
                      תאריך: {currentData.date || "לא צוין"}
                    </span>
                    {currentData.vendor.taxId && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular tabular-nums">
                          ע"מ / ח.פ: {currentData.vendor.taxId}
                        </span>
                      </>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 font-display">
                    {currentData.vendor.name || activeDoc.title}
                  </h1>
                </div>

                {/* Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {!isEditing ? (
                    <button
                      onClick={startEditing}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>עריכת שדות</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={saveEditing}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>שמור שינויים</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setEditDraft(null);
                        }}
                        className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        ביטול
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => openEmailModal(activeDoc)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>שליחת קובץ וניתוח במייל</span>
                  </button>

                  <button
                    onClick={handleCopyMarkdown}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedReport ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold">
                          הועתק ללוח
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>העתק סיכום בעברית</span>
                      </>
                    )}
                  </button>

                  {documents.length > 1 && (
                    <button
                      onClick={() => deleteDocument(activeDoc.id)}
                      title="מחק מסמך"
                      className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* 2-Column Split: Extracted Structured Data (Right in RTL) & Visual Document Inspector (Left in RTL) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                {/* Structured Extraction Column (7 cols) */}
                <div className="xl:col-span-7 space-y-6">
                  {/* Section 1: פרטי המסמך והספק */}
                  <section className="bg-white border border-slate-200 rounded-lg p-6">
                    <h2 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
                      01. פרטי המסמך ובית העסק (הספק)
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
                      <div>
                        <span className="block text-xs text-slate-500 mb-1">
                          סוג המסמך
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.documentType}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                documentType: e.target.value,
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900">
                            {currentData.documentType || "—"}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="block text-xs text-slate-500 mb-1">
                          מספר חשבונית / אסמכתא
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.documentNumber}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                documentNumber: e.target.value,
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm font-mono-tabular"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900 font-mono-tabular tabular-nums">
                            {currentData.documentNumber || "—"}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="block text-xs text-slate-500 mb-1">
                          תאריך המסמך
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.date}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                date: e.target.value,
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm font-mono-tabular"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900 font-mono-tabular tabular-nums">
                            {currentData.date || "—"}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="block text-xs text-slate-500 mb-1">
                          עוסק מורשה (ע"מ) / ח.פ
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.vendor.taxId}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                vendor: {
                                  ...editDraft.vendor,
                                  taxId: e.target.value,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm font-mono-tabular"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900 font-mono-tabular tabular-nums">
                            {currentData.vendor.taxId || "—"}
                          </span>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <span className="block text-xs text-slate-500 mb-1">
                          שם העסק / הספק
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.vendor.name}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                vendor: {
                                  ...editDraft.vendor,
                                  name: e.target.value,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900">
                            {currentData.vendor.name || "—"}
                          </span>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <span className="block text-xs text-slate-500 mb-1">
                          תחום עיסוק
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.vendor.businessField}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                vendor: {
                                  ...editDraft.vendor,
                                  businessField: e.target.value,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm"
                          />
                        ) : (
                          <span className="text-slate-800">
                            {currentData.vendor.businessField || "—"}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="block text-xs text-slate-500 mb-1">
                          כתובת הספק
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.vendor.address}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                vendor: {
                                  ...editDraft.vendor,
                                  address: e.target.value,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm"
                          />
                        ) : (
                          <span className="text-slate-800">
                            {currentData.vendor.address || "—"}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="block text-xs text-slate-500 mb-1">
                          טלפונים ליצירת קשר
                        </span>
                        {isEditing && editDraft ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="טלפון"
                              value={editDraft.vendor.phone}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  vendor: {
                                    ...editDraft.vendor,
                                    phone: e.target.value,
                                  },
                                })
                              }
                              className="w-1/2 px-2 py-1 border border-slate-300 rounded text-xs font-mono-tabular"
                            />
                            <input
                              type="text"
                              placeholder="נייד"
                              value={editDraft.vendor.mobile}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  vendor: {
                                    ...editDraft.vendor,
                                    mobile: e.target.value,
                                  },
                                })
                              }
                              className="w-1/2 px-2 py-1 border border-slate-300 rounded text-xs font-mono-tabular"
                            />
                          </div>
                        ) : (
                          <span className="font-mono-tabular tabular-nums text-slate-800">
                            {[
                              currentData.vendor.phone,
                              currentData.vendor.mobile
                                ? `נייד: ${currentData.vendor.mobile}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </span>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Section 2: פרטי הלקוח */}
                  <section className="bg-white border border-slate-200 rounded-lg p-6">
                    <h2 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
                      02. פרטי הלקוח (לכבוד)
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="block text-xs text-slate-500 mb-1">
                          לכבוד
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.customer.name}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                customer: {
                                  ...editDraft.customer,
                                  name: e.target.value,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900">
                            {currentData.customer.name || "—"}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="block text-xs text-slate-500 mb-1">
                          כתובת הלקוח
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="text"
                            value={editDraft.customer.address}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                customer: {
                                  ...editDraft.customer,
                                  address: e.target.value,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1 border border-slate-300 rounded text-sm"
                          />
                        ) : (
                          <span className="text-slate-800">
                            {currentData.customer.address || "—"}
                          </span>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Section 3: פירוט השירות / פריטים */}
                  <section className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                      <h2 className="text-base font-bold text-slate-900">
                        03. פירוט השירות / פריטים
                      </h2>
                      {isEditing && editDraft && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextItems: DocumentLineItem[] = [
                              ...editDraft.lineItems,
                              {
                                description: "פריט חדש",
                                quantity: "1 יח'",
                                unitPrice: 0,
                                total: 0,
                              },
                            ];
                            setEditDraft({
                              ...editDraft,
                              lineItems: nextItems,
                            });
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>הוסף שורה</span>
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500">
                            <th className="py-2.5 pr-2 text-right font-medium">
                              תיאור הפריט / השירות
                            </th>
                            <th className="py-2.5 px-3 text-right font-medium w-28">
                              כמות
                            </th>
                            <th className="py-2.5 pl-2 text-left font-medium w-32">
                              סכום ({currentData.financials.currency || 'ש"ח'})
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {currentData.lineItems.map((item, idx) => (
                            <tr
                              key={idx}
                              className="hover:bg-slate-50/80 transition-colors"
                            >
                              <td className="py-3 pr-2 text-slate-900 font-medium">
                                {isEditing && editDraft ? (
                                  <input
                                    type="text"
                                    value={item.description}
                                    onChange={(e) => {
                                      const copy = [...editDraft.lineItems];
                                      copy[idx] = {
                                        ...copy[idx],
                                        description: e.target.value,
                                      };
                                      setEditDraft({
                                        ...editDraft,
                                        lineItems: copy,
                                      });
                                    }}
                                    className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                  />
                                ) : (
                                  item.description
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-700 font-mono-tabular tabular-nums">
                                {isEditing && editDraft ? (
                                  <input
                                    type="text"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const copy = [...editDraft.lineItems];
                                      copy[idx] = {
                                        ...copy[idx],
                                        quantity: e.target.value,
                                      };
                                      setEditDraft({
                                        ...editDraft,
                                        lineItems: copy,
                                      });
                                    }}
                                    className="w-full px-2 py-1 border border-slate-300 rounded text-sm font-mono-tabular"
                                  />
                                ) : (
                                  item.quantity
                                )}
                              </td>
                              <td className="py-3 pl-2 text-left font-mono-tabular tabular-nums font-semibold text-slate-900">
                                {isEditing && editDraft ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={item.total}
                                    onChange={(e) => {
                                      const copy = [...editDraft.lineItems];
                                      copy[idx] = {
                                        ...copy[idx],
                                        total: parseFloat(e.target.value) || 0,
                                      };
                                      setEditDraft({
                                        ...editDraft,
                                        lineItems: copy,
                                      });
                                    }}
                                    className="w-full px-2 py-1 border border-slate-300 rounded text-sm font-mono-tabular text-left"
                                  />
                                ) : item.total > 0 ? (
                                  `${item.total.toFixed(2)} ${
                                    currentData.financials.currency
                                  }`
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Section 4: סיכום כספי */}
                  <section className="bg-white border border-slate-200 rounded-lg p-6">
                    <h2 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
                      04. סיכום כספי
                    </h2>

                    <div className="space-y-2.5 text-sm">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>סה"כ לפני מע"מ:</span>
                        {isEditing && editDraft ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editDraft.financials.subtotal}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                financials: {
                                  ...editDraft.financials,
                                  subtotal: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="w-32 px-2 py-1 border border-slate-300 rounded text-left font-mono-tabular"
                          />
                        ) : (
                          <span className="font-mono-tabular tabular-nums font-medium text-slate-900">
                            {currentData.financials.subtotal.toFixed(2)}{" "}
                            {currentData.financials.currency}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>
                          מע"מ ({currentData.financials.vatRate || 18}%):
                        </span>
                        {isEditing && editDraft ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editDraft.financials.vatAmount}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                financials: {
                                  ...editDraft.financials,
                                  vatAmount: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="w-32 px-2 py-1 border border-slate-300 rounded text-left font-mono-tabular"
                          />
                        ) : (
                          <span className="font-mono-tabular tabular-nums font-medium text-slate-900">
                            {currentData.financials.vatAmount.toFixed(2)}{" "}
                            {currentData.financials.currency}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-base font-bold text-slate-900">
                        <span>סה"כ לתשלום כולל מע"מ:</span>
                        {isEditing && editDraft ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editDraft.financials.totalAmount}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                financials: {
                                  ...editDraft.financials,
                                  totalAmount: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="w-36 px-2 py-1 border border-slate-300 rounded text-left font-mono-tabular"
                          />
                        ) : (
                          <span className="font-mono-tabular tabular-nums text-lg text-blue-800">
                            {currentData.financials.totalAmount.toFixed(2)}{" "}
                            {currentData.financials.currency}
                          </span>
                        )}
                      </div>

                      {(currentData.financials.amountInWords || isEditing) && (
                        <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                          <span>סכום במילים:</span>
                          {isEditing && editDraft ? (
                            <input
                              type="text"
                              value={editDraft.financials.amountInWords}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  financials: {
                                    ...editDraft.financials,
                                    amountInWords: e.target.value,
                                  },
                                })
                              }
                              className="w-64 px-2 py-1 border border-slate-300 rounded text-xs"
                            />
                          ) : (
                            <span className="font-medium text-slate-700">
                              {currentData.financials.amountInWords}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Section 5: נקודות עיקריות והערות נוספות */}
                  <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                    <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                      05. עיקרי הדברים והערות נוספות
                    </h2>

                    {currentData.keyPoints.length > 0 && (
                      <ul className="space-y-2 text-sm text-slate-700 list-disc pr-4">
                        {currentData.keyPoints.map((pt, i) => (
                          <li key={i} className="leading-relaxed">
                            {pt}
                          </li>
                        ))}
                      </ul>
                    )}

                    {currentData.notesAndFlags.length > 0 && (
                      <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                        <span className="font-semibold text-slate-700 block">
                          דגשים והערות זיהוי:
                        </span>
                        {currentData.notesAndFlags.map((note, idx) => (
                          <p key={idx}>{note}</p>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Section 6: בירור אינטראקטיבי על המסמך */}
                  <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h2 className="text-base font-bold text-slate-900">
                        06. בדיקה ובירור נוסף במסמך
                      </h2>
                      <span className="text-xs text-slate-500">
                        שאל כל שאלה ספציפית על המסמך, ה-PDF או כתב היד
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {[
                        'האם חישוב המע"מ והסכום הכולל מדויקים?',
                        "אילו מילים בכתב היד אינן חד-משמעיות?",
                        "נסח הודעת סיכום קצרה לוואטסאפ של ועד הבית",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleAskQuestion(suggestion)}
                          disabled={isAsking}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>

                    {activeDoc.qaHistory && activeDoc.qaHistory.length > 0 && (
                      <div className="space-y-3 pt-2">
                        {activeDoc.qaHistory.map((item, i) => (
                          <div
                            key={i}
                            className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span className="font-semibold text-slate-800">
                                שאלה: {item.question}
                              </span>
                              <span className="font-mono-tabular tabular-nums">
                                {item.timestamp}
                              </span>
                            </div>
                            <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                              {item.answer}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAskQuestion();
                      }}
                      className="flex items-center gap-2 pt-1"
                    >
                      <input
                        type="text"
                        value={questionInput}
                        onChange={(e) => setQuestionInput(e.target.value)}
                        placeholder="למשל: מה מספר הטלפון הנייד של הספק? האם קיימת חתימה?"
                        className="flex-1 px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                      />
                      <button
                        type="submit"
                        disabled={isAsking || !questionInput.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isAsking ? "בודק..." : "שאל"}</span>
                      </button>
                    </form>
                  </section>
                </div>

                {/* Multi-Format Visual Document Inspector Column (5 cols, sticky on desktop) */}
                <div className="xl:col-span-5 xl:sticky xl:top-24 bg-white border border-slate-200 rounded-lg overflow-hidden">
                  {/* Inspector Toolbar */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-700">
                      {isActiveDocPdf
                        ? "תצוגת מסמך PDF"
                        : isActiveDocText
                        ? "תוכן קובץ המקור"
                        : "תמונת המקור"}
                    </span>

                    {!isActiveDocPdf && !isActiveDocText && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))
                          }
                          title="הקטן תצוגה"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded cursor-pointer"
                        >
                          <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono-tabular tabular-nums text-slate-600 px-1">
                          {Math.round(zoom * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))
                          }
                          title="הגדל תצוגה"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded cursor-pointer"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRotation((r) => (r + 90) % 360)}
                          title="סובב 90 מעלות"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded cursor-pointer"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setHighContrastInk((v) => !v)}
                          title="חידוד ניגודיות כתב יד"
                          className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            highContrastInk
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:bg-slate-200/70"
                          }`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>חידוד דיו</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Preview Canvas: PDF, Text/CSV, or Image */}
                  {isActiveDocPdf ? (
                    <div className="bg-slate-100 h-[640px] flex flex-col">
                      <iframe
                        src={activeDoc.imageUrl}
                        title={activeDoc.title}
                        className="w-full flex-1 border-0"
                      />
                    </div>
                  ) : isActiveDocText ? (
                    <div className="p-5 bg-slate-50 max-h-[640px] overflow-auto">
                      <pre className="text-xs font-mono-tabular text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {activeDoc.textContent || "קובץ טקסט"}
                      </pre>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-100/80 overflow-auto max-h-[680px] flex items-center justify-center">
                      <img
                        src={activeDoc.imageUrl}
                        alt={activeDoc.title}
                        referrerPolicy="no-referrer"
                        style={{
                          transform: `scale(${zoom}) rotate(${rotation}deg)`,
                          filter: highContrastInk
                            ? "contrast(1.45) brightness(0.97) saturate(1.2)"
                            : "none",
                        }}
                        className="max-w-full h-auto rounded shadow-xs transition-transform duration-150 origin-center"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* View 2: Clean Formatted Hebrew Markdown Output */}
          {activeView === "markdown" && activeDoc && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 font-display">
                    תצוגת דוח מובנה בעברית
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    פורמט נקי, מסודר ומוכן להעתקה או לשליחה ישירה במייל עם קובץ
                    המקור
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEmailModal(activeDoc)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>שלח קובץ וניתוח במייל</span>
                  </button>
                  <button
                    onClick={handleCopyMarkdown}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedReport ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>הועתק!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>העתק טקסט מעוצב</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-6 sm:p-8 space-y-6 text-sm leading-relaxed">
                <p className="text-slate-600">
                  להלן פענוח וריכוז הנתונים מתוך המסמך:
                </p>

                <hr className="border-slate-200" />

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">
                    פרטי המסמך
                  </h3>
                  <ul className="list-disc pr-5 space-y-1 text-slate-800">
                    <li>
                      <strong>סוג המסמך:</strong> {activeDoc.data.documentType}
                    </li>
                    {activeDoc.data.documentNumber && (
                      <li>
                        <strong>מספר חשבונית / מסמך:</strong>{" "}
                        <span className="font-mono-tabular tabular-nums">
                          {activeDoc.data.documentNumber}
                        </span>
                      </li>
                    )}
                    <li>
                      <strong>תאריך:</strong>{" "}
                      <span className="font-mono-tabular tabular-nums">
                        {activeDoc.data.date}
                      </span>
                    </li>
                  </ul>
                </div>

                <hr className="border-slate-200" />

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">
                    פרטי הספק / בית העסק
                  </h3>
                  <ul className="list-disc pr-5 space-y-1 text-slate-800">
                    <li>
                      <strong>שם העסק:</strong> {activeDoc.data.vendor.name}
                    </li>
                    {activeDoc.data.vendor.businessField && (
                      <li>
                        <strong>תחום עיסוק:</strong>{" "}
                        {activeDoc.data.vendor.businessField}
                      </li>
                    )}
                    {activeDoc.data.vendor.taxId && (
                      <li>
                        <strong>עוסק מורשה (ע"מ) / ח.פ:</strong>{" "}
                        <span className="font-mono-tabular tabular-nums">
                          {activeDoc.data.vendor.taxId}
                        </span>
                      </li>
                    )}
                    {activeDoc.data.vendor.address && (
                      <li>
                        <strong>כתובת:</strong> {activeDoc.data.vendor.address}
                      </li>
                    )}
                    {(activeDoc.data.vendor.phone ||
                      activeDoc.data.vendor.mobile) && (
                      <li>
                        <strong>טלפונים:</strong>{" "}
                        <span className="font-mono-tabular tabular-nums">
                          {[
                            activeDoc.data.vendor.phone,
                            activeDoc.data.vendor.mobile
                              ? `נייד: ${activeDoc.data.vendor.mobile}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" | ")}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>

                <hr className="border-slate-200" />

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">
                    פרטי הלקוח
                  </h3>
                  <ul className="list-disc pr-5 space-y-1 text-slate-800">
                    <li>
                      <strong>לכבוד:</strong>{" "}
                      {activeDoc.data.customer.name || "—"}
                    </li>
                    <li>
                      <strong>כתובת:</strong>{" "}
                      {activeDoc.data.customer.address || "—"}
                    </li>
                  </ul>
                </div>

                <hr className="border-slate-200" />

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-3">
                    פירוט השירות / פריטים
                  </h3>
                  <table className="w-full max-w-md border border-slate-200 text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 text-right font-semibold">
                          תיאור
                        </th>
                        <th className="py-2 px-3 text-right font-semibold">
                          כמות
                        </th>
                        <th className="py-2 px-3 text-left font-semibold">
                          סכום
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeDoc.data.lineItems.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3">{it.description}</td>
                          <td className="py-2 px-3 font-mono-tabular tabular-nums">
                            {it.quantity}
                          </td>
                          <td className="py-2 px-3 text-left font-mono-tabular tabular-nums">
                            {it.total.toFixed(2)}{" "}
                            {activeDoc.data.financials.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <hr className="border-slate-200" />

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">
                    סיכום כספי
                  </h3>
                  <ul className="list-disc pr-5 space-y-1 text-slate-800">
                    <li>
                      <strong>סה"כ לפני מע"מ:</strong>{" "}
                      <span className="font-mono-tabular tabular-nums">
                        {activeDoc.data.financials.subtotal.toFixed(2)}{" "}
                        {activeDoc.data.financials.currency}
                      </span>
                    </li>
                    <li>
                      <strong>
                        מע"מ ({activeDoc.data.financials.vatRate || 18}%):
                      </strong>{" "}
                      <span className="font-mono-tabular tabular-nums">
                        {activeDoc.data.financials.vatAmount.toFixed(2)}{" "}
                        {activeDoc.data.financials.currency}
                      </span>
                    </li>
                    <li>
                      <strong>סה"כ לתשלום כולל מע"מ:</strong>{" "}
                      <strong className="font-mono-tabular tabular-nums text-blue-800">
                        {activeDoc.data.financials.totalAmount.toFixed(2)}{" "}
                        {activeDoc.data.financials.currency}
                      </strong>
                    </li>
                    {activeDoc.data.financials.amountInWords && (
                      <li>
                        <strong>סכום במילים:</strong>{" "}
                        {activeDoc.data.financials.amountInWords}
                      </li>
                    )}
                  </ul>
                </div>

                {activeDoc.data.notesAndFlags.length > 0 && (
                  <>
                    <hr className="border-slate-200" />
                    <p className="text-slate-700">
                      <strong>הערות נוספות:</strong>{" "}
                      {activeDoc.data.notesAndFlags.join(" • ")}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* View 3: High-Density Document Ledger Table */}
          {activeView === "ledger" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 font-display">
                    יומן ריכוז מסמכים והוצאות
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    טבלה מרוכזת של כלל המסמכים, קובצי ה-PDF, החשבוניות והפתקים
                    שפוענחו במערכת
                  </p>
                </div>
                <button
                  onClick={exportAllToCsv}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>הורד קובץ CSV לאקסל</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-3 px-4 text-right font-medium">
                          סוג מסמך
                        </th>
                        <th className="py-3 px-4 text-right font-medium">
                          מס' אסמכתא
                        </th>
                        <th className="py-3 px-4 text-right font-medium">
                          תאריך
                        </th>
                        <th className="py-3 px-4 text-right font-medium">
                          שם הספק / העסק
                        </th>
                        <th className="py-3 px-4 text-right font-medium">
                          ע"מ / ח.פ
                        </th>
                        <th className="py-3 px-4 text-left font-medium">
                          לפני מע"מ
                        </th>
                        <th className="py-3 px-4 text-left font-medium">
                          מע"מ
                        </th>
                        <th className="py-3 px-4 text-left font-medium">
                          סה"כ בש"ח
                        </th>
                        <th className="py-3 px-4 text-center font-medium">
                          שליחה במייל
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documents.map((doc) => (
                        <tr
                          key={doc.id}
                          onClick={() => {
                            setSelectedId(doc.id);
                            setActiveView("workspace");
                          }}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 text-slate-700">
                            {doc.data.documentType}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular tabular-nums text-slate-800">
                            {doc.data.documentNumber || "—"}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular tabular-nums text-slate-700">
                            {doc.data.date.split(" ")[0]}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {doc.data.vendor.name}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular tabular-nums text-slate-600">
                            {doc.data.vendor.taxId || "—"}
                          </td>
                          <td className="py-3 px-4 text-left font-mono-tabular tabular-nums text-slate-700">
                            {doc.data.financials.subtotal.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-left font-mono-tabular tabular-nums text-slate-700">
                            {doc.data.financials.vatAmount.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-left font-mono-tabular tabular-nums font-bold text-slate-900">
                            {doc.data.financials.totalAmount.toFixed(2)} ₪
                          </td>
                          <td
                            className="py-3 px-4 text-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEmailModal(doc);
                            }}
                          >
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              <span>שלח במייל</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Send File & Full Analysis by Email Modal */}
      {isEmailModalOpen && emailTargetDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <Mail className="w-5 h-5 text-blue-700 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">
                    שליחת הקובץ והניתוח המלא במייל
                  </h3>
                  <p className="text-xs text-slate-500">
                    {emailTargetDoc.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-900 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-5">
              {emailError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{emailError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmailError(null)}
                    className="underline font-medium cursor-pointer shrink-0"
                  >
                    סגור
                  </button>
                </div>
              )}

              {emailSuccessMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold">{emailSuccessMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEmailModalOpen(false)}
                    className="px-3 py-1 bg-emerald-700 text-white rounded-md font-semibold hover:bg-emerald-800 cursor-pointer shrink-0"
                  >
                    סיום
                  </button>
                </div>
              )}

              {/* Step 1: Recipient input & Remembered Addresses (Used on top) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-900">
                    כתובת מייל למשלוח (ניתן להוסיף מספר נמענים)
                  </label>
                  {googleUser?.email && (
                    <button
                      type="button"
                      onClick={() => {
                        const myEmail = googleUser.email!.toLowerCase();
                        upsertSavedEmails([myEmail], {
                          label: "המייל שלי",
                          markUsed: false,
                        });
                        if (!selectedRecipients.includes(myEmail)) {
                          setSelectedRecipients((prev) => [...prev, myEmail]);
                        }
                      }}
                      className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                    >
                      + שלח לעצמי ({googleUser.email})
                    </button>
                  )}
                </div>

                {/* Selected Recipients List */}
                {selectedRecipients.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg">
                    <span className="text-xs font-semibold text-blue-900 ml-1">
                      נמענים שנבחרו:
                    </span>
                    {selectedRecipients.map((addr) => {
                      const savedInfo = savedEmails.find(
                        (s) => s.email.toLowerCase() === addr.toLowerCase()
                      );
                      return (
                        <span
                          key={addr}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white text-slate-900 border border-blue-300 rounded-md"
                        >
                          <span className="font-mono-tabular">{addr}</span>
                          {savedInfo?.label && (
                            <span className="text-slate-500">
                              ({savedInfo.label})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleRecipientEmail(addr)}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                            title="הסר מרשימת הנמענים הנוכחית"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Input to write new email address */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    dir="ltr"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        handleAddEmailFromInput();
                      }
                    }}
                    placeholder="name@example.com"
                    className="flex-1 px-3 py-2 text-xs font-mono-tabular text-left bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                  <input
                    type="text"
                    value={emailLabelInput}
                    onChange={(e) => setEmailLabelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddEmailFromInput();
                      }
                    }}
                    placeholder="כינוי אופציונלי (למשל: רו״ח / ועד הבית)"
                    className="sm:w-52 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddEmailFromInput}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    הוסף וזכור כתובת
                  </button>
                </div>

                {/* Saved / Remembered Email Addresses List (Used addresses sorted on top!) */}
                {sortedSavedEmails.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
                    <div className="px-3.5 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-700" />
                        <span>
                          כתובות שמורות לבחירה מהירה (אלו שהיו בשימוש מופיעות
                          למעלה)
                        </span>
                      </span>
                      <span className="text-slate-500">
                        {sortedSavedEmails.length} כתובות שמורות
                      </span>
                    </div>

                    <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                      {sortedSavedEmails.map((item) => {
                        const isSelected = selectedRecipients.includes(
                          item.email.toLowerCase()
                        );
                        const wasUsed = item.useCount > 0;
                        return (
                          <div
                            key={item.email}
                            onClick={() => toggleRecipientEmail(item.email)}
                            className={`px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-blue-50/90 text-blue-950"
                                : "bg-white hover:bg-slate-50 text-slate-800"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    dir="ltr"
                                    className="font-mono-tabular font-semibold text-slate-900 truncate"
                                  >
                                    {item.email}
                                  </span>
                                  {item.label && (
                                    <span className="text-slate-600 font-medium">
                                      · {item.label}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              {wasUsed ? (
                                <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                  היה בשימוש ({item.useCount})
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500">
                                  נשמר
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSavedEmailAddress(item.email);
                                }}
                                title="מחק כתובת מהזיכרון"
                                className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Email Subject, Personal Note, and Attachments Config */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1">
                    נושא המייל
                  </label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1">
                    הערה אישית בראש המייל (אופציונלי)
                  </label>
                  <textarea
                    rows={2}
                    value={emailPersonalNote}
                    onChange={(e) => setEmailPersonalNote(e.target.value)}
                    placeholder="למשל: שלום, מצורפת החשבונית והניתוח המלא שלה עבור הנהלת חשבונות..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>

                {/* Attachments Selection */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Paperclip className="w-3.5 h-3.5 text-blue-700" />
                    <span>תכולת המייל והקבצים המצורפים:</span>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachOriginalFile}
                      onChange={(e) => setAttachOriginalFile(e.target.checked)}
                      className="rounded border-slate-300 text-blue-700"
                    />
                    <span>
                      <strong>צרף את קובץ המקור</strong> (PDF / תמונת המסמך /
                      קובץ טקסט) כקובץ מצורף למייל
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachAnalysisReport}
                      onChange={(e) =>
                        setAttachAnalysisReport(e.target.checked)
                      }
                      className="rounded border-slate-300 text-blue-700"
                    />
                    <span>
                      <strong>צרף קובץ דוח ניתוח (.md)</strong> בנוסף לטבלת
                      הניתוח המלאה שמופיעה בגוף המייל
                    </span>
                  </label>
                </div>
              </div>

              {/* Google Account Auth Status for Direct Gmail Sending */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-900">
                    שליחה ישירה עם קבצים מצורפים דרך Gmail
                  </p>
                  <p className="text-xs text-slate-600">
                    {needsAuth
                      ? "התחבר לחשבון Google שלך כדי לשלוח את המייל יחד עם הקובץ המצורף ישירות מהמערכת."
                      : `מחובר לחשבון Google (${
                          googleUser?.email || "פעיל"
                        }) — מוכן לשליחה עם קבצים מצורפים.`}
                  </p>
                </div>
                {needsAuth ? (
                  <div className="shrink-0">
                    <OfficialGoogleSignInButton
                      onClick={handleGoogleLogin}
                      disabled={isLoggingIn}
                      label={isLoggingIn ? "מתחבר..." : "Sign in with Google"}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="text-xs text-blue-700 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    החלף חשבון / רענן הרשאה
                  </button>
                )}
              </div>

              {/* Mandatory User Confirmation Dialog before sending email via Workspace API */}
              {isConfirmingEmailSend && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-amber-950">
                      אישור שליחת מייל מחשבונך ({googleUser?.email || "Gmail"})
                    </h4>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      האם ברצונך לאשר שליחת הודעת אימייל עם ניתוח המסמך{" "}
                      {attachOriginalFile ? "וקובץ המקור המצורף " : ""}אל{" "}
                      <strong dir="ltr" className="font-mono-tabular">
                        {selectedRecipients.join(", ")}
                      </strong>{" "}
                      בנושא <strong>"{emailSubject}"</strong>?
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsConfirmingEmailSend(false)}
                      disabled={isSendingEmail}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                    >
                      ביטול
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmAndSendEmail}
                      disabled={isSendingEmail}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {isSendingEmail
                          ? "שולח מייל וקבצים..."
                          : "אשר ושלח מייל כעת"}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleSendViaMailtoClient}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
              >
                פתיחה בתוכנת המייל במכשיר (ללא צירוף אוטומטי)
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  סגור
                </button>
                {!isConfirmingEmailSend && (
                  <button
                    type="button"
                    onClick={handleRequestEmailConfirmation}
                    disabled={needsAuth || isSendingEmail}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>המשך לאישור ושליחה ב-Gmail</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive File Browser Modal */}
      {isDriveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <FolderOpen className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">
                    ייבוא מסמכים וקבצים מ-Google Drive
                  </h3>
                  <p className="text-xs text-slate-500">
                    בחר קובץ PDF, מסמך Google Docs / Sheets, טקסט או תמונת קבלה
                    לפענוח מיידי
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDriveModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-900 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {driveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between">
                  <span>{driveError}</span>
                  <button
                    onClick={() => setDriveError(null)}
                    className="underline font-medium cursor-pointer"
                  >
                    סגור
                  </button>
                </div>
              )}

              {needsAuth ? (
                <div className="py-10 px-4 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <h4 className="text-base font-bold text-slate-900">
                      חיבור לחשבון Google Drive
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      התחבר לחשבון Google שלך כדי לדפדף בקובצי ה-Drive שלך
                      (PDF, חשבוניות, מסמכים ותמונות) ולייבא אותם ישירות לפענוח.
                    </p>
                  </div>
                  <div className="flex justify-center pt-2">
                    <OfficialGoogleSignInButton
                      onClick={handleGoogleLogin}
                      disabled={isLoggingIn}
                      label={
                        isLoggingIn ? "מתחבר..." : "Sign in with Google"
                      }
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Connected User Bar + Search + Filter */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 text-xs text-slate-600">
                    <div>
                      <span>מחובר כ-</span>
                      <strong className="text-slate-900 mx-1">
                        {googleUser?.email || googleUser?.displayName || "משתמש Google"}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleLogout}
                      className="flex items-center gap-1 text-slate-500 hover:text-red-600 cursor-pointer self-start sm:self-auto"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>התנתק מחשבון Google</span>
                    </button>
                  </div>

                  {/* Search & Filter Controls */}
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        fetchDriveFilesList(driveSearch, driveFilter);
                      }}
                      className="flex-1 flex gap-2"
                    >
                      <input
                        type="text"
                        value={driveSearch}
                        onChange={(e) => setDriveSearch(e.target.value)}
                        placeholder="חפש קובץ ב-Google Drive לפי שם..."
                        className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-blue-600"
                      />
                      <button
                        type="submit"
                        disabled={isLoadingDrive}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        חפש
                      </button>
                    </form>

                    {/* Segmented File Type Filter */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(
                        [
                          { id: "all", label: "הכל" },
                          { id: "pdf", label: "PDF" },
                          { id: "docs", label: "מסמכים" },
                          { id: "image", label: "תמונות" },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setDriveFilter(tab.id);
                            fetchDriveFilesList(driveSearch, tab.id);
                          }}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            driveFilter === tab.id
                              ? "bg-white text-slate-900 shadow-xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Files List */}
                  {isLoadingDrive ? (
                    <div className="py-12 text-center space-y-2">
                      <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto" />
                      <p className="text-xs text-slate-500">
                        טוען קבצים מ-Google Drive...
                      </p>
                    </div>
                  ) : driveFiles.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                      <p className="text-sm font-medium text-slate-700">
                        לא נמצאו קבצים תואמים ב-Google Drive
                      </p>
                      <p className="text-xs text-slate-500">
                        נסה לשנות את מילות החיפוש או לבחור סינון אחר.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {driveFiles.map((file) => {
                        const isImporting = importingFileId === file.id;
                        const isPdf = file.mimeType === "application/pdf";
                        const isDoc =
                          file.mimeType.includes("google-apps") ||
                          file.mimeType.startsWith("text/");
                        const typeLabel = isPdf
                          ? "PDF"
                          : isDoc
                          ? "מסמך / נתונים"
                          : "תמונה";

                        return (
                          <div
                            key={file.id}
                            className="p-3.5 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isPdf ? (
                                <FileText className="w-4 h-4 text-red-600 shrink-0" />
                              ) : (
                                <File className="w-4 h-4 text-blue-600 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {file.name}
                                </p>
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <span>{typeLabel}</span>
                                  {file.modifiedTime && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono-tabular tabular-nums">
                                        {new Date(
                                          file.modifiedTime
                                        ).toLocaleDateString("he-IL")}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectDriveFile(file)}
                              disabled={Boolean(importingFileId)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              {isImporting ? "מייבא ומפענח..." : "ייבא ופענח"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                גישה לקריאה בלבד באישור המשתמש
              </span>
              <button
                type="button"
                onClick={() => setIsDriveModalOpen(false)}
                className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                צילום מסמך לפענוח
              </h3>
              <button
                onClick={closeCamera}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full max-h-[380px] object-contain rounded"
              />
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={closeCamera}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ביטול
              </button>
              <button
                onClick={captureCameraPhoto}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
              >
                צלם ופענח כעת
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
