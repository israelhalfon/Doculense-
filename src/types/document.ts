export interface DocumentVendor {
  name: string;
  businessField: string;
  taxId: string;
  address: string;
  phone: string;
  mobile: string;
}

export interface DocumentCustomer {
  name: string;
  address: string;
}

export interface DocumentLineItem {
  description: string;
  quantity: string;
  unitPrice: number;
  total: number;
}

export interface DocumentFinancials {
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  amountInWords: string;
  paymentMethod: string;
}

export interface ExtractedDocumentData {
  documentType: string;
  category: "invoice" | "note" | "menu" | "other";
  documentNumber: string;
  date: string;
  time: string;
  vendor: DocumentVendor;
  customer: DocumentCustomer;
  lineItems: DocumentLineItem[];
  financials: DocumentFinancials;
  keyPoints: string[];
  notesAndFlags: string[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  createdAt: string;
  imageUrl: string;
  mimeType: string;
  textContent?: string;
  sourceType?: "local" | "drive" | "camera" | "sample";
  isSample?: boolean;
  data: ExtractedDocumentData;
  qaHistory?: Array<{ question: string; answer: string; timestamp: string }>;
}
