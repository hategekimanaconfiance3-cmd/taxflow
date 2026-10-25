export interface TickerItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  vatAmount: number;
}

export interface TickerRow {
  id: string;
  businessName: string;
  tinNumber: string | null;
  totalAmount: number;
  vatAmount: number;
  status: string;
  createdAt: string;
  items: TickerItem[];
}
