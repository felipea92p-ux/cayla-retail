// Reglas puras de Insumos (ADR-0133, F3): sin Supabase ni `next/headers`, para que las importen la página (servidor)
// y los componentes (cliente) — mismo patrón que `produccion-reglas.ts`. Lo que toca la base vive en `insumos.ts`.
//
// El saldo NUNCA se guarda: es la suma del ledger `movimientos_insumo` (principio 4). Estas funciones lo derivan con
// las mismas reglas que la base: `v_insumo_saldos` y `registrar_consumo_insumo`
// (supabase/migrations/20260917145000_insumos_taller_reconstruido.sql, 20260917141500_registrar_consumo_insumo.sql).

export type TipoInsumo = "tela" | "avio";
export type UnidadInsumo = "metro" | "unidad" | "kilo" | "cono" | "par" | "docena";
export type TipoMovInsumo = "compra" | "consumo" | "devolucion" | "merma" | "ajuste";

export const TIPOS_INSUMO: { valor: TipoInsumo; etiqueta: string; plural: string; ayuda: string }[] = [
  { valor: "tela", etiqueta: "Tela", plural: "Telas", ayuda: "se compran por metro o por kilo y se cortan por corrida" },
  { valor: "avio", etiqueta: "Avío", plural: "Avíos", ayuda: "botones, cierres, etiquetas e hilo" },
];

/** `corta` acompaña a la cifra («12.5 m»); `larga` es lo que se lee en un selector. */
export const UNIDADES_INSUMO: Record<UnidadInsumo, { corta: string; larga: string; decimales: number }> = {
  metro: { corta: "m", larga: "Metros", decimales: 1 },
  kilo: { corta: "kg", larga: "Kilos", decimales: 2 },
  unidad: { corta: "unid.", larga: "Unidades", decimales: 0 },
  cono: { corta: "conos", larga: "Conos", decimales: 0 },
  par: { corta: "pares", larga: "Pares", decimales: 0 },
  docena: { corta: "doc.", larga: "Docenas", decimales: 0 },
};

/** `12.5 m`, `40 unid.`: los decimales que la unidad admite y no más. */
export function cantidadTexto(n: number, unidad: UnidadInsumo): string {
  const u = UNIDADES_INSUMO[unidad];
  return `${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: u.decimales })} ${u.corta}`;
}

export type MovimientoInsumo = {
  id: string;
  insumoId: string;
  loteId: string | null;
  tipo: TipoMovInsumo;
  cantidad: number;
  produccionId: string | null;
  motivo: string | null;
  creadoEn: string;
};

/** Cuánto mueve el saldo un movimiento: compra y devolución suman, consumo y merma restan, el ajuste trae su
 *  propio signo. Es el `case` de `v_insumo_saldos`. */
export function efectoEnSaldo(tipo: TipoMovInsumo, cantidad: number): number {
  if (tipo === "compra" || tipo === "devolucion") return cantidad;
  if (tipo === "consumo" || tipo === "merma") return -cantidad;
  return cantidad;
}

/** Lo que hay de un insumo: la suma con signo de todo su ledger. */
export function saldoDeInsumo(movs: Pick<MovimientoInsumo, "tipo" | "cantidad">[]): number {
  return movs.reduce((s, m) => s + efectoEnSaldo(m.tipo, m.cantidad), 0);
}

export type LoteInsumo = {
  id: string;
  insumoId: string;
  codigo: string | null;
  /** `aaaa-mm-dd`. */
  ingreso: string;
  creadoEn: string;
  cantidadIngresada: number;
  /** `null` cuando quien mira no ve dinero. */
  costoUnitario: number | null;
  documento: string | null;
  origen: "compra" | "saldo_inicial";
};

/** Lo que queda de un lote, como lo recalcula `registrar_consumo_insumo`: lo ingresado, menos consumo y merma,
 *  más devoluciones. (El movimiento `compra` que abre el lote no se vuelve a sumar: ya es `cantidadIngresada`.) */
export function saldoDeLote(lote: Pick<LoteInsumo, "id" | "cantidadIngresada">, movs: Pick<MovimientoInsumo, "loteId" | "tipo" | "cantidad">[]): number {
  let saldo = lote.cantidadIngresada;
  for (const m of movs) {
    if (m.loteId !== lote.id) continue;
    if (m.tipo === "consumo" || m.tipo === "merma") saldo -= m.cantidad;
    else if (m.tipo === "devolucion") saldo += m.cantidad;
  }
  return saldo;
}

export type LoteConSaldo = LoteInsumo & { saldo: number };

/** El que se descuenta primero: el más antiguo con saldo (PEPS por lote). */
export function loteMasAntiguoConSaldo(lotes: LoteConSaldo[]): LoteConSaldo | null {
  const conSaldo = lotes
    .filter((l) => l.saldo > 0)
    .sort((a, b) => a.ingreso.localeCompare(b.ingreso) || a.creadoEn.localeCompare(b.creadoEn));
  return conSaldo[0] ?? null;
}

