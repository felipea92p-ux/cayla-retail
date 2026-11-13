/**
 * Las redes de CAYLA, en un solo lugar (Felipe 2026-11-13, propuesta A de docs/maquetas/tienda-redes-2026-11): el pie de todas las
 * páginas y el final del menú del celular las dibujan desde aquí (`components/Redes.tsx`). Una red nueva o un enlace que cambia se toca
 * aquí y llega a los dos lugares.
 *
 * Nunca van arriba ni junto al botón de comprar: llevan a la persona fuera de la tienda, así que salen donde ya terminó lo que vino a hacer.
 * Los enlaces van limpios, sin `?locale=` ni `?hl=`: cada red abre en el idioma de quien la mira.
 */

export type IdRed = "instagram" | "tiktok" | "facebook" | "pinterest" | "youtube" | "spotify";

export type Red = {
  id: IdRed;
  /** El nombre de la red, como la escribe ella misma. */
  nombre: string;
  url: string;
};

/** En el orden en que se dibujan: primero las que más se usan para mirar ropa. */
export const REDES: readonly Red[] = [
  { id: "instagram", nombre: "Instagram", url: "https://www.instagram.com/caylaperu/" },
  { id: "tiktok", nombre: "TikTok", url: "https://www.tiktok.com/@caylaperu" },
  { id: "facebook", nombre: "Facebook", url: "https://www.facebook.com/caylaperu/" },
  { id: "pinterest", nombre: "Pinterest", url: "https://www.pinterest.com/caylaperu/" },
  // La única cuenta que no se llama @caylaperu: YouTube ya tenía ese nombre tomado.
  { id: "youtube", nombre: "YouTube", url: "https://www.youtube.com/@caylaperu3004/videos" },
  // Un perfil de usuario: conviene que tenga al menos una playlist pública, o quien entre ve un perfil vacío.
  { id: "spotify", nombre: "Spotify", url: "https://open.spotify.com/user/caylaperu" },
];

/** Cómo se llama CAYLA en casi todas sus redes. */
export const CUENTA_EN_REDES = "@caylaperu";

/** Lo que oye un lector de pantalla en cada ícono: a dónde lleva y que se abre aparte. */
export const nombreDelEnlace = (red: Red) => `CAYLA en ${red.nombre} (se abre en otra pestaña)`;
