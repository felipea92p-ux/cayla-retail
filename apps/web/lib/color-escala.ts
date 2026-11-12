// La escala de un color: qué tan claro es (Felipe, 2026-10-02, ADR-0312; una sola fila por familia desde el 2026-11-12).
//
// PROMETE: un único orden para toda pantalla que muestre colores de una familia — la carta de Nuevo producto, Agregar
//   colores, Recibir y Atributos → Colores: del más CLARO al más OSCURO, en UNA sola fila por familia. Es una función del color
//   (su #hex), no de un número guardado: `colores.orden` ya no decide cómo se ve nada, así que un color recién creado cae en su
//   lugar sin que nadie lo ubique.
// ASUME: el hex en sRGB (#RGB o #RRGGBB). Un color sin hex válido no tiene tono: va al final de su familia.
// NO HACE: no decide a qué FAMILIA pertenece un color (eso es dato: `colores.familia_color`) ni toca la base. Tampoco
//   corrige el hex: si un tono está mal puesto, la escala lo muestra mal puesto.
//
// POR QUÉ OKLCH Y NO EL BRILLO DE RGB: el orden anterior usaba brillo 0.299R+0.587G+0.114B sobre el RGB de pantalla, que
// subestima los azules y sobreestima los verdes. OKLab (Ottosson, 2020) está construido para que la «claridad» L coincida con
// lo que ve el ojo.
//
// POR QUÉ YA NO HAY GAMAS (Felipe, 2026-11-12, al recibir ENV-001660: «deberían estar todos en una sola línea iniciando por intensidad
// más suave a más fuerte»): desde ADR-0312, Azul, Verde y Morado se partían en dos filas por matiz («gamas»), cada una de claro a oscuro,
// para que un cian no quedara junto a un ultramar. Con los colores reales la familia salía en tres o cuatro filas (un color fuera de su
// gama abría otra) y nadie sabía por qué. Se eligió leer la fila como una escala de claridad pura, aunque dos vecinos difieran de matiz.

export type ColorEnEscala = { nombre: string; hex: string | null; familiaColor?: string | null };

type Oklch = { L: number; C: number; h: number };


/** El hex como OKLCH: claridad 0–1, intensidad y matiz 0–360°. `null` si no es un #hex válido. */
export function oklchDeHex(hex: string | null | undefined): Oklch | null {
  if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const c = hex.length === 4 ? hex.slice(1).replace(/./g, "$&$&") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return { L, C: Math.hypot(a, bb), h: h < 0 ? h + 360 : h };
}

/**
 * ¿El color es lo bastante claro para que encima se lea tinta oscura? Es el cruce de contraste entre tinta y crema (la claridad
 * OKLab ≈ 0,6): por encima, el ✓ de un color elegido va en tinta; por debajo, en crema. Sin hex válido, se trata como claro.
 * Reemplaza al brillo del RGB, que ponía un ✓ blanco sobre el turquesa (contraste 2,2) y el esmeralda.
 */
export function esColorClaro(hex: string | null | undefined): boolean {
  const o = oklchDeHex(hex);
  return !o || o.L > 0.6;
}

/**
 * Comparador de la carta: del más claro al más oscuro, luego por nombre (para que el orden sea siempre el mismo con la lista al
 * derecho o al revés). Sin hex válido, al final.
 */
export function enEscala(a: ColorEnEscala, b: ColorEnEscala): number {
  const oa = oklchDeHex(a.hex);
  const ob = oklchDeHex(b.hex);
  if (!oa && !ob) return a.nombre.localeCompare(b.nombre, "es");
  if (!oa) return 1;
  if (!ob) return -1;
  return ob.L - oa.L || a.nombre.localeCompare(b.nombre, "es");
}

/**
 * La fila de UNA familia en la carta: sus colores de claro a oscuro (`enEscala`). La ordena ella misma, llegue la lista como llegue, y no toca la
 * lista que recibe: TRES pantallas le pasan los colores como los lee la base (`order by orden, nombre`), sin ordenar —la hoja «Crear la prenda
 * que llegó» de Recibir, la de Insumos (tela y avío) y la de «agregar un color a la orden»— (lo encontró otra sesión el 2026-11-12, cuando la carta
 * todavía partía en gamas y el Verde salía en seis filas). Una precondición que nadie comprueba termina rota por la próxima pantalla.
 */
export function filaDeLaFamilia<C extends ColorEnEscala>(colores: readonly C[]): C[] {
  return [...colores].sort(enEscala);
}
