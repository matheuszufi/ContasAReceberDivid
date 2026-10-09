import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Remove acentos e normaliza para minúsculas, usado para comparações de texto em filtros/buscas
export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function formatInternationalPhone(value) {
  const phone = String(value || '')
  const prefix = phone.trimStart().startsWith('+') ? '+' : ''
  return prefix + phone.replace(/\D/g, '').slice(0, 15)
}
