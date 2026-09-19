// Interpreta lo que una persona escribe o pega como color: el código HTML
// (`#c9b79c`, `c9b79c`, `#fa0`) o el RGB (`rgb(201, 183, 156)`, `201 183 156`,
// `201,183,156`). Lo que guarda la base es siempre `#rrggbb` en minúsculas
// (`colores.hex`), así que ambas entradas se normalizan a eso. Devuelve `null`
// si el texto no es un color válido — quien llama decide si avisa o lo ignora.

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^(?:rgb\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/i;

export function parsearColor(texto: string): string | null {
  const limpio = texto.trim();

  const hex = HEX.exec(limpio);
  if (hex) {
    const digitos = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join("") : hex[1];
    return `#${digitos.toLowerCase()}`;
  }

  const rgb = RGB.exec(limpio);
  if (rgb) {
    const canales = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (canales.some((c) => c > 255)) return null;
    return `#${canales.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }

  return null;
}

/** `#c9b79c` → `201, 183, 156`, para mostrar el equivalente RGB junto al hex. */
export function rgbDeHex(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
