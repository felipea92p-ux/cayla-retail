// PROMETE: la lógica pura de la paleta con todos los colores (`components/ui/PaletaDeColor.tsx`, ADR-0663): pasar de #hex a
// matiz, intensidad y claridad (HSV) y de vuelta, mover el tono con las flechas y llevar una posición del mouse o del dedo al tono.
//
// Por qué HSV y no la carta: la carta tiene los colores que ya existen; esta paleta es para el que todavía no existe (el tono de
// una prenda que llegó con una luz rara, o uno que la foto no leyó bien). Es la paleta de un programa de diseño: el cuadro mueve
// la intensidad (de izquierda a derecha) y la claridad (de arriba abajo) sobre el matiz que elige la barra de abajo.
//
// Lo delicado son los colores sin matiz: un gris, el blanco y el negro tienen intensidad 0 (o claridad 0) y su matiz no existe.
// Si la paleta lo recalculara desde el #hex, la barra saltaría al rojo cada vez que alguien baja hasta el negro o sube al blanco.
// Por eso `hexAHsv` recibe el tono anterior y conserva su matiz (y su intensidad, si la claridad es 0) cuando el #hex no los dice.

/** Matiz en grados [0, 360), intensidad y claridad en [0, 1]. */
export type Hsv = { h: number; s: number; v: number };

/** Lleva un número a [min, max]. Un `NaN` cae al mínimo: la paleta nunca queda en un tono imposible. */
export function recortar(x: number, min = 0, max = 1): number {
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

/** El matiz siempre entre 0 y 360 (sin llegar a 360): 370° es 10°, −10° es 350°. */
function girar(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const g = ((h % 360) + 360) % 360;
  return g >= 360 ? 0 : g;
}

const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * `#c9b79c` → `{ h, s, v }`. Devuelve `null` si no es un #hex de 6 cifras. Con `previo`, un color sin matiz (gris, blanco o negro)
 * conserva el matiz de antes, y uno con claridad 0 (el negro) conserva también la intensidad: así la barra y el punto no saltan.
 */
export function hexAHsv(hex: string, previo?: Hsv): Hsv | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mayor = Math.max(r, g, b);
  const menor = Math.min(r, g, b);
  const d = mayor - menor;
  let h = 0;
  if (d > 0) {
    if (mayor === r) h = ((g - b) / d) % 6;
    else if (mayor === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = girar(h * 60);
  } else if (previo) {
    h = girar(previo.h);
  }
  const v = mayor;
  let s = mayor > 0 ? d / mayor : 0;
  if (v === 0 && previo) s = recortar(previo.s);
  return { h, s, v };
}

/** `{ h, s, v }` → `#rrggbb` en minúsculas, como lo guarda la base (`colores.hex`). */
export function hsvAHex({ h, s, v }: Hsv): string {
  const H = girar(h);
  const S = recortar(s);
  const V = recortar(v);
  const canal = (k: number) => {
    const x = (k + H / 60) % 6;
    return V - V * S * Math.max(0, Math.min(x, 4 - x, 1));
  };
  return `#${[canal(5), canal(3), canal(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** El color puro de un matiz: el fondo del cuadro y la perilla de la barra. */
export function matizPuro(h: number): string {
  return hsvAHex({ h, s: 1, v: 1 });
}

/** Cuánto se mueve el tono con una flecha: un paso fino y, con Shift, uno grande (cinco pasos). */
const PASO_FINO = { intensidad: 0.02, matiz: 2 } as const;
const PASOS_GRANDES = 5;

/**
 * Las flechas sobre el punto del cuadro: ← → mueven la intensidad, ↑ ↓ la claridad (↑ aclara, como el cuadro: arriba es claro).
 * Devuelve `null` si la tecla no es una flecha (la pieza deja pasar la tecla: Tab, Escape…).
 */
export function moverPunto(hsv: Hsv, tecla: string, grande = false): Hsv | null {
  const paso = PASO_FINO.intensidad * (grande ? PASOS_GRANDES : 1);
  switch (tecla) {
    case "ArrowLeft":
      return { ...hsv, s: recortar(hsv.s - paso) };
    case "ArrowRight":
      return { ...hsv, s: recortar(hsv.s + paso) };
    case "ArrowUp":
      return { ...hsv, v: recortar(hsv.v + paso) };
    case "ArrowDown":
      return { ...hsv, v: recortar(hsv.v - paso) };
    default:
      return null;
  }
}

/**
 * Las flechas sobre la perilla de la barra: → y ↑ avanzan el matiz, ← y ↓ lo retroceden. La barra es un círculo: pasado el último
 * rosado vuelve al rojo. Devuelve `null` si la tecla no es una flecha.
 */
export function moverMatiz(hsv: Hsv, tecla: string, grande = false): Hsv | null {
  const paso = PASO_FINO.matiz * (grande ? PASOS_GRANDES : 1);
  if (tecla === "ArrowRight" || tecla === "ArrowUp") return { ...hsv, h: girar(hsv.h + paso) };
  if (tecla === "ArrowLeft" || tecla === "ArrowDown") return { ...hsv, h: girar(hsv.h - paso) };
  return null;
}

/** Dónde tocó el mouse o el dedo en el cuadro (0 a 1 desde su esquina de arriba a la izquierda) → intensidad y claridad. */
export function tonoEnElCuadro(hsv: Hsv, x: number, y: number): Hsv {
  return { ...hsv, s: recortar(x), v: 1 - recortar(y) };
}

/** Dónde tocó en la barra (0 a 1 desde la izquierda) → matiz. El borde derecho es el rojo otra vez: se queda justo antes. */
export function matizEnLaBarra(hsv: Hsv, x: number): Hsv {
  return { ...hsv, h: Math.min(359.9, recortar(x) * 360) };
}

/** El matiz dicho como en la tienda, para quien usa un lector de pantalla («Matiz: azul»). */
export function nombreDelMatiz(h: number): string {
  const g = girar(h);
  if (g < 15 || g >= 345) return "rojo";
  if (g < 45) return "naranja";
  if (g < 70) return "amarillo";
  if (g < 160) return "verde";
  if (g < 200) return "celeste";
  if (g < 255) return "azul";
  if (g < 290) return "morado";
  return "rosado";
}

/** Lo que dice el punto a un lector de pantalla: el #hex y en qué parte del cuadro está. */
export function textoDelPunto(hsv: Hsv): string {
  return `${hsvAHex(hsv).toUpperCase()}, intensidad ${Math.round(recortar(hsv.s) * 100)} %, claridad ${Math.round(recortar(hsv.v) * 100)} %`;
}
