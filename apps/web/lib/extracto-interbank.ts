// Leer el extracto de Interbank (ADR-0629, Fase B, actividad 2). Las máquinas depositan en Interbank Empresas, y la única forma de saber
// qué llegó es el extracto: este módulo lo convierte en líneas con fecha, monto y de qué máquina parece ser. Lógica pura, sin red ni base:
// el extracto no se guarda (decisión D5 del cuadre: la base guarda lo que se registra, no el estado de cuenta).
//
// Dos formas de traerlo:
//   · el .txt que exporta la banca por internet (columnas fijas, de la línea más nueva a la más vieja);
//   · la tabla de movimientos copiada de la web («07/11/2026  09/11/2026  -  .  Abono QR IBK  S/ 45.90  S/ 2,793.69»).
// Los montos se llevan en CÉNTIMOS ENTEROS: una suma de cientos de pagos en coma flotante se corre un céntimo y el emparejamiento falla.

export type TipoLinea = "qr_izipay" | "lote_izipay" | "lote_vendemas" | "otro";

export type LineaExtracto = {
  /** 0 = la más vieja. El banco lista de la más nueva a la más vieja; aquí van en el orden en que pasaron. */
  orden: number;
  /** Día de la operación, `AAAA-MM-DD`. */
  fecha: string;
  descripcion: string;
  /** En céntimos, con signo: lo que entra es positivo, lo que sale, negativo. */
  centimos: number;
  /** El saldo después de la línea, en céntimos; nulo si la forma de traerlo no lo dice. */
  saldoCentimos: number | null;
  tipo: TipoLinea;
  /** Solo en un lote de Izipay: el código de comercio («PAGO IZIPAY 005839943»), que es de una tienda. */
  codigoComercio: string | null;
};

export type ExtractoLeido = {
  lineas: LineaExtracto[];
  /** Renglones que no se pudieron leer (no son de la tabla), para decirlos, nunca para adivinarlos. */
  ignoradas: number;
  /**
   * Dónde se rompe la cadena de saldos (falta una línea entre dos): la persona tiene que saberlo antes de emparejar. En el borde del
   * período es normal: el banco procesa el sábado el lunes junto con el domingo, y el extracto del mes no trae lo del domingo.
   */
  huecos: { despuesDe: LineaExtracto; antesDe: LineaExtracto; faltan: number; enElBorde: boolean }[];
  desde: string | null;
  hasta: string | null;
};

/** «1,803.60» o «-0.30» → céntimos; nulo si no es un monto con sus dos decimales (no se adivina un monto mal copiado). */
export function centimosDe(texto: string): number | null {
  // Solo se quita el «S/» del comienzo y el signo puede venir pegado o separado («S/ -630.00», «S/-0.05»). Un blanco DENTRO de la cifra
  // («1 803.60») no se borra: es un monto mal copiado y se rechaza (ADR del pegado de celdas: nunca se adivina una cifra).
  const t = texto.trim().replace(/^S\/\s*/i, "");
  const m = /^(-)?\s?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})$/.exec(t);
  if (!m) return null;
  const entero = Number(m[2].replace(/,/g, ""));
  const n = entero * 100 + Number(m[3]);
  return m[1] ? -n : n;
}

/** Qué es la línea, por su descripción. Lo que no se reconoce es «otro»: una transferencia, el ITF, un cargo. */
export function tipoDeLinea(descripcion: string): { tipo: TipoLinea; codigoComercio: string | null } {
  const d = descripcion.toUpperCase().replace(/\s+/g, " ").trim();
  if (/^\.?\s*ABONO QR IBK\b/.test(d)) return { tipo: "qr_izipay", codigoComercio: null };
  const izi = /\bPAGO IZIPAY\s+(\d{6,})/.exec(d);
  if (izi) return { tipo: "lote_izipay", codigoComercio: izi[1] };
  // El banco lo escribe «ESTABLECIMENTOS» en el .txt y «ESTABLECIMIENTOS» en la web.
  if (/\bPAGO ESTABLECIM?I?ENTOS\b/.test(d)) return { tipo: "lote_vendemas", codigoComercio: null };
  return { tipo: "otro", codigoComercio: null };
}

// Columnas del .txt de Interbank (medidas el 2026-11-07 sobre un mes entero: 930 líneas, todas de 183 caracteres).
// Al final de cada renglón van la fecha de operación, la de proceso y el número correlativo del banco: el orden real es (proceso, correlativo).
// El orden del archivo NO lo es: un sábado que el banco procesa el lunes sale mezclado con el domingo (medido en octubre de 2026).
const TXT = { descripcion: [35, 63], cargo: [88, 105], abono: [105, 122], saldo: [122, 139], fecha: [156, 164], proceso: [164, 172], correlativo: [172, 183] } as const;
const corte = (l: string, [a, b]: readonly [number, number]) => l.slice(a, b).trim();

