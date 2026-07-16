import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn-Konvention — Voraussetzung für die Vendor-Komponenten (@/lib/utils). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
