import type { NombreIcono } from "../Icono";

/** Una página de ayuda, con lo que promete en una línea: así la nombran el pie y las páginas que no están o que fallaron. */
export type TemaDeAyuda = { href: string; icono: NombreIcono; titulo: string; texto: string };

/**
 * Las páginas de ayuda (revisión «a nivel mundial», 2026-10-16). Lo que dice cada una son hechos que la tienda ya cumple (separar
 * sin pagar, recoger en tienda, cambiar en cualquier tienda CAYLA), con las mismas palabras de sus páginas; el plazo de cambio no va
 * aquí: lo dice su página, que lo lee de la base. Sirven con y sin cuenta (todas son públicas).
 */
export const TEMAS_DE_AYUDA: readonly TemaDeAyuda[] = [
  { href: "/como-separar", icono: "bolsa", titulo: "Cómo separar", texto: "Separas sin pagar en la web y recoges en tu tienda." },
  { href: "/cambios-y-devoluciones", icono: "traslado", titulo: "Cambios y devoluciones", texto: "Igual que en tienda, en cualquier tienda CAYLA." },
  { href: "/tiendas", icono: "tienda", titulo: "Nuestras tiendas", texto: "Dirección, horario, WhatsApp y cómo llegar." },
  // El Libro de Reclamaciones (ADR-0679): la ley pide que se vea en la web. Aquí sale en el pie de toda página (la portada incluida) y en
  // las páginas que no están o que fallaron.
  { href: "/libro-de-reclamaciones", icono: "libro", titulo: "Libro de Reclamaciones", texto: "Deja tu reclamo o queja, sin necesidad de cuenta." },
];
