// Anzeige-Labels und Badge-Varianten für Funkgeräte. Zentral, damit
// Server-Tabellen und Client-Formulare dieselben Werte verwenden.

export const DEVICE_TYPES = ["sepura", "unication", "oelmann", "other"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_STATUS = [
  "active",
  "inactive",
  "maintenance",
  "decommissioned",
] as const;
export type DeviceStatus = (typeof DEVICE_STATUS)[number];

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  sepura: "Sepura",
  unication: "Unication",
  oelmann: "Oelmann",
  other: "Sonstige",
};

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  active: "Aktiv",
  inactive: "Inaktiv",
  maintenance: "Wartung",
  decommissioned: "Ausgesondert",
};

export const DEVICE_STATUS_VARIANTS: Record<
  DeviceStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  active: "default",
  inactive: "secondary",
  maintenance: "outline",
  decommissioned: "destructive",
};
