// Leer el extracto de Interbank (ADR-0629, Fase B, actividad 2). Las máquinas depositan en Interbank Empresas, y la única forma de saber
// qué llegó es el extracto: este módulo lo convierte en líneas con fecha, monto y de qué máquina parece ser. Lógica pura, sin red ni base:
// aquí solo se LEE. Desde «el banco manda» (ADR-0637) lo leído sí se guarda, línea por línea y tal como lo dijo el banco: lo arma
// `lib/banco-lineas.ts` y lo escribe la base (`cargar_lineas_banco`); la decisión D5 del cuadre («la base no guarda el estado de cuenta») quedó atrás.
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
  // Lo que el banco da para reconocer la MISMA línea en otra descarga. Solo lo trae el .txt; en la tabla pegada de la web va todo vacío.
  /** Día en que el banco la procesó, `AAAA-MM-DD`: un sábado se procesa el lunes. Nulo si no viene. */
  fechaProceso: string | null;
  /** El número correlativo del banco, tal cual (11 cifras). Nulo si no viene. */
  correlativo: string | null;
  /** El código de movimiento del banco (4 cifras: dice si es un QR, un lote, una transferencia, el ITF). Nulo si no viene. */
  codigo: string | null;
  /** El número de operación; el banco pone «-» en las que no lo tienen (un QR), y aquí eso es nulo. */
  operacion: string | null;
  /**
   * Verdadero solo si el banco ya la procesó y su correlativo es el definitivo: (fechaProceso, correlativo) no cambia entre descargas.
   * Falso en las que todavía no procesó (correlativo provisional, que empieza con `0000`) y en la tabla de la web, que no lo trae.
   */
  firme: boolean;
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
  /**
   * De qué cuenta dice ser el archivo: el .txt lo trae en cada renglón (solo cifras). Una sola, si el archivo está sano; vacío en la tabla
   * pegada de la web, que no lo dice. Sirve para no guardar en un banco el extracto de otro (ADR-0637): una línea guardada no se borra.
   */
  cuentas: string[];
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

// ---- Qué es un grupo de líneas, para «El banco dice» (ADR-0637) ---------------------------------------------------------------------
// La base agrupa las líneas guardadas por el código de movimiento del banco y la pantalla le pone nombre de tienda. El código manda cuando
// lo hay (no cambia aunque el banco recorte o reescriba la glosa); un código que no está en la tabla se nombra con la regla de siempre
// (`tipoDeLinea`, por la glosa) y, si tampoco, con lo que escribió el banco. La regla de «qué máquina es» sigue viviendo solo en `tipoDeLinea`.

export type GrupoLinea = { clave: string; nombre: string };

const GRUPO_DE_TIPO: Record<Exclude<TipoLinea, "otro">, GrupoLinea> = {
  qr_izipay: { clave: "qr_izipay", nombre: "QR de Izipay" },
  lote_izipay: { clave: "lote_izipay", nombre: "Tarjeta de Izipay" },
  lote_vendemas: { clave: "lote_vendemas", nombre: "Vendemás" },
};
const TRANSFERENCIA_SALE: GrupoLinea = { clave: "transferencia_sale", nombre: "Transferencias que salieron" };
const TRANSFERENCIA_ENTRA: GrupoLinea = { clave: "transferencia_entra", nombre: "Transferencias que entraron" };
const ITF: GrupoLinea = { clave: "itf", nombre: "ITF, el impuesto del banco por mover plata" };
/** La tabla copiada de la web no trae el código: todas sus líneas llegan en un solo grupo, que no se puede nombrar por una glosa de muestra. */
const SIN_CODIGO: GrupoLinea = { clave: "sin_codigo", nombre: "Copiado de la web del banco (sin tipo)" };

// Los códigos de movimiento de Interbank Empresas (columna 63–67 del .txt), medidos el 2026-11-09 sobre un mes y medio de líneas: cada
// código llevó siempre la misma clase de glosa. El ITF tiene dos (el del cargo y el del abono).
const GRUPO_DE_CODIGO: Record<string, GrupoLinea> = {
  "1402": GRUPO_DE_TIPO.qr_izipay,
  "4225": GRUPO_DE_TIPO.lote_vendemas,
  "4434": GRUPO_DE_TIPO.lote_izipay,
  "6362": TRANSFERENCIA_SALE,
  "6462": TRANSFERENCIA_ENTRA,
  "0310": ITF,
  "0311": ITF,
};