function leerTxt(renglones: string[]): { crudas: Omit<LineaExtracto, "orden">[]; ignoradas: number } {
  const crudas: (Omit<LineaExtracto, "orden"> & { clave: string })[] = [];
  let ignoradas = 0;
  for (const l of renglones) {
    const f = corte(l, TXT.fecha);
    const cargo = corte(l, TXT.cargo);
    const abono = corte(l, TXT.abono);
    const saldo = centimosDe(corte(l, TXT.saldo));
    const monto = abono ? centimosDe(abono) : cargo ? centimosDe(cargo) : null;
    if (!/^\d{8}$/.test(f) || monto === null || (cargo !== "" && abono !== "")) {
      ignoradas++;
      continue;
    }
    const descripcion = corte(l, TXT.descripcion);
    crudas.push({
      fecha: `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`,
      descripcion,
      centimos: abono ? monto : -Math.abs(monto),
      saldoCentimos: saldo,
      ...tipoDeLinea(descripcion),
      clave: `${corte(l, TXT.proceso)}${corte(l, TXT.correlativo)}`,
    });
  }
  // De la más vieja a la más nueva por (proceso, correlativo); un empate exacto conserva el orden inverso del archivo.
  const ordenadas = crudas
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.clave < b.c.clave ? -1 : a.c.clave > b.c.clave ? 1 : b.i - a.i))
    .map(({ c: { clave: _clave, ...resto } }) => resto);
  return { crudas: ordenadas, ignoradas };
}

const FECHA_WEB = /(\d{2})\/(\d{2})\/(\d{4})/g;
const MONTO_WEB = /S\/\s*-?\s*[\d,]+\.\d{2}/g;

function leerTablaWeb(renglones: string[]): { crudas: Omit<LineaExtracto, "orden">[]; ignoradas: number } {
  const crudas: Omit<LineaExtracto, "orden">[] = [];
  let ignoradas = 0;
  for (const l of renglones) {
    const fechas = [...l.matchAll(FECHA_WEB)];
    const montos = [...l.matchAll(MONTO_WEB)];
    if (fechas.length === 0 || montos.length < 1) {
      ignoradas++;
      continue;
    }
    const [, dd, mm, aaaa] = fechas[0];
    const importe = centimosDe(montos[montos.length >= 2 ? montos.length - 2 : 0][0]);
    const saldo = montos.length >= 2 ? centimosDe(montos[montos.length - 1][0]) : null;
    if (importe === null) {
      ignoradas++;
      continue;
    }
    // Lo que queda entre las fechas y los montos es la descripción («-  .  Abono QR IBK», «8009341 PAGO ESTABLECIMIENTOS VISA WEB»).
    const ultimaFecha = fechas[fechas.length - 1];
    const descripcion = l
      .slice((ultimaFecha.index ?? 0) + ultimaFecha[0].length, montos[0].index)
      .replace(/\b\d{6,8}\b\s*/, "")
      .replace(/^[\s\-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    crudas.push({ fecha: `${aaaa}-${mm}-${dd}`, descripcion, centimos: importe, saldoCentimos: saldo, ...tipoDeLinea(descripcion) });
  }
  // La tabla de la web va de la más nueva a la más vieja y no trae el correlativo: se da vuelta.
  return { crudas: crudas.reverse(), ignoradas };
}

/**
 * Lee el extracto, venga del .txt o de la tabla copiada. Las líneas vuelven de la más vieja a la más nueva, y con los saldos se busca
 * si falta alguna: cada saldo tiene que ser el anterior más el monto de la línea. Un hueco no se tapa, se dice.
 */
export function leerExtracto(texto: string): ExtractoLeido {
  const renglones = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const esTxt = renglones.some((l) => l.length >= TXT.fecha[1] && /^\d{8}$/.test(corte(l, TXT.fecha)));
  const { crudas, ignoradas } = esTxt ? leerTxt(renglones) : leerTablaWeb(renglones);
  const lineas = crudas.map((l, orden) => ({ ...l, orden }));
  const huecos: ExtractoLeido["huecos"] = [];
  for (let i = 1; i < lineas.length; i++) {
    const antes = lineas[i - 1].saldoCentimos;
    const despues = lineas[i].saldoCentimos;
    if (antes === null || despues === null) continue;
    const faltan = despues - (antes + lineas[i].centimos);
    if (faltan !== 0) huecos.push({ despuesDe: lineas[i - 1], antesDe: lineas[i], faltan, enElBorde: false });
  }
  const desde = lineas[0]?.fecha ?? null;
  const hasta = lineas[lineas.length - 1]?.fecha ?? null;
  // Un hueco en el primer o el último día del extracto suele ser lo de un día vecino que el banco procesó junto: se dice distinto.
  for (const h of huecos) h.enElBorde = h.antesDe.fecha === hasta || h.despuesDe.fecha === desde;
  return { lineas, ignoradas, huecos, desde, hasta };
}

export type ResumenExtracto = { tipo: TipoLinea; titulo: string; cuantas: number; centimos: number };

const TITULO: Record<TipoLinea, string> = {
  qr_izipay: "QR de Izipay (uno por pago)",
  lote_izipay: "Tarjeta de Izipay (un lote por tienda y día)",
  lote_vendemas: "Vendemás (un lote por día)",
  otro: "Lo demás (no viene de una máquina)",
};

/** Cuántas líneas hay de cada tipo y cuánto suman, en el orden en que se emparejan. */
export function resumenExtracto(lineas: readonly LineaExtracto[]): ResumenExtracto[] {
  return (["qr_izipay", "lote_izipay", "lote_vendemas", "otro"] as const).map((tipo) => {
    const de = lineas.filter((l) => l.tipo === tipo);
    return { tipo, titulo: TITULO[tipo], cuantas: de.length, centimos: de.reduce((s, l) => s + l.centimos, 0) };
  });
}

/** Céntimos → soles con su separador de miles («S/ 1,803.60», «−S/ 0.30»), sin pasar por la coma flotante; con el espacio que no se parte. */
export function solesDeCentimos(c: number): string {
  const signo = c < 0 ? "−" : "";
  const a = Math.abs(c);
  const entero = Math.floor(a / 100).toLocaleString("en-US");
  return `${signo}S/\u00a0${entero}.${String(a % 100).padStart(2, "0")}`;
}
