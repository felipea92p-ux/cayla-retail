/* ====================================================================
   Existencias ▸ qué lugar mirar en las tarjetas (Felipe, 2026-10-09)

   Las tarjetas traen dos filas chicas por talla, «En el piso» y «Almacén», y las cantidades no se aprecian. El selector
   «Piso · Almacén · Ambos» deja UNA fila con los números grandes del lugar elegido; «Ambos» (de entrada) vuelve a las dos,
   como el «Todas» de un desplegable. Es una forma de VER la lista, no un filtro: no quita prendas ni tallas, y las cifras son
   las mismas LIBRES de la tarjeta (`celdaTarjeta`). Se recuerda por aparato (como el tema), no en la URL.
   En «Piso» y en «Almacén» SÍ se esconde lo que no está ahí (Felipe, 2026-10-09): el color sin una unidad libre en ese lugar, y la
   tarjeta entera si ninguno de sus colores tiene. Lo escondido se cuenta y se dice, con «Ver ambos» para traerlo de vuelta.
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

/** «Piso» o «Almacén»: deja solo los colores con algo LIBRE en ese lugar (alguna talla con `pisoDisponible` o `almacenDisponible` > 0)
 *  y las tarjetas que conservan alguno. Las tallas de un color que queda no se tocan: la tarjeta sigue mostrando su curva, con el 0
 *  donde no hay. «Ambos» (o una sede que no separa): la lista tal cual. `escondidas` = cuántas tarjetas salieron. */
export function tarjetasDelLugar<
  M extends { colores: readonly C[] },
  C extends { tallas: readonly { pisoDisponible?: number | null; almacenDisponible?: number | null }[] },
>(
  modelos: readonly M[],
  lugar: LugarVista,
  separa: boolean
): { modelos: M[]; escondidas: number } {
  if (lugar === "ambos" || !separa) return { modelos: [...modelos], escondidas: 0 };
  const hay = (t: { pisoDisponible?: number | null; almacenDisponible?: number | null }) => ((lugar === "piso" ? t.pisoDisponible : t.almacenDisponible) ?? 0) > 0;
  const quedan: M[] = [];
  for (const m of modelos) {
    const colores = m.colores.filter((c) => c.tallas.some(hay));
    if (colores.length === 0) continue;
    quedan.push(colores.length === m.colores.length ? m : { ...m, colores });
  }
  return { modelos: quedan, escondidas: modelos.length - quedan.length };
}

/** Las palabras del aviso y del vacío de cada lugar: «colgado en el piso» o «guardado en el almacén». */
export function textosDelLugar(lugar: Exclude<LugarVista, "ambos">, escondidas: number): { aviso: string; vacioTitulo: string; vacioFrase: string } {
  const participio = lugar === "piso" ? "colgado" : "guardado";
  const donde = lugar === "piso" ? "en el piso" : "en el almacén";
  return {
    aviso: escondidas === 1 ? `1 prenda sin nada ${participio} no se muestra` : `${escondidas} prendas sin nada ${participio} no se muestran`,
    vacioTitulo: `Nada ${participio} ${donde}`,
    vacioFrase: escondidas === 1 ? `La prenda de esta lista no tiene nada ${participio} ${donde}.` : `Ninguna de las ${escondidas} prendas de esta lista tiene algo ${participio} ${donde}.`,
  };
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
