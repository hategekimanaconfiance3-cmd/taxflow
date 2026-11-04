export interface ManufacturerActivityTarget {
  id: string;
  name: string;
  businessName: string | null;
  clearanceStatus: string;
  isActive: boolean;
  createdAt: Date;
}

export type ManufacturerActivityKind = "production" | "sales" | "imports" | "stock" | "fulfillment" | "account";

export interface ManufacturerActivityEvent {
  key: string;
  kind: ManufacturerActivityKind;
  title: string;
  productName: string;
  quantity: string | null;
  status: string | null;
  occurredAt: Date;
}

export interface ManufacturerActivityView {
  manufacturer: ManufacturerActivityTarget;
  events: ManufacturerActivityEvent[];
}

export type ManufacturingActivityResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
