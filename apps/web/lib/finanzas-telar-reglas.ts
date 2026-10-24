// El telar de Finanzas (docs/maquetas/finanzas-telar-2026-10/, Felipe 2026-10-23): la barra común de los seis submódulos.
//
// PROMETE: una sola manera de decir QUÉ SEDE y QUÉ MES se miran en Finanzas, y de llevarlos de un submódulo al otro. La sede vive en
// `?sede=` (todas · empresa · el id de la ubicación) y el mes en `?mes=AAAA-MM`. Antes cada submódulo tenía su selector («Ver»,
// `?ver=`) con su propio valor por defecto: Gastos abría en la sede donde trabaja la persona y el Resumen en todas, así que al
// pasar de uno al otro la sede cambiaba sola.
// ASUME: el alcance real lo decide la base (`fn_ve_finanzas_de_todo`, `fn_gastos_ubicaciones`…): esto solo elige qué pedir. Quien
// no ve todo mira su sede y el parámetro se ignora.
// Lógica pura: se importa desde el servidor (las páginas, el layout) y el cliente (la mesa de mando), y se prueba en
// `finanzas-telar-reglas.test.ts`.

/** «todas», «empresa» o el id de una ubicación. */
export type ClaveSede = string;

export const SEDE_TODAS = "todas";
export const SEDE_EMPRESA = "empresa";

/** El color de cada hilo (`--color-sede-*`, ADR-0169): es color de DATO, como el de un método de pago. */
export type ColorSede = "tru" | "aqp" | "lim" | "tal" | "emp" | "otra";

export type SedeTelar = { clave: ClaveSede; nombre: string; color: ColorSede };

/**
 * La sede que pide la URL, para pasársela al lector de cada pantalla (`leerVer`, `leerVerResumen`…). Mientras dure el cambio,
 * `?ver=` (el selector viejo de cada submódulo) gana: la mesa de mando siempre lo quita al escribir `?sede=`, así que los dos
 * funcionan. Sin ninguno de los dos, «todas»: la barra y la pantalla dicen lo mismo.
 */
export function sedeDeLaUrl(sp: { sede?: string | null; ver?: string | null }): ClaveSede {
  const v = (sp.ver ?? sp.sede ?? "").trim();
  return v || SEDE_TODAS;
}

/** El hilo que se ve elegido. Quien no ve todo, siempre la suya; quien ve todo, la de la URL si existe, o «todas». */
export function sedeElegida(pedida: ClaveSede, sedes: readonly SedeTelar[], veTodo: boolean, propia: ClaveSede | null): ClaveSede {
  if (!veTodo) return propia ?? sedes[0]?.clave ?? SEDE_TODAS;
  if (pedida === SEDE_TODAS) return SEDE_TODAS;
  return sedes.some((s) => s.clave === pedida) ? pedida : SEDE_TODAS;
}

/** «Tienda Trujillo» → «Trujillo». */
export const nombreCortoSede = (nombre: string) => nombre.replace(/^Tienda\s+/i, "").trim();

/** El color del hilo de una ubicación. Sale de la ciudad o del tipo, porque `ubicaciones` no tiene código; una sede que no se
 *  reconoce va en taupe («otra»), nunca con el color de otra sede. */
export function colorDeSede(u: { nombre: string; tipo?: string | null } | typeof SEDE_EMPRESA): ColorSede {
  if (u === SEDE_EMPRESA) return "emp";
  if (u.tipo === "taller") return "tal";
  // Un almacén no es la tienda de su ciudad: con el color de Lima, el gasto del almacén se leería como de la tienda.
  if (u.tipo === "almacen") return "otra";
  const n = u.nombre.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (n.includes("trujillo")) return "tru";
  if (n.includes("arequipa")) return "aqp";
  if (n.includes("lima")) return "lim";
  if (n.includes("taller")) return "tal";
  return "otra";
}

const ORDEN: Record<ColorSede, number> = { tru: 0, aqp: 1, lim: 2, otra: 3, tal: 4, emp: 5 };

