// Ausrüstungs-Status aus dem Original (store.ts) + Badge-Varianten.
export const PSA_STATUS = [
  "Lager",
  "Ausgegeben",
  "Reinigung",
  "In Reparatur",
  "Ausgesondert",
] as const;

export type PsaStatus = (typeof PSA_STATUS)[number];

export function statusVariant(
  status: string | null,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "Ausgegeben":
      return "default";
    case "Ausgesondert":
      return "destructive";
    case "Reinigung":
    case "In Reparatur":
      return "outline";
    default:
      return "secondary";
  }
}
