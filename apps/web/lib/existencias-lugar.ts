/* ====================================================================
   Existencias ▸ qué lugar mirar en las tarjetas (Felipe, 2026-10-09)

   Las tarjetas traen dos filas chicas por talla, «En el piso» y «Almacén», y las cantidades no se aprecian. El selector
   «Piso · Almacén · Ambos» deja UNA fila con los números grandes del lugar elegido; «Ambos» (de entrada) vuelve a las dos,
   como el «Todas» de un desplegable. Es una forma de VER la lista, no un filtro: no quita prendas ni tallas, y las cifras son
   las mismas LIBRES de la tarjeta (`celdaTarjeta`). Se recuerda por aparato (como el tema), no en la URL.
   ==================================================================== */

export type LugarVista = "ambos" | "piso" | "almacen";

export const LUGARES: readonly { valor: LugarVista; texto: string }[] = [
  { valor: "piso", texto: "Piso" },
  { valor: "almacen", texto: "Almacén" },
  { valor: "ambos", texto: "Ambos" },
];

export const CLAVE_LUGAR_EXISTENCIAS = "cayla-existencias-lugar";

/** Lo guardado en el aparato, o «ambos» si no hay nada (o es un valor viejo que ya no existe). */
export function lugarGuardado(texto: string | null | undefined): LugarVista {
  return texto === "piso" || texto === "almacen" ? texto : "ambos";
}

/** Las filas que dibuja la tabla de la tarjeta. Donde la sede no separa piso y almacén, una sola: «Disponibles». */
export function filasDelLugar(lugar: LugarVista, separa: boolean): { clave: "piso" | "almacen"; texto: string }[] {
  if (!separa) return [{ clave: "piso", texto: "Disponibles" }];
  if (lugar === "piso") return [{ clave: "piso", texto: "En el piso" }];
  if (lugar === "almacen") return [{ clave: "almacen", texto: "Almacén" }];
  return [
    { clave: "piso", texto: "En el piso" },
    { clave: "almacen", texto: "Almacén" },
  ];
}

/** Cuántas unidades LIBRES hay en el piso y en el almacén entre las tallas que deja la lista: la cifra de cada opción. */
export function unidadesPorLugar(filas: readonly { pisoDisponible?: number | null; almacenDisponible?: number | null }[]): { piso: number; almacen: number } {
  let piso = 0;
  let almacen = 0;
  for (const f of filas) {
    piso += Math.max(0, f.pisoDisponible ?? 0);
    almacen += Math.max(0, f.almacenDisponible ?? 0);
  }
  return { piso, almacen };
}

/* --- Lo guardado en el aparato, para `useSyncExternalStore` (como el tema): el servidor y la primera pintura dicen «ambos». --- */

const oyentes = new Set<() => void>();

export function suscribirLugar(avisar: () => void): () => void {
  oyentes.add(avisar);
  // Otra pestaña del mismo aparato lo cambió: esta también.
  const alCambiarOtraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE_LUGAR_EXISTENCIAS || e.key === null) avisar();
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}

export function leerLugar(): LugarVista {
  try {
    return lugarGuardado(window.localStorage.getItem(CLAVE_LUGAR_EXISTENCIAS));
  } catch {
    // Sin almacenamiento (ventana privada): «Ambos», como de entrada.
    return "ambos";
  }
}

export function guardarLugar(v: LugarVista): void {
  try {
    if (v === "ambos") window.localStorage.removeItem(CLAVE_LUGAR_EXISTENCIAS);
    else window.localStorage.setItem(CLAVE_LUGAR_EXISTENCIAS, v);
  } catch {
    // Sin almacenamiento: no se recuerda, y la vista sigue en «ambos».
  }
  oyentes.forEach((o) => o());
}