/** Los hilos de la barra, en el orden del telar: Trujillo, Arequipa, Lima, (otras tiendas), Taller y Empresa al final. */
export function sedesDelTelar(ubicaciones: readonly { id: string; nombre: string; tipo?: string | null }[], conEmpresa: boolean): SedeTelar[] {
  const lista: SedeTelar[] = ubicaciones.map((u) => ({ clave: u.id, nombre: nombreCortoSede(u.nombre), color: colorDeSede(u) }));
  if (conEmpresa) lista.push({ clave: SEDE_EMPRESA, nombre: "Empresa", color: "emp" });
  return lista.sort((a, b) => ORDEN[a.color] - ORDEN[b.color] || a.nombre.localeCompare(b.nombre, "es"));
}

/** El mes de un día «AAAA-MM-DD», como lo lee Finanzas: «2026-10». */
export const mesDelDia = (dia: string) => dia.slice(0, 7);

/** ¿Es un `?mes=` de Finanzas? Con el cero: «2026-09» (así lo pide `esMes` de Gastos). */
export const esMesTelar = (m: string | null | undefined): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function mesTelar(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

type Params = Iterable<[string, string]>;

/**
 * La dirección de un hilo, del mes o de una pestaña. En la MISMA pantalla se conservan sus demás parámetros (la pestaña abierta,
 * `?tab=`); al cambiar de submódulo solo viajan la sede y el mes, porque los filtros de uno no significan nada en el otro. `ver`
 * se quita siempre: la sede ahora es `?sede=`. «todas» y el mes de hoy no se escriben (la dirección corta es la de siempre).
 */
export function hrefTelar(
  ruta: string,
  actuales: Params,
  cambios: { sede?: ClaveSede; mes?: string },
  opciones: { mismaPantalla: boolean; mesDeHoy: string },
): string {
  const antes = new Map(actuales);
  const p = new URLSearchParams();
  if (opciones.mismaPantalla) for (const [k, v] of antes) if (k !== "ver" && k !== "sede" && k !== "mes") p.set(k, v);
  const sede = cambios.sede ?? antes.get("sede") ?? antes.get("ver") ?? SEDE_TODAS;
  const mes = cambios.mes ?? antes.get("mes") ?? opciones.mesDeHoy;
  if (sede !== SEDE_TODAS) p.set("sede", sede);
  if (esMesTelar(mes) && mes !== opciones.mesDeHoy) p.set("mes", mes);
  const q = p.toString();
  return q ? `${ruta}?${q}` : ruta;
}

/** «Viendo las cinco sedes juntas» / «Viendo solo Lima». */
export function dichoDeLaSede(elegida: ClaveSede, sedes: readonly SedeTelar[]): string {
  if (elegida === SEDE_TODAS) return sedes.length === 1 ? `Viendo ${sedes[0]!.nombre}` : `Viendo las ${NUMEROS[sedes.length] ?? sedes.length} sedes juntas`;
  const s = sedes.find((x) => x.clave === elegida);
  return s ? `Viendo solo ${s.nombre}` : "Viendo todas las sedes";
}

const NUMEROS: Record<number, string> = { 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco", 6: "seis", 7: "siete" };

export type TramoOrillo = { clave: ClaveSede; nombre: string; color: ColorSede; monto: number; pct: number };

/**
 * El orillo: la tira bajo la cabecera que dice cuánto pone cada sede EN ESTA pantalla (lo gastado en Gastos, lo vendido en
 * Resumen…). Cada tramo mide lo suyo; uno en cero conserva un hilo finito (0,4 % del total) para que se vea que existe y se pueda
 * tocar. Las claves que no son de una sede del telar (una ubicación que la cuenta ya no ve) no se dibujan. Sin nada, vacío.
 */
export function tramosDelOrillo(porSede: Readonly<Record<ClaveSede, number>>, sedes: readonly SedeTelar[]): TramoOrillo[] {
  const total = sedes.reduce((a, s) => a + Math.max(0, porSede[s.clave] ?? 0), 0);
  if (total <= 0) return [];
  return sedes.map((s) => {
    const monto = Math.max(0, porSede[s.clave] ?? 0);
    return { clave: s.clave, nombre: s.nombre, color: s.color, monto, pct: Math.round((monto / total) * 100) };
  });
}

/** Lo que la base devuelve por ubicación (`null` = de la empresa) → el mapa del orillo. */
export function porSedeDe(filas: readonly { ubicacionId: string | null; monto: number }[]): Record<ClaveSede, number> {
  const r: Record<ClaveSede, number> = {};
  for (const f of filas) {
    const k = f.ubicacionId ?? SEDE_EMPRESA;
    r[k] = (r[k] ?? 0) + f.monto;
  }
  return r;
}
