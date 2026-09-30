import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPorcentaje(valor: number): string {
  return `${(valor || 0).toFixed(1)}%`;
}

export function formatMeses(meses: number | null | undefined): string {
  if (meses === null || meses === undefined || isNaN(meses)) return "—";
  return `${meses.toFixed(1)} meses`;
}
