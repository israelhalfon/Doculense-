import { DocumentRecord, ExtractedDocumentData } from "../types/document";

function svgToDataUrl(svgString: string): string {
  const encoded = encodeURIComponent(svgString.trim())
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml;utf8,${encoded}`;
}

// 1. Exact replica of the "שלמה שרותי חשמל ותיקונים" invoice from the prompt
const shlomoInvoiceSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 860" width="680" height="860">
  <defs>
    <filter id="paper" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
      <feDiffuseLighting in="noise" lighting-color="#fdfbf7" surfaceScale="1.2">
        <feDistantLight azimuth="45" elevation="65" />
      </feDiffuseLighting>
    </filter>
  </defs>
  <rect width="680" height="860" fill="#faf7f0" />
  <rect x="20" y="20" width="640" height="820" fill="#fdfbf6" stroke="#cbd5e1" stroke-width="1.5" rx="4" />

  <!-- Header Box -->
  <text x="540" y="68" font-family="sans-serif" font-size="26" font-weight="bold" fill="#1e3a8a" text-anchor="end">שלמה שרותי חשמל ותיקונים</text>
  <text x="540" y="96" font-family="sans-serif" font-size="16" font-weight="600" fill="#1e40af" text-anchor="end">חשמלאי מוסמך • ביצוע עבודות חשמל כלליות לבנין ולתעשיה</text>
  
  <text x="140" y="65" font-family="monospace" font-size="15" font-weight="bold" fill="#334155" text-anchor="start">ע"מ: 056471543</text>
  <text x="140" y="88" font-family="sans-serif" font-size="14" fill="#475569" text-anchor="start">רח' צביק 8, פתח תקווה</text>
  <text x="140" y="108" font-family="monospace" font-size="13" fill="#475569" text-anchor="start">טל: 03-9249707 | נייד: 052-2421016</text>

  <line x1="45" y1="128" x2="635" y2="128" stroke="#1e3a8a" stroke-width="2" />
  <line x1="45" y1="133" x2="635" y2="133" stroke="#1e3a8a" stroke-width="0.7" />

  <!-- Invoice Title & Number -->
  <text x="340" y="172" font-family="sans-serif" font-size="22" font-weight="bold" fill="#0f172a" text-anchor="middle">חשבונית מס (מקור)</text>
  <text x="595" y="172" font-family="monospace" font-size="22" font-weight="bold" fill="#b91c1c" text-anchor="end">01922</text>
  
  <text x="200" y="172" font-family="sans-serif" font-size="15" fill="#334155" text-anchor="end">תאריך:</text>
  <text x="135" y="172" font-family="cursive, sans-serif" font-size="20" font-style="italic" font-weight="600" fill="#1d4ed8" text-anchor="end">20/01/26</text>
  <line x1="60" y1="176" x2="150" y2="176" stroke="#94a3b8" stroke-dasharray="3,2" />

  <!-- Customer Section -->
  <text x="615" y="224" font-family="sans-serif" font-size="16" font-weight="bold" fill="#334155" text-anchor="end">לכבוד:</text>
  <text x="545" y="222" font-family="cursive, sans-serif" font-size="21" font-style="italic" fill="#1d4ed8" text-anchor="end">ועד הבית 38/1</text>
  <line x1="260" y1="228" x2="560" y2="228" stroke="#94a3b8" stroke-dasharray="3,2" />

  <text x="615" y="264" font-family="sans-serif" font-size="16" font-weight="bold" fill="#334155" text-anchor="end">כתובת:</text>
  <text x="545" y="262" font-family="cursive, sans-serif" font-size="20" font-style="italic" fill="#1d4ed8" text-anchor="end">הרצל / רופין 38</text>
  <line x1="260" y1="268" x2="560" y2="268" stroke="#94a3b8" stroke-dasharray="3,2" />

  <!-- Items Table -->
  <rect x="45" y="300" width="590" height="310" fill="none" stroke="#1e3a8a" stroke-width="1.5" />
  <line x1="45" y1="342" x2="635" y2="342" stroke="#1e3a8a" stroke-width="1.5" />

  <!-- Table Vertical Columns: כמות (right) | פרטים | תעודת משלוח | סכום -->
  <line x1="545" y1="300" x2="545" y2="610" stroke="#1e3a8a" stroke-width="1" />
  <line x1="255" y1="300" x2="255" y2="610" stroke="#1e3a8a" stroke-width="1" />
  <line x1="165" y1="300" x2="165" y2="610" stroke="#1e3a8a" stroke-width="1" />

  <text x="590" y="327" font-family="sans-serif" font-size="15" font-weight="bold" fill="#1e3a8a" text-anchor="middle">כמות</text>
  <text x="400" y="327" font-family="sans-serif" font-size="15" font-weight="bold" fill="#1e3a8a" text-anchor="middle">פרטים</text>
  <text x="210" y="327" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1e3a8a" text-anchor="middle">ת. משלוח</text>
  <text x="105" y="327" font-family="sans-serif" font-size="15" font-weight="bold" fill="#1e3a8a" text-anchor="middle">סכום ש"ח</text>

  <!-- Horizontal ruled lines -->
  <line x1="45" y1="395" x2="635" y2="395" stroke="#cbd5e1" stroke-width="1" />
  <line x1="45" y1="448" x2="635" y2="448" stroke="#cbd5e1" stroke-width="1" />
  <line x1="45" y1="501" x2="635" y2="501" stroke="#cbd5e1" stroke-width="1" />
  <line x1="45" y1="554" x2="635" y2="554" stroke="#cbd5e1" stroke-width="1" />

  <!-- Handwritten rows -->
  <text x="505" y="382" font-family="cursive, sans-serif" font-size="24" font-style="italic" fill="#1d4ed8" text-anchor="end">החלפת</text>
  <text x="505" y="435" font-family="cursive, sans-serif" font-size="24" font-style="italic" fill="#1d4ed8" text-anchor="end">לחצן מדרגות</text>
  <text x="505" y="488" font-family="cursive, sans-serif" font-size="22" font-style="italic" fill="#1d4ed8" text-anchor="end">2 - יח'</text>
  <text x="590" y="435" font-family="cursive, sans-serif" font-size="22" font-style="italic" fill="#1d4ed8" text-anchor="middle">2</text>
  <text x="105" y="435" font-family="monospace" font-size="22" font-weight="bold" fill="#1d4ed8" text-anchor="middle">250.00</text>

  <!-- Totals Section -->
  <rect x="45" y="625" width="240" height="125" fill="#f8fafc" stroke="#1e3a8a" stroke-width="1.2" />
  <line x1="45" y1="666" x2="285" y2="666" stroke="#cbd5e1" stroke-width="1" />
  <line x1="45" y1="707" x2="285" y2="707" stroke="#1e3a8a" stroke-width="1.2" />
  <line x1="155" y1="625" x2="155" y2="750" stroke="#1e3a8a" stroke-width="1" />

  <text x="275" y="651" font-family="sans-serif" font-size="14" font-weight="bold" fill="#334155" text-anchor="end">סה"כ לפני מע"מ</text>
  <text x="100" y="652" font-family="monospace" font-size="18" font-weight="bold" fill="#1d4ed8" text-anchor="middle">250.00</text>

  <text x="275" y="692" font-family="sans-serif" font-size="14" font-weight="bold" fill="#334155" text-anchor="end">מע"מ 18%</text>
  <text x="100" y="693" font-family="monospace" font-size="18" font-weight="bold" fill="#1d4ed8" text-anchor="middle">45.00</text>

  <text x="275" y="734" font-family="sans-serif" font-size="15" font-weight="bold" fill="#0f172a" text-anchor="end">סה"כ ש"ח</text>
  <text x="100" y="735" font-family="monospace" font-size="20" font-weight="bold" fill="#1e3a8a" text-anchor="middle">295.00</text>

  <!-- Amount in Words & Signature -->
  <text x="615" y="660" font-family="sans-serif" font-size="15" font-weight="bold" fill="#334155" text-anchor="end">סכום במילים:</text>
  <text x="515" y="660" font-family="cursive, sans-serif" font-size="19" font-style="italic" fill="#1d4ed8" text-anchor="end">מאתיים תשעים וחמש ש"ח</text>
  <line x1="315" y1="666" x2="525" y2="666" stroke="#94a3b8" stroke-dasharray="3,2" />

  <text x="615" y="740" font-family="sans-serif" font-size="15" font-weight="bold" fill="#334155" text-anchor="end">חתימה:</text>
  <path d="M 430 742 Q 455 710 475 738 T 515 725 Q 530 740 490 748" fill="none" stroke="#1d4ed8" stroke-width="2.4" />
</svg>
`;

// 2. Sample Handwritten Note (פתק בכתב יד - סיכום ספקים ומשימות)
const handwrittenNoteSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 760" width="680" height="760">
  <rect width="680" height="760" fill="#fefce8" />
  <rect x="24" y="24" width="632" height="712" fill="#fef9c3" stroke="#eab308" stroke-width="1.5" rx="6" />
  <line x1="560" y1="24" x2="560" y2="736" stroke="#fca5a5" stroke-width="1.5" />

  <text x="535" y="85" font-family="sans-serif" font-size="24" font-weight="bold" fill="#1e293b" text-anchor="end">סיכום ביקור תחזוקה — בניין הרצל 38</text>
  <text x="535" y="118" font-family="monospace" font-size="16" fill="#475569" text-anchor="end">תאריך: 22/01/2026 | רשם: דניאל כהן (ועד הבית)</text>

  <line x1="40" y1="145" x2="620" y2="145" stroke="#fde047" stroke-width="2" />

  <text x="535" y="195" font-family="sans-serif" font-size="19" font-weight="600" fill="#0f172a" text-anchor="end">1. חשמל ותאורה (שלמה חשמלאי - 052-2421016):</text>
  <text x="515" y="230" font-family="sans-serif" font-size="17" fill="#334155" text-anchor="end">• הוחלפו 2 לחצני מדרגות בקומות א' ו-ב' — שולם 295 ש"ח (חשבונית 01922).</text>
  <text x="515" y="262" font-family="sans-serif" font-size="17" fill="#334155" text-anchor="end">• נדרש להזמין טיימר ראשי חדש לארון חשמל — הצעת מחיר: 420 ש"ח כולל מע"מ.</text>

  <text x="535" y="325" font-family="sans-serif" font-size="19" font-weight="600" fill="#0f172a" text-anchor="end">2. גינון והשקיה ("ירוק בעיר" - יוסי):</text>
  <text x="515" y="360" font-family="sans-serif" font-size="17" fill="#334155" text-anchor="end">• טיפול חודשי שוטף + תיקון ממטרה בחזית — 650 ש"ח (בהעברה בנקאית ב-01/02).</text>

  <text x="535" y="425" font-family="sans-serif" font-size="19" font-weight="600" fill="#0f172a" text-anchor="end">3. משימות פתוחות להמשך השבוע:</text>
  <text x="515" y="460" font-family="sans-serif" font-size="17" fill="#334155" text-anchor="end">• לגבות דמי ועד מדירה 4 ודירה 7 (300 ש"ח כל אחת).</text>
  <text x="515" y="492" font-family="sans-serif" font-size="17" fill="#334155" text-anchor="end">• לתאם בדיקת מעלית חצי-שנתית מול חברת "שחק מעליות".</text>

  <rect x="60" y="555" width="475" height="115" fill="#fef08a" stroke="#ca8a04" stroke-width="1" rx="6" />
  <text x="515" y="592" font-family="sans-serif" font-size="17" font-weight="bold" fill="#713f12" text-anchor="end">ריכוז תקציב צפוי לינואר-פברואר:</text>
  <text x="515" y="624" font-family="monospace" font-size="16" fill="#713f12" text-anchor="end">שולם החודש: 295.00 ש"ח | יתרה לתשלום לספקים: 1,070.00 ש"ח</text>
  <text x="515" y="652" font-family="monospace" font-size="16" font-weight="bold" fill="#713f12" text-anchor="end">סה"כ הוצאות תחזוקה: 1,365.00 ש"ח</text>
</svg>
`;

// 3. Sample Restaurant Receipt / Menu (קבלה ממסעדה / בית קפה)
const cafeReceiptSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 780" width="540" height="780">
  <rect width="540" height="780" fill="#f1f5f9" />
  <rect x="45" y="25" width="450" height="730" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" rx="2" />

  <text x="270" y="75" font-family="sans-serif" font-size="24" font-weight="bold" fill="#0f172a" text-anchor="middle">קפה רוטשילד 42 בע"מ</text>
  <text x="270" y="102" font-family="sans-serif" font-size="14" fill="#475569" text-anchor="middle">שדרות רוטשילד 42, תל אביב-יפו</text>
  <text x="270" y="124" font-family="monospace" font-size="14" fill="#475569" text-anchor="middle">ח.פ: 514892108 | טל: 03-5601122</text>

  <line x1="75" y1="145" x2="465" y2="145" stroke="#94a3b8" stroke-dasharray="4,4" />

  <text x="455" y="176" font-family="sans-serif" font-size="16" font-weight="bold" fill="#0f172a" text-anchor="end">חשבונית מס / קבלה #88412</text>
  <text x="455" y="202" font-family="monospace" font-size="14" fill="#334155" text-anchor="end">תאריך: 23/10/2026 | שעה: 10:15</text>
  <text x="455" y="224" font-family="sans-serif" font-size="14" fill="#334155" text-anchor="end">שולחן: 14 | מלצר: נועה | סועדים: 2</text>

  <line x1="75" y1="244" x2="465" y2="244" stroke="#0f172a" stroke-width="1.5" />
  <text x="455" y="268" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="end">פריט</text>
  <text x="220" y="268" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">כמות</text>
  <text x="95" y="268" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="start">סה"כ</text>
  <line x1="75" y1="280" x2="465" y2="280" stroke="#0f172a" stroke-width="1" />

  <text x="455" y="312" font-family="sans-serif" font-size="15" fill="#1e293b" text-anchor="end">ארוחת בוקר זוגית רוטשילד</text>
  <text x="220" y="312" font-family="monospace" font-size="15" fill="#1e293b" text-anchor="middle">1</text>
  <text x="95" y="312" font-family="monospace" font-size="15" font-weight="bold" fill="#1e293b" text-anchor="start">138.00</text>

  <text x="455" y="348" font-family="sans-serif" font-size="15" fill="#1e293b" text-anchor="end">קפוצ'ינו גדול - שיבולת שועל</text>
  <text x="220" y="348" font-family="monospace" font-size="15" fill="#1e293b" text-anchor="middle">2</text>
  <text x="95" y="348" font-family="monospace" font-size="15" font-weight="bold" fill="#1e293b" text-anchor="start">36.00</text>

  <text x="455" y="384" font-family="sans-serif" font-size="15" fill="#1e293b" text-anchor="end">מאפה שקדים חם</text>
  <text x="220" y="384" font-family="monospace" font-size="15" fill="#1e293b" text-anchor="middle">1</text>
  <text x="95" y="384" font-family="monospace" font-size="15" font-weight="bold" fill="#1e293b" text-anchor="start">24.00</text>

  <text x="455" y="420" font-family="sans-serif" font-size="15" fill="#1e293b" text-anchor="end">מיץ תפוזים סחוט טרי</text>
  <text x="220" y="420" font-family="monospace" font-size="15" fill="#1e293b" text-anchor="middle">1</text>
  <text x="95" y="420" font-family="monospace" font-size="15" font-weight="bold" fill="#1e293b" text-anchor="start">18.00</text>

  <line x1="75" y1="450" x2="465" y2="450" stroke="#94a3b8" stroke-dasharray="4,4" />

  <text x="455" y="485" font-family="sans-serif" font-size="15" fill="#475569" text-anchor="end">סה"כ לפני מע"מ:</text>
  <text x="95" y="485" font-family="monospace" font-size="15" fill="#475569" text-anchor="start">183.05 ₪</text>

  <text x="455" y="515" font-family="sans-serif" font-size="15" fill="#475569" text-anchor="end">מע"מ (18%):</text>
  <text x="95" y="515" font-family="monospace" font-size="15" fill="#475569" text-anchor="start">32.95 ₪</text>

  <line x1="75" y1="538" x2="465" y2="538" stroke="#0f172a" stroke-width="1.5" />

  <text x="455" y="572" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="end">סה"כ לתשלום:</text>
  <text x="95" y="572" font-family="monospace" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="start">216.00 ₪</text>

  <text x="455" y="620" font-family="sans-serif" font-size="14" fill="#334155" text-anchor="end">שולם בכרטיס אשראי ויזה (*4921) — תשלום 1 (רגיל)</text>
  <text x="455" y="644" font-family="monospace" font-size="13" fill="#64748b" text-anchor="end">אישור חברת אשראי: 0094812 | מסוף: 082144</text>
  <text x="270" y="710" font-family="sans-serif" font-size="15" font-weight="bold" fill="#334155" text-anchor="middle">תודה ולהתראות! מסמך ממוחשב חתום דיגיטלית</text>
</svg>
`;

export const INITIAL_SAMPLE_DOCUMENTS: DocumentRecord[] = [
  {
    id: "sample-shlomo-electric-01922",
    title: "שלמה שרותי חשמל ותיקונים — חשבונית מס 01922",
    createdAt: "2026-10-23T09:45:00Z",
    imageUrl: svgToDataUrl(shlomoInvoiceSvg),
    mimeType: "image/svg+xml",
    isSample: true,
    data: {
      documentType: "חשבונית מס (מקור)",
      category: "invoice",
      documentNumber: "01922",
      date: "20/01/26 (ייתכן 20/10/26)",
      time: "",
      vendor: {
        name: "שלמה שרותי חשמל ותיקונים — חשמלאי מוסמך",
        businessField: "ביצוע עבודות חשמל כלליות לבנין ולתעשיה",
        taxId: "056471543",
        address: "רח' צביק 8, פתח תקווה",
        phone: "03-9249707",
        mobile: "052-2421016",
      },
      customer: {
        name: "38/1 (ככל הנראה ועד הבית)",
        address: "מספר 38 (כתב היד אינו חד-משמעי לגבי שם הרחוב, ככל הנראה הרצל / רופין 38)",
      },
      lineItems: [
        {
          description: "החלפת לחצן מדרגות",
          quantity: "2 יח'",
          unitPrice: 125,
          total: 250,
        },
      ],
      financials: {
        subtotal: 250.0,
        vatRate: 18,
        vatAmount: 45.0,
        totalAmount: 295.0,
        currency: 'ש"ח',
        amountInWords: 'מאתיים תשעים וחמש ש"ח',
        paymentMethod: "לא צוין (קיימת חתימת הספק)",
      },
      keyPoints: [
        "חשבונית מס מקור מספר 01922 מאת החשמלאי המוסמך 'שלמה שרותי חשמל ותיקונים' (ע\"מ 056471543).",
        "בוצעה החלפה של 2 יחידות לחצן מדרגות בעלות של 250.00 ש\"ח לפני מע\"מ.",
        "הסכום הסופי לתשלום כולל מע\"מ (18% בסך 45.00 ש\"ח) הינו 295.00 ש\"ח.",
      ],
      notesAndFlags: [
        "קיימת חתימת הספק בתחתית החשבונית.",
        "ספרות החודש בתאריך (20/01/26 או 20/10/26) ושם הרחוב בכתובת הלקוח נכתבו בכתב יד מחובר.",
      ],
    },
    qaHistory: [
      {
        question: "איך חושב המע\"מ בחשבונית הזו?",
        answer: "הסכום לפני מע\"מ הוא 250.00 ש\"ח. חושב מע\"מ בשיעור 18% (250 × 0.18 = 45.00 ש\"ח), כך שהסכום הכולל לתשלום עומד על 295.00 ש\"ח בדיוק.",
        timestamp: "09:46",
      },
    ],
  },
  {
    id: "sample-committee-note-38",
    title: "פתק בכתב יד — סיכום ביקור תחזוקה הרצל 38",
    createdAt: "2026-10-22T18:20:00Z",
    imageUrl: svgToDataUrl(handwrittenNoteSvg),
    mimeType: "image/svg+xml",
    isSample: true,
    data: {
      documentType: "פתק בכתב יד / סיכום ישיבת ועד",
      category: "note",
      documentNumber: "ללא מספר",
      date: "22/01/2026",
      time: "",
      vendor: {
        name: "ועד הבית — בניין הרצל 38 (דניאל כהן)",
        businessField: "ניהול ותחזוקת מבנה מגורים",
        taxId: "",
        address: "רח' הרצל 38",
        phone: "",
        mobile: "052-2421016 (שלמה חשמלאי)",
      },
      customer: {
        name: "דיירי הבניין / תיק ועד הבית",
        address: "הרצל 38",
      },
      lineItems: [
        {
          description: "החלפת 2 לחצני מדרגות בקומות א' ו-ב' (שולם - חשבונית 01922)",
          quantity: "2 יח'",
          unitPrice: 147.5,
          total: 295,
        },
        {
          description: "הצעת מחיר לטיימר ראשי חדש לארון חשמל (כולל מע\"מ)",
          quantity: "1 יח'",
          unitPrice: 420,
          total: 420,
        },
        {
          description: "גינון שוטף + תיקון ממטרה בחזית ('ירוק בעיר' - יוסי)",
          quantity: "חודשי",
          unitPrice: 650,
          total: 650,
        },
      ],
      financials: {
        subtotal: 1365.0,
        vatRate: 0,
        vatAmount: 0,
        totalAmount: 1365.0,
        currency: 'ש"ח',
        amountInWords: "",
        paymentMethod: "משולב (295 ש\"ח שולמו, 1,070 ש\"ח יתרה לתשלום)",
      },
      keyPoints: [
        "שולם סך 295 ש\"ח לשלמה החשמלאי עבור החלפת 2 לחצני מדרגות.",
        "התקבלה הצעת מחיר על סך 420 ש\"ח להחלפת טיימר ראשי בארון החשמל.",
        "תשלום לגנן ('ירוק בעיר') בסך 650 ש\"ח יבוצע בהעברה בנקאית ב-01/02.",
        "משימות המשך: גביית דמי ועד מדירות 4 ו-7 (300 ש\"ח כ\"א) ותיאום בדיקת מעלית מול 'שחק מעליות'.",
      ],
      notesAndFlags: [
        "מסמך פנימי המאגד הוצאות ששולמו והתחייבויות עתידיות בסך מצטבר של 1,365.00 ש\"ח.",
      ],
    },
  },
  {
    id: "sample-cafe-rothschild-88412",
    title: "קפה רוטשילד 42 — חשבונית מס / קבלה #88412",
    createdAt: "2026-10-23T10:15:00Z",
    imageUrl: svgToDataUrl(cafeReceiptSvg),
    mimeType: "image/svg+xml",
    isSample: true,
    data: {
      documentType: "חשבונית מס / קבלה",
      category: "invoice",
      documentNumber: "88412",
      date: "23/10/2026",
      time: "10:15",
      vendor: {
        name: "קפה רוטשילד 42 בע\"מ",
        businessField: "בית קפה ומסעדה",
        taxId: "514892108",
        address: "שדרות רוטשילד 42, תל אביב-יפו",
        phone: "03-5601122",
        mobile: "",
      },
      customer: {
        name: "שולחן 14 (2 סועדים)",
        address: "מלצרית: נועה",
      },
      lineItems: [
        {
          description: "ארוחת בוקר זוגית רוטשילד",
          quantity: "1",
          unitPrice: 138,
          total: 138,
        },
        {
          description: "קפוצ'ינו גדול - שיבולת שועל",
          quantity: "2",
          unitPrice: 18,
          total: 36,
        },
        {
          description: "מאפה שקדים חם",
          quantity: "1",
          unitPrice: 24,
          total: 24,
        },
        {
          description: "מיץ תפוזים סחוט טרי",
          quantity: "1",
          unitPrice: 18,
          total: 18,
        },
      ],
      financials: {
        subtotal: 183.05,
        vatRate: 18,
        vatAmount: 32.95,
        totalAmount: 216.0,
        currency: 'ש"ח',
        amountInWords: "",
        paymentMethod: "כרטיס אשראי ויזה (*4921) — אישור 0094812",
      },
      keyPoints: [
        "חשבונית מס קבלה ממוחשבת #88412 מבית 'קפה רוטשילד 42 בע\"מ' (ח.פ 514892108).",
        "4 שורות חיוב (ארוחת בוקר זוגית, 2 קפוצ'ינו, מאפה שקדים ומיץ תפוזים).",
        "סה\"כ שולם 216.00 ש\"ח בכרטיס אשראי ויזה המסתיים ב-4921.",
      ],
      notesAndFlags: [
        "מסמך ממוחשב חתום דיגיטלית, כולל מספר אישור חברת אשראי (0094812).",
      ],
    },
  },
];

export function formatDocumentToMarkdown(
  doc: ExtractedDocumentData,
  options?: {
    personalNote?: string;
    qaHistory?: Array<{ question: string; answer: string; timestamp: string }>;
  }
): string {
  const lines: string[] = [];
  if (options?.personalNote?.trim()) {
    lines.push(`הודעה מצורפת: ${options.personalNote.trim()}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push("להלן פענוח וריכוז הנתונים מתוך המסמך:");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("### **פרטי המסמך**");
  lines.push(`* **סוג המסמך:** ${doc.documentType || "לא צוין"}`);
  if (doc.documentNumber) {
    lines.push(`* **מספר מסמך / חשבונית:** ${doc.documentNumber}`);
  }
  lines.push(
    `* **תאריך:** ${doc.date || "לא צוין"}${
      doc.time ? ` | **שעה:** ${doc.time}` : ""
    }`
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("### **פרטי הספק / בית העסק**");
  lines.push(`* **שם העסק:** ${doc.vendor.name || "לא צוין"}`);
  if (doc.vendor.businessField) {
    lines.push(`* **תחום עיסוק:** ${doc.vendor.businessField}`);
  }
  if (doc.vendor.taxId) {
    lines.push(`* **עוסק מורשה / ח.פ:** ${doc.vendor.taxId}`);
  }
  if (doc.vendor.address) {
    lines.push(`* **כתובת:** ${doc.vendor.address}`);
  }
  const phones = [
    doc.vendor.phone ? `**טלפון:** ${doc.vendor.phone}` : "",
    doc.vendor.mobile ? `**נייד:** ${doc.vendor.mobile}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  if (phones) {
    lines.push(`* ${phones}`);
  }

  if (doc.customer.name || doc.customer.address) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("### **פרטי הלקוח**");
    if (doc.customer.name) lines.push(`* **לכבוד:** ${doc.customer.name}`);
    if (doc.customer.address)
      lines.push(`* **כתובת:** ${doc.customer.address}`);
  }

  if (doc.lineItems && doc.lineItems.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("### **פירוט השירות / פריטים**");
    lines.push("| תיאור | כמות | מחיר יח' | סה\"כ |");
    lines.push("| :--- | :--- | :--- | :--- |");
    for (const item of doc.lineItems) {
      const unitStr = item.unitPrice
        ? `${item.unitPrice.toFixed(2)} ${doc.financials.currency}`
        : "-";
      const totalStr = item.total
        ? `${item.total.toFixed(2)} ${doc.financials.currency}`
        : "-";
      lines.push(
        `| ${item.description} | ${item.quantity} | ${unitStr} | ${totalStr} |`
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("### **סיכום כספי**");
  if (doc.financials.subtotal > 0) {
    lines.push(
      `* **סה"כ לפני מע"מ:** ${doc.financials.subtotal.toFixed(2)} ${
        doc.financials.currency
      }`
    );
  }
  if (doc.financials.vatAmount > 0) {
    lines.push(
      `* **מע"מ (${
        doc.financials.vatRate || 18
      }%):** ${doc.financials.vatAmount.toFixed(2)} ${doc.financials.currency}`
    );
  }
  lines.push(
    `* **סה"כ לתשלום כולל מע"מ:** **${doc.financials.totalAmount.toFixed(2)} ${
      doc.financials.currency
    }**`
  );
  if (doc.financials.amountInWords) {
    lines.push(`* **סכום במילים:** ${doc.financials.amountInWords}`);
  }
  if (doc.financials.paymentMethod) {
    lines.push(`* **אמצעי תשלום:** ${doc.financials.paymentMethod}`);
  }

  if (doc.keyPoints && doc.keyPoints.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("### **נקודות עיקריות**");
    for (const pt of doc.keyPoints) {
      lines.push(`* ${pt}`);
    }
  }

  if (doc.notesAndFlags && doc.notesAndFlags.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push(`**הערות נוספות:** ${doc.notesAndFlags.join(" • ")}`);
  }

  if (options?.qaHistory && options.qaHistory.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("### **שאלות ובירורים נוספים במסמך**");
    for (const qa of options.qaHistory) {
      lines.push(`* **שאלה (${qa.timestamp}):** ${qa.question}`);
      lines.push(`  **תשובה:** ${qa.answer}`);
    }
  }

  return lines.join("\n");
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDocumentToEmailHtml(
  doc: ExtractedDocumentData,
  options?: {
    title?: string;
    personalNote?: string;
    qaHistory?: Array<{ question: string; answer: string; timestamp: string }>;
    attachedFileNames?: string[];
  }
): string {
  const currency = escapeHtml(doc.financials.currency || 'ש"ח');
  const rowsHtml = (doc.lineItems || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;">${escapeHtml(
          item.description
        )}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;color:#334155;">${escapeHtml(
          item.quantity
        )}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:left;font-family:monospace;color:#475569;">${
          item.unitPrice ? `${item.unitPrice.toFixed(2)} ${currency}` : "—"
        }</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:left;font-family:monospace;font-weight:bold;color:#0f172a;">${
          item.total ? `${item.total.toFixed(2)} ${currency}` : "—"
        }</td>
      </tr>`
    )
    .join("");

  const keyPointsHtml =
    doc.keyPoints && doc.keyPoints.length > 0
      ? `<div style="margin-top:20px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
          <h3 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">05. עיקרי הדברים ותובנות מהמסמך</h3>
          <ul style="margin:0;padding-right:20px;color:#334155;font-size:14px;line-height:1.6;">
            ${doc.keyPoints
              .map((pt) => `<li style="margin-bottom:4px;">${escapeHtml(pt)}</li>`)
              .join("")}
          </ul>
          ${
            doc.notesAndFlags && doc.notesAndFlags.length > 0
              ? `<p style="margin:12px 0 0 0;padding-top:10px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;"><strong>דגשים והערות זיהוי:</strong> ${doc.notesAndFlags
                  .map(escapeHtml)
                  .join(" • ")}</p>`
              : ""
          }
        </div>`
      : "";

  const qaHtml =
    options?.qaHistory && options.qaHistory.length > 0
      ? `<div style="margin-top:20px;padding:16px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
          <h3 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">06. שאלות ובירורים שבוצעו על המסמך</h3>
          ${options.qaHistory
            .map(
              (qa) => `
            <div style="margin-bottom:10px;padding:10px 12px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
              <div style="font-size:12px;font-weight:bold;color:#1e293b;margin-bottom:4px;">שאלה (${escapeHtml(
                qa.timestamp
              )}): ${escapeHtml(qa.question)}</div>
              <div style="font-size:13px;color:#334155;line-height:1.5;">${escapeHtml(
                qa.answer
              )}</div>
            </div>`
            )
            .join("")}
        </div>`
      : "";

  const personalNoteHtml = options?.personalNote?.trim()
    ? `<div style="margin-bottom:20px;padding:14px 16px;background:#eff6ff;border-right:4px solid #1d4ed8;border-radius:6px;color:#1e3a8a;font-size:14px;line-height:1.6;">
        <strong>הערה מצורפת:</strong><br/>
        ${escapeHtml(options.personalNote.trim()).replace(/\n/g, "<br/>")}
      </div>`
    : "";

  const attachmentsFooterHtml =
    options?.attachedFileNames && options.attachedFileNames.length > 0
      ? `<div style="margin-top:20px;padding:12px 16px;background:#f1f5f9;border-radius:6px;font-size:12px;color:#475569;">
          <strong>קבצים מצורפים למייל זה:</strong> ${options.attachedFileNames
            .map(escapeHtml)
            .join(" , ")}
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
</head>
<body dir="rtl" style="margin:0;padding:24px;background-color:#f8fafc;font-family:'Assistant','Rubik',Arial,sans-serif;color:#0f172a;direction:rtl;text-align:right;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="padding:20px 24px;background:#0f172a;color:#ffffff;">
      <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">DocuLens IL — דוח פענוח וניתוח מסמך</div>
      <h1 style="margin:0;font-size:20px;font-weight:bold;color:#ffffff;">${escapeHtml(
        options?.title || doc.vendor.name || doc.documentType || "דוח ניתוח מסמך"
      )}</h1>
    </div>

    <div style="padding:24px;">
      ${personalNoteHtml}

      <!-- Section 1 & 2 Grid -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="vertical-align:top;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
            <h3 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">01. פרטי המסמך והספק</h3>
            <p style="margin:4px 0;font-size:13px;"><strong>סוג המסמך:</strong> ${escapeHtml(
              doc.documentType || "—"
            )}</p>
            <p style="margin:4px 0;font-size:13px;"><strong>מספר מסמך / אסמכתא:</strong> <span style="font-family:monospace;">${escapeHtml(
              doc.documentNumber || "—"
            )}</span></p>
            <p style="margin:4px 0;font-size:13px;"><strong>תאריך:</strong> <span style="font-family:monospace;">${escapeHtml(
              doc.date || "—"
            )}${doc.time ? ` (${escapeHtml(doc.time)})` : ""}</span></p>
            <p style="margin:4px 0;font-size:13px;"><strong>שם העסק / הספק:</strong> ${escapeHtml(
              doc.vendor.name || "—"
            )}</p>
            ${
              doc.vendor.businessField
                ? `<p style="margin:4px 0;font-size:13px;"><strong>תחום עיסוק:</strong> ${escapeHtml(
                    doc.vendor.businessField
                  )}</p>`
                : ""
            }
            ${
              doc.vendor.taxId
                ? `<p style="margin:4px 0;font-size:13px;"><strong>ע"מ / ח.פ:</strong> <span style="font-family:monospace;">${escapeHtml(
                    doc.vendor.taxId
                  )}</span></p>`
                : ""
            }
            ${
              doc.vendor.address
                ? `<p style="margin:4px 0;font-size:13px;"><strong>כתובת ספק:</strong> ${escapeHtml(
                    doc.vendor.address
                  )}</p>`
                : ""
            }
            ${
              doc.vendor.phone || doc.vendor.mobile
                ? `<p style="margin:4px 0;font-size:13px;"><strong>טלפונים:</strong> <span style="font-family:monospace;">${escapeHtml(
                    [doc.vendor.phone, doc.vendor.mobile]
                      .filter(Boolean)
                      .join(" | ")
                  )}</span></p>`
                : ""
            }
          </td>
        </tr>
      </table>

      ${
        doc.customer.name || doc.customer.address
          ? `<div style="margin-bottom:20px;padding:14px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
              <h3 style="margin:0 0 8px 0;font-size:15px;color:#0f172a;">02. פרטי הלקוח (לכבוד)</h3>
              <p style="margin:4px 0;font-size:13px;"><strong>לכבוד:</strong> ${escapeHtml(
                doc.customer.name || "—"
              )}</p>
              <p style="margin:4px 0;font-size:13px;"><strong>כתובת:</strong> ${escapeHtml(
                doc.customer.address || "—"
              )}</p>
            </div>`
          : ""
      }

      <!-- Section 3: Line Items -->
      <div style="margin-bottom:20px;">
        <h3 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">03. פירוט השירות / פריטים</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;font-size:13px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:10px 12px;border-bottom:1px solid #cbd5e1;text-align:right;">תיאור</th>
              <th style="padding:10px 12px;border-bottom:1px solid #cbd5e1;text-align:right;">כמות</th>
              <th style="padding:10px 12px;border-bottom:1px solid #cbd5e1;text-align:left;">מחיר יח'</th>
              <th style="padding:10px 12px;border-bottom:1px solid #cbd5e1;text-align:left;">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748b;">אין שורות פירוט</td></tr>`}
          </tbody>
        </table>
      </div>

      <!-- Section 4: Financial Summary -->
      <div style="padding:16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;">
        <h3 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">04. סיכום כספי</h3>
        <p style="margin:4px 0;font-size:13px;"><strong>סה"כ לפני מע"מ:</strong> <span style="font-family:monospace;">${doc.financials.subtotal.toFixed(
          2
        )} ${currency}</span></p>
        <p style="margin:4px 0;font-size:13px;"><strong>מע"מ (${
          doc.financials.vatRate || 18
        }%):</strong> <span style="font-family:monospace;">${doc.financials.vatAmount.toFixed(
          2
        )} ${currency}</span></p>
        <p style="margin:8px 0 4px 0;font-size:16px;color:#1e3a8a;"><strong>סה"כ לתשלום כולל מע"מ: <span style="font-family:monospace;">${doc.financials.totalAmount.toFixed(
          2
        )} ${currency}</span></strong></p>
        ${
          doc.financials.amountInWords
            ? `<p style="margin:4px 0;font-size:12px;color:#475569;"><strong>סכום במילים:</strong> ${escapeHtml(
                doc.financials.amountInWords
              )}</p>`
            : ""
        }
        ${
          doc.financials.paymentMethod
            ? `<p style="margin:4px 0;font-size:12px;color:#475569;"><strong>אמצעי תשלום:</strong> ${escapeHtml(
                doc.financials.paymentMethod
              )}</p>`
            : ""
        }
      </div>

      ${keyPointsHtml}
      ${qaHtml}
      ${attachmentsFooterHtml}
    </div>
  </div>
</body>
</html>`;
}