/** El grupo de una línea guardada: por su código de movimiento; si el código no se conoce, por su glosa; si tampoco, la glosa tal cual. */
export function grupoDeLinea(codigo: string | null, glosa: string): GrupoLinea {
  const c = codigo?.trim() ?? "";
  if (c === "") return SIN_CODIGO;
  const conocido = GRUPO_DE_CODIGO[c];
  if (conocido) return conocido;
  const { tipo } = tipoDeLinea(glosa);
  if (tipo !== "otro") return GRUPO_DE_TIPO[tipo];
  return { clave: `codigo:${c}`, nombre: glosa.replace(/\s+/g, " ").trim() || `Movimiento ${c} del banco` };
}

// Columnas del .txt de Interbank (medidas el 2026-11-07 sobre un mes entero, 930 líneas, y otra vez el 2026-11-09 sobre 1,136: todas de
// 183 caracteres). Antes de la descripción va el número de la cuenta (el mismo en todos los renglones); tras ella, el código de movimiento
// y el número de operación; al final de cada renglón, la fecha de operación, la de proceso y el número correlativo del banco.
//
// EL ORDEN (regla medida el 2026-11-09; con ella la cadena de saldos de las 1,136 líneas cierra sin un solo hueco):
//   1. El orden del archivo NO es el real: un sábado que el banco procesa el lunes sale mezclado con el domingo (medido en octubre de 2026).
//   2. Una línea FIRME es la que el banco ya procesó. Su correlativo es definitivo: `00` + año (2) + día del año de la fecha de proceso (3)
//      + secuencia (4). Las firmes van por (proceso, correlativo), que sí es el orden en que pasaron.
//   3. Lo del fin de semana que el banco aún no procesó llega con la fecha de proceso del día de la descarga y un correlativo PROVISIONAL
//      (empieza con `0000`) que no respeta el orden: un lote que por saldo va primero recibe un número mayor que los pagos que le siguen.
//      Ordenarlas por ese número dejaba tres huecos falsos. Las provisionales van AL FINAL (son lo más nuevo del archivo), en el orden
//      inverso del archivo, que dentro de ese bloque sí es el real. Lo mismo vale para una línea sin correlativo legible.
//   4. Verificación y reparación: si aun así la cadena de saldos se rompe en el bloque provisional, se rearma siguiéndola (después de un
//      saldo va la línea cuyo saldo menos su monto es ese saldo), partiendo del saldo de la última firme. Solo se acepta si la cadena
//      alcanza a TODAS las líneas del bloque; si no (falta una de verdad), queda el orden inverso del archivo y el hueco se dice.
const TXT = {
  cuenta: [12, 35],
  descripcion: [35, 63],
  codigo: [63, 67],
  operacion: [68, 75],
  cargo: [88, 105],
  abono: [105, 122],
  saldo: [122, 139],
  fecha: [156, 164],
  proceso: [164, 172],
  correlativo: [172, 183],
} as const;
const corte = (l: string, [a, b]: readonly [number, number]) => l.slice(a, b).trim();
const aFecha = (f: string) => `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;

type Cruda = Omit<LineaExtracto, "orden">;

/**
 * Rearma un bloque siguiendo la cadena de saldos: cada línea une el saldo de antes (su saldo menos su monto) con su saldo, y se camina
 * de saldo en saldo usando cada línea una sola vez. Si dos líneas parten del mismo saldo se toma primero la que el bloque trae antes; si
 * por ahí el camino se cierra antes de usarlas todas, se retrocede y el rodeo queda intercalado (es un camino de Euler: no se prueban
 * combinaciones). `desde` es el saldo del que hay que partir; nulo = el saldo del que sale una línea más de las que llegan.
 * Devuelve nulo si no hay UNA cadena que use todas las líneas (se comprueba al final, línea por línea): nunca un orden a medias.
 */
function seguirCadena(bloque: readonly Cruda[], desde: number | null): Cruda[] | null {
  const salen = new Map<number, { l: Cruda; saldo: number }[]>();
  const llegan = new Map<number, number>();
  let primero: number | null = null;
  for (const l of bloque) {
    if (l.saldoCentimos === null) return null;
    const antes = l.saldoCentimos - l.centimos;
    primero ??= antes;
    salen.set(antes, [...(salen.get(antes) ?? []), { l, saldo: l.saldoCentimos }]);
    llegan.set(l.saldoCentimos, (llegan.get(l.saldoCentimos) ?? 0) + 1);
  }
  const arranque = desde ?? [...salen].find(([saldo, ls]) => ls.length > (llegan.get(saldo) ?? 0))?.[0] ?? primero;
  if (arranque === null) return null;
  const pila: { saldo: number; por: Cruda | null }[] = [{ saldo: arranque, por: null }];
  const alReves: Cruda[] = [];
  while (pila.length > 0) {
    const tope = pila[pila.length - 1];
    const sigue = salen.get(tope.saldo)?.shift();
    if (sigue) {
      pila.push({ saldo: sigue.saldo, por: sigue.l });
    } else {
      pila.pop();
      if (tope.por) alReves.push(tope.por);
    }
  }
  if (alReves.length !== bloque.length) return null;
  // Haberlas usado todas no basta: si dos parten del mismo saldo y falta la que volvía a él, el recorrido las usa igual, pero sueltas y
  // con la más nueva primero. Solo vale si cada línea parte del saldo en que dejó la cuenta la anterior.
  const cadena = alReves.reverse();
  let saldo = arranque;
  for (const l of cadena) {
    if (l.saldoCentimos === null || l.saldoCentimos - l.centimos !== saldo) return null;
    saldo = l.saldoCentimos;
  }
  return cadena;
}

/** El bloque provisional, que llega en el orden inverso del archivo: se deja así si su cadena de saldos cierra; si no, se intenta rearmar. */
function ordenarProvisionales(bloque: Cruda[], saldoFirme: number | null): Cruda[] {
  const rota = (antes: number | null, l: Cruda) => antes !== null && l.saldoCentimos !== null && l.saldoCentimos - l.centimos !== antes;
  const rotaAdentro = bloque.some((l, k) => k > 0 && rota(bloque[k - 1].saldoCentimos, l));
  const rotaEnLaUnion = bloque.length > 0 && rota(saldoFirme, bloque[0]);
  if (!rotaAdentro && !rotaEnLaUnion) return bloque;
  // Primero, la cadena que empalma con la última firme. Si no existe pero el bloque está desordenado por dentro, la que cierre por dentro:
  // el hueco de la unión (lo que falta entre lo firme y lo provisional) se dirá igual, una sola vez.
  const empalmada = saldoFirme !== null ? seguirCadena(bloque, saldoFirme) : null;
  return empalmada ?? (rotaAdentro ? seguirCadena(bloque, null) : null) ?? bloque;
}

function leerTxt(renglones: string[]): { crudas: Cruda[]; ignoradas: number; cuentas: string[] } {
  const firmes: { c: Cruda; i: number; clave: string }[] = [];
  const provisionales: Cruda[] = [];
  const cuentas = new Set<string>();
  let ignoradas = 0;
  renglones.forEach((l, i) => {
    const f = corte(l, TXT.fecha);
    const cargo = corte(l, TXT.cargo);
    const abono = corte(l, TXT.abono);
    const saldo = centimosDe(corte(l, TXT.saldo));
    const monto = abono ? centimosDe(abono) : cargo ? centimosDe(cargo) : null;
    // Un renglón de 0.00 no mueve plata (ni el saldo): no es un movimiento, y la base no guarda una línea sin monto.
    if (!/^\d{8}$/.test(f) || monto === null || monto === 0 || (cargo !== "" && abono !== "")) {
      ignoradas++;
      return;
    }
    // La cuenta, solo sus cifras (el banco la puede traer con guiones). Un renglón sin cuenta legible no suma ninguna: si ninguno la
    // trae, la lista queda vacía y quien guarda lo dice.
    const cuenta = (corte(l, TXT.cuenta).match(/\d/g) ?? []).join("");
    if (cuenta !== "") cuentas.add(cuenta);
    const descripcion = corte(l, TXT.descripcion);
    const proceso = corte(l, TXT.proceso);
    const correlativo = corte(l, TXT.correlativo);
    const codigo = corte(l, TXT.codigo);
    const operacion = corte(l, TXT.operacion);
    const fechaProceso = /^\d{8}$/.test(proceso) ? aFecha(proceso) : null;
    const firme = fechaProceso !== null && /^\d{11}$/.test(correlativo) && !correlativo.startsWith("0000");
    const c: Cruda = {
      fecha: aFecha(f),
      descripcion,
      centimos: abono ? monto : -Math.abs(monto),
      saldoCentimos: saldo,
      ...tipoDeLinea(descripcion),
      fechaProceso,
      correlativo: correlativo || null,
      codigo: codigo || null,
      operacion: operacion === "" || operacion === "-" ? null : operacion,
      firme,
    };
    if (firme) firmes.push({ c, i, clave: `${proceso}${correlativo}` });
    else provisionales.push(c);
  });
  // Las firmes, de la más vieja a la más nueva por (proceso, correlativo); un empate exacto conserva el orden inverso del archivo.
  const ordenadas = firmes.sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : b.i - a.i)).map(({ c }) => c);
  const saldoFirme = ordenadas[ordenadas.length - 1]?.saldoCentimos ?? null;
  return { crudas: [...ordenadas, ...ordenarProvisionales(provisionales.reverse(), saldoFirme)], ignoradas, cuentas: [...cuentas] };
}

const FECHA_WEB = /(\d{2})\/(\d{2})\/(\d{4})/g;
const MONTO_WEB = /S\/\s*-?\s*[\d,]+\.\d{2}/g;

function leerTablaWeb(renglones: string[]): { crudas: Cruda[]; ignoradas: number; cuentas: string[] } {
  const crudas: Cruda[] = [];
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
    // Igual que en el .txt: un renglón de 0.00 no es un movimiento.
    if (importe === null || importe === 0) {
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
    crudas.push({
      fecha: `${aaaa}-${mm}-${dd}`,
      descripcion,
      centimos: importe,
      saldoCentimos: saldo,
      ...tipoDeLinea(descripcion),
      // La tabla pegada no trae el correlativo y lo demás no se lee de ella: ninguna de sus líneas es firme.
      fechaProceso: null,
      correlativo: null,
      codigo: null,
      operacion: null,
      firme: false,
    });
  }
  // La tabla de la web va de la más nueva a la más vieja y no trae el correlativo: se da vuelta.
  return { crudas: crudas.reverse(), ignoradas, cuentas: [] };
}

/**
 * Lee el extracto, venga del .txt o de la tabla copiada. Las líneas vuelven de la más vieja a la más nueva, y con los saldos se busca
 * si falta alguna: cada saldo tiene que ser el anterior más el monto de la línea. Un hueco no se tapa, se dice.
 */
export function leerExtracto(texto: string): ExtractoLeido {
  const renglones = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const esTxt = renglones.some((l) => l.length >= TXT.fecha[1] && /^\d{8}$/.test(corte(l, TXT.fecha)));
  const { crudas, ignoradas, cuentas } = esTxt ? leerTxt(renglones) : leerTablaWeb(renglones);
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
  // Un hueco en el primer o el último día del extracto suele ser lo de un día vecino que el banco procesó junto: se dice distinto. El banco
  // filtra el archivo por fecha de OPERACIÓN, pero procesa por lotes: el sábado 31-oct se procesó el lunes 2-nov con correlativos
  // intercalados, y un archivo que empieza el 1-nov trae el lote del 2-nov sin esas líneas. Los huecos que deja caen dentro de ese
  // primer lote (y en su empalme con el día siguiente), aunque sus líneas digan 2-nov: también son el borde. Lo mismo al final con el
  // último lote firme, si se procesó después del último día que trae el archivo.
  const procesoPrimero = lineas[0]?.firme ? lineas[0].fechaProceso : null;
  const firmes = lineas.filter((l) => l.firme);
  const procesoUltimo = firmes[firmes.length - 1]?.fechaProceso ?? null;
  const loteFinalCortado = procesoUltimo !== null && hasta !== null && procesoUltimo > hasta;
  for (const h of huecos) {
    h.enElBorde =
      h.antesDe.fecha === hasta ||
      h.despuesDe.fecha === desde ||
      (procesoPrimero !== null && h.despuesDe.firme && h.despuesDe.fechaProceso === procesoPrimero) ||
      (loteFinalCortado && h.antesDe.firme && h.antesDe.fechaProceso === procesoUltimo);
  }
  return { lineas, ignoradas, huecos, desde, hasta, cuentas };
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
