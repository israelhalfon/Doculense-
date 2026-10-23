import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory ONLY (never in localStorage or sessionStorage).
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const freshProvider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => freshProvider.addScope(scope));
    freshProvider.setCustomParameters({ prompt: "consent" });
    const result = await signInWithPopup(auth, freshProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("לא התקבל אסימון גישה (Access Token) מהתחברות Google.");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

export async function listDriveFiles(
  searchQuery = "",
  filterType: "all" | "pdf" | "image" | "docs" = "all"
): Promise<DriveFileItem[]> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("נדרשת התחברות לחשבון Google כדי לגשת לקבצים ב-Drive.");
  }

  const conditions: string[] = [
    "trashed = false",
    "mimeType != 'application/vnd.google-apps.folder'",
  ];

  if (searchQuery.trim()) {
    const escaped = searchQuery.trim().replace(/'/g, "\\'");
    conditions.push(`name contains '${escaped}'`);
  }

  if (filterType === "pdf") {
    conditions.push("mimeType = 'application/pdf'");
  } else if (filterType === "image") {
    conditions.push("mimeType contains 'image/'");
  } else if (filterType === "docs") {
    conditions.push(
      "(mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType contains 'text/')"
    );
  } else {
    conditions.push(
      "(mimeType = 'application/pdf' or mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType contains 'text/')"
    );
  }

  const params = new URLSearchParams({
    pageSize: "30",
    fields:
      "files(id, name, mimeType, modifiedTime, size, iconLink, thumbnailLink)",
    orderBy: "modifiedTime desc",
    q: conditions.join(" and "),
  });

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error("פג תוקף החיבור ל-Google Drive. נא להתחבר מחדש.");
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || "שגיאה בטעינת רשימת הקבצים מ-Google Drive."
    );
  }

  const data = await res.json();
  return data.files || [];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("שגיאה בקריאת נתוני הקובץ."));
    reader.readAsDataURL(blob);
  });
}

export async function downloadDriveFileAsDataUrl(file: DriveFileItem): Promise<{
  dataUrl: string;
  mimeType: string;
  textContent?: string;
}> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("נדרשת התחברות לחשבון Google.");
  }

  let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    file.id
  )}?alt=media`;
  let targetMime = file.mimeType;

  // Handle Google Workspace native documents (Google Docs, Sheets, Slides) via export
  if (file.mimeType === "application/vnd.google-apps.document") {
    targetMime = "application/pdf";
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}/export?mimeType=application/pdf`;
  } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    targetMime = "text/csv";
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}/export?mimeType=text/csv`;
  } else if (file.mimeType === "application/vnd.google-apps.presentation") {
    targetMime = "application/pdf";
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}/export?mimeType=application/pdf`;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("שגיאה בהורדת הקובץ מ-Google Drive.");
  }

  const rawBlob = await res.blob();
  const typedBlob = new Blob([rawBlob], { type: targetMime });
  const dataUrl = await blobToDataUrl(typedBlob);

  let textContent: string | undefined;
  if (
    targetMime.startsWith("text/") ||
    targetMime === "application/json" ||
    file.name.endsWith(".txt") ||
    file.name.endsWith(".csv") ||
    file.name.endsWith(".md")
  ) {
    textContent = await typedBlob.text();
  }

  return {
    dataUrl,
    mimeType: targetMime,
    textContent,
  };
}

export interface EmailAttachmentPayload {
  fileName: string;
  mimeType: string;
  base64Data: string;
}

export interface SendEmailPayload {
  to: string[];
  subject: string;
  htmlBody: string;
  plainTextBody: string;
  attachments?: EmailAttachmentPayload[];
}

export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function utf8ToBase64Url(str: string): string {
  return utf8ToBase64(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function wrapBase64Lines(b64: string, lineLength = 76): string {
  const clean = b64.replace(/[\r\n\s]/g, "");
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += lineLength) {
    lines.push(clean.slice(i, i + lineLength));
  }
  return lines.join("\r\n");
}

export async function sendEmailViaGmail(
  payload: SendEmailPayload
): Promise<{ id: string }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("נדרשת התחברות לחשבון Google כדי לשלוח מייל דרך Gmail.");
  }

  const recipients = payload.to.map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) {
    throw new Error("נא להזין לפחות כתובת אימייל אחת למשלוח.");
  }

  const mixedBoundary = `mixed_doculens_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
  const altBoundary = `alt_doculens_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(payload.subject)}?=`;

  const mimeLines: string[] = [
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64Lines(utf8ToBase64(payload.plainTextBody)),
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64Lines(utf8ToBase64(payload.htmlBody)),
    "",
    `--${altBoundary}--`,
  ];

  if (payload.attachments && payload.attachments.length > 0) {
    for (const att of payload.attachments) {
      const encodedName = `=?UTF-8?B?${utf8ToBase64(att.fileName)}?=`;
      mimeLines.push(
        "",
        `--${mixedBoundary}`,
        `Content-Type: ${att.mimeType}; name="${encodedName}"`,
        `Content-Disposition: attachment; filename="${encodedName}"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64Lines(att.base64Data)
      );
    }
  }

  mimeLines.push("", `--${mixedBoundary}--`, "");

  const rawMessage = utf8ToBase64Url(mimeLines.join("\r\n"));

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: rawMessage }),
    }
  );

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error(
      "נדרשת הרשאת שליחת מייל (Gmail). נא להתחבר מחדש לחשבון Google ולאשר את ההרשאה."
    );
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || "שגיאה בשליחת ההודעה דרך Gmail API."
    );
  }

  return await res.json();
}

