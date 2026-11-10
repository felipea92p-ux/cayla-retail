/** El id al que apunta el `#…` de la dirección, o `null` si no hay. El servidor no lo ve: esto se llama en el navegador, con `window.location.hash`. */
export function idDeAncla(hash: string): string | null {
  const crudo = hash.replace(/^#/, "");
  if (!crudo) return null;
  try {
    return decodeURIComponent(crudo);
  } catch {
    return crudo;
  }
}
