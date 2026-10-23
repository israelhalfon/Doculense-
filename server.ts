import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const documentExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    documentType: {
      type: Type.STRING,
      description:
        "סוג המסמך בעברית (למשל: חשבונית מס / מקור, קבלה, מסמך PDF, תפריט, פתק בכתב יד, חוזה, דוח אקסל/CSV)",
    },
    category: {
      type: Type.STRING,
      description:
        "קטגוריה ראשית לסינון: invoice (חשבוניות וקבלות), note (פתקים ומסמכי טקסט/PDF), menu (תפריטים ומחירונים), other (אחר)",
    },
    documentNumber: {
      type: Type.STRING,
      description:
        "מספר המסמך, החשבונית או הקבלה (אם קיים, אחרת מחרוזת ריקה)",
    },
    date: {
      type: Type.STRING,
      description:
        "תאריך המסמך כפי שמופיע במסמך או בתמונה (כולל הערה בסוגריים אם כתב היד דו-משמעי, למשל: '20/01/26 (ייתכן 20/10/26)')",
    },
    time: {
      type: Type.STRING,
      description: "שעה אם מופיעה במסמך",
    },
    vendor: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "שם בית העסק, הארגון או הספק" },
        businessField: {
          type: Type.STRING,
          description: "תחום עיסוק או תיאור העסק",
        },
        taxId: {
          type: Type.STRING,
          description: "מספר עוסק מורשה (ע.מ) או ח.פ",
        },
        address: { type: Type.STRING, description: "כתובת העסק" },
        phone: { type: Type.STRING, description: "טלפון קווי" },
        mobile: { type: Type.STRING, description: "טלפון נייד" },
      },
      required: [
        "name",
        "businessField",
        "taxId",
        "address",
        "phone",
        "mobile",
      ],
    },
    customer: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "שם הלקוח / הנמען (לכבוד)" },
        address: {
          type: Type.STRING,
          description:
            "כתובת הלקוח (כולל הערה אם כתב היד אינו חד משמעי)",
        },
      },
      required: ["name", "address"],
    },
    lineItems: {
      type: Type.ARRAY,
      description:
        "פירוט הפריטים, השירותים, המנות בתפריט או הסעיפים במסמך",
      items: {
        type: Type.OBJECT,
        properties: {
          description: {
            type: Type.STRING,
            description: "תיאור הפריט או השירות",
          },
          quantity: {
            type: Type.STRING,
            description: "כמות (למשל '2 יח\\'' או '1')",
          },
          unitPrice: {
            type: Type.NUMBER,
            description: "מחיר ליחידה (0 אם לא צוין)",
          },
          total: {
            type: Type.NUMBER,
            description: 'סה"כ לשורה זו (0 אם לא צוין)',
          },
        },
        required: ["description", "quantity", "unitPrice", "total"],
      },
    },
    financials: {
      type: Type.OBJECT,
      properties: {
        subtotal: {
          type: Type.NUMBER,
          description: 'סכום לפני מע"מ (0 אם לא רלוונטי)',
        },
        vatRate: {
          type: Type.NUMBER,
          description: 'אחוז מע"מ (למשל 18 או 17, 0 אם לא רלוונטי)',
        },
        vatAmount: {
          type: Type.NUMBER,
          description: 'סכום המע"מ בש"ח (0 אם לא רלוונטי)',
        },
        totalAmount: {
          type: Type.NUMBER,
          description: 'סה"כ לתשלום כולל מע"מ (0 אם אין סכום כספי)',
        },
        currency: {
          type: Type.STRING,
          description: 'מטבע (למשל ש"ח, ₪, $, €)',
        },
        amountInWords: {
          type: Type.STRING,
          description: "הסכום במילים אם כתוב במסמך",
        },
        paymentMethod: {
          type: Type.STRING,
          description:
            "אמצעי תשלום (מזומן, אשראי, צ'ק, העברה בנקאית, או לא צוין)",
        },
      },
      required: [
        "subtotal",
        "vatRate",
        "vatAmount",
        "totalAmount",
        "currency",
        "amountInWords",
        "paymentMethod",
      ],
    },
    keyPoints: {
      type: Type.ARRAY,
      description: "נקודות עיקריות ותובנות מתוך המסמך, הקובץ או הפתק",
      items: { type: Type.STRING },
    },
    notesAndFlags: {
      type: Type.ARRAY,
      description:
        "הערות נוספות: קיום חתימה, חותמת, מילים בכתב יד שאינן חד-משמעיות או דגשים מיוחדים",
      items: { type: Type.STRING },
    },
  },
  required: [
    "documentType",
    "category",
    "documentNumber",
    "date",
    "time",
    "vendor",
    "customer",
    "lineItems",
    "financials",
    "keyPoints",
    "notesAndFlags",
  ],
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "35mb" }));

  // Endpoint 1: Structured Document, PDF, Text & Image Deciphering
  app.post("/api/analyze-document", async (req, res) => {
    try {
      const { imageBase64, mimeType, textContent, fileName, customFocus } =
        req.body;

      if (!imageBase64 && !textContent) {
        res
          .status(400)
          .json({ error: "חסרים נתוני קובץ, מסמך או תמונה לפענוח." });
        return;
      }

      const ai = getGenAIClient();

      const systemPrompt = `אתה עוזר מומחה לניתוח ופענוח מסמכים, קובצי PDF, טקסטים ותמונות בעברית (ובשפות נוספות).
תפקידך לקבל קובץ או תמונה (כגון חשבונית מס, קבלה, קובץ PDF, גיליון נתונים, פתק בכתב יד, תפריט, חוזה או קטע טקסט), לפענח בקפדנות גם כתב יד מחובר (רהוט) בעברית, להוציא ממנו את הפרטים המרכזיים (תאריך, סכומים, מע"מ, פרטי ספק, פרטי לקוח, פירוט פריטים ונקודות עיקריות) ולהחזיר אותם במבנה המבוקש בעברית תקנית, נקייה וברורה.
אם שדה מסוים בכתב יד אינו חד-משמעי (למשל תאריך או שם רחוב), ציין את הפענוח הסביר ביותר והוסף הערה מבהירה בסוגריים או בשדה ההערות.`;

      const userPrompt = customFocus
        ? `פענח את המסמך שלפניך (${
            fileName ? `שם קובץ: ${fileName}` : ""
          }) ביסודיות. שים דגש מיוחד על: ${customFocus}`
        : `פענח את המסמך שלפניך (${
            fileName ? `שם קובץ: ${fileName}` : ""
          }) ביסודיות והוצא את כל הפרטים המרכזיים (סוג מסמך, מספר, תאריך, ספק, לקוח, פריטים, סיכום כספי, נקודות עיקריות והערות).`;

      const parts: any[] = [];

      if (textContent) {
        parts.push({
          text: `תוכן הקובץ הטקסטואלי:\n"""\n${textContent}\n"""`,
        });
      } else if (imageBase64 && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        });
      }

      parts.push({ text: userPrompt });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: "application/json",
          responseSchema: documentExtractionSchema,
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error("לא התקבל פלט מהמודל.");
      }

      const parsed = JSON.parse(rawText.trim());
      res.json({ result: parsed });
    } catch (error: any) {
      console.error("Error in /api/analyze-document:", error);
      res.status(500).json({
        error:
          error?.message || "אירעה שגיאה בעת פענוח המסמך מול שרת ה-AI.",
      });
    }
  });

  // Endpoint 2: Follow-up Q&A on a specific document (Image, PDF, or Text)
  app.post("/api/ask-document", async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType,
        textContent,
        question,
        currentExtraction,
      } = req.body;

      if (!question) {
        res.status(400).json({ error: "נא להזין שאלה לבדיקה במסמך." });
        return;
      }

      const ai = getGenAIClient();
      const parts: any[] = [];

      if (textContent) {
        parts.push({
          text: `תוכן המקור של המסמך:\n"""\n${textContent}\n"""`,
        });
      } else if (imageBase64 && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        });
      }

      parts.push({
        text: `בהתבסס על המסמך ועל הנתונים שכבר חולצו ממנו:
${JSON.stringify(currentExtraction || {}, null, 2)}

שאלת המשתמש: ${question}

ענה בעברית בצורה מדויקת, תמציתית וברורה.`,
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          systemInstruction:
            "אתה מומחה לפענוח מסמכים, קובצי PDF וכתבי יד בעברית. ענה על שאלות המשך לגבי המסמך בצורה עניינית, מקצועית ומדויקת.",
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        },
      });

      res.json({ answer: response.text || "לא נמצאה תשובה במסמך." });
    } catch (error: any) {
      console.error("Error in /api/ask-document:", error);
      res.status(500).json({
        error: error?.message || "אירעה שגיאה בעת ביצוע הבירור על המסמך.",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