export type EstadoInsumo = { tono: "sin_saldo" | "bajo" | "bien" | "sin_minimo"; etiqueta: string };

/** Sin saldo, bajo el mínimo o bien. Un insumo sin mínimo definido no puede estar «bajo»: se dice, no se inventa. */
export function estadoInsumo(saldo: number, minimo: number | null): EstadoInsumo {
  if (saldo <= 0) return { tono: "sin_saldo", etiqueta: "Sin saldo" };
  if (minimo === null) return { tono: "sin_minimo", etiqueta: "Sin mínimo" };
  if (saldo < minimo) return { tono: "bajo", etiqueta: "Bajo mínimo" };
  return { tono: "bien", etiqueta: "Bien" };
}

export type PrevisionConsumo =
  | { ok: true; lote: LoteConSaldo; saldoLote: number; quedaria: number; cantidad: number }
  | { ok: false; motivo: string };

/** Lo que la base va a hacer con un consumo, dicho ANTES de confirmar: de qué lote sale, cuánto le queda. Refleja la
 *  regla de `registrar_consumo_insumo`: sale del lote más antiguo con saldo y **no se parte** entre lotes; si no
 *  alcanza, se rechaza con el saldo exacto de ESE lote. */
export function previsualizarConsumo(lotes: LoteConSaldo[], cantidad: number, nombre: string, unidad: UnidadInsumo): PrevisionConsumo {
  if (!(cantidad > 0)) return { ok: false, motivo: "Indica cuánto se va a descontar." };
  const lote = loteMasAntiguoConSaldo(lotes);
  if (!lote) return { ok: false, motivo: `No hay saldo de ${nombre}. Ingrésalo primero.` };
  if (cantidad > lote.saldo) {
    const t = cantidadTexto(lote.saldo, unidad);
    return { ok: false, motivo: `El lote ${lote.codigo ?? "más antiguo"} solo tiene ${t}. Registra ${t} y luego el resto: sale del siguiente lote, con su propio costo.` };
  }
  return { ok: true, lote, saldoLote: lote.saldo, quedaria: lote.saldo - cantidad, cantidad };
}

/** Consumo semanal medido: lo consumido en los últimos `dias` (28 = 4 semanas) llevado a una semana. `null` si no
 *  hubo consumo en la ventana (no hay con qué estimar cuánto dura, y no se inventa). */
export function consumoSemanal(movs: Pick<MovimientoInsumo, "tipo" | "cantidad" | "creadoEn">[], hoy: string, dias = 28): number | null {
  const desde = new Date(`${hoy}T00:00:00Z`).getTime() - dias * 86_400_000;
  const total = movs
    .filter((m) => (m.tipo === "consumo" || m.tipo === "merma") && new Date(m.creadoEn).getTime() >= desde)
    .reduce((s, m) => s + m.cantidad, 0);
  return total > 0 ? total / (dias / 7) : null;
}

/** Cuántas semanas dura el saldo al ritmo medido. `null` sin ritmo. */
export function semanasDeCobertura(saldo: number, semanal: number | null): number | null {
  if (semanal === null || semanal <= 0) return null;
  return Math.max(0, saldo) / semanal;
}

/** Cuánto vale lo que hay, a costo de cada lote. `null` si no se ven los costos. */
export function capitalEnLotes(lotes: LoteConSaldo[]): number | null {
  if (lotes.some((l) => l.costoUnitario === null)) return null;
  return lotes.reduce((s, l) => s + Math.max(0, l.saldo) * (l.costoUnitario ?? 0), 0);
}

/** Fracción del riel de saldo que se llena: el tope es tres veces el mínimo (o el saldo, si lo pasa) para que el
 *  marcador del mínimo quede a un tercio y se vea de un vistazo si está cerca. */
export function tramoDeSaldo(saldo: number, minimo: number | null): { llenado: number; marcaMinimo: number | null } {
  const tope = Math.max((minimo ?? 0) * 3, saldo, 1);
  return { llenado: Math.min(1, Math.max(0, saldo) / tope), marcaMinimo: minimo === null ? null : Math.min(1, minimo / tope) };
}

/** Texto de un movimiento del libro: qué pasó, sin jerga del ledger. */
export function textoDeMovimiento(m: Pick<MovimientoInsumo, "tipo" | "motivo">): string {
  switch (m.tipo) {
    case "compra":
      return "Entra";
    case "consumo":
      return "Sale al cortar";
    case "devolucion":
      return "Vuelve al lote";
    case "merma":
      return "Merma";
    case "ajuste":
      return m.motivo ? `Ajuste · ${m.motivo}` : "Ajuste";
  }
}
