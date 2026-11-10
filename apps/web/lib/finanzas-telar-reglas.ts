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
  const pedidas = sedesDeLaUrl(sp);
  // Una pantalla que todavía mira de a una sede: con varias elegidas recibe «todas» y la barra lo dice (`aceptaVariasSedes`),
  // nunca la primera de la lista como si fuera la única.
  return pedidas.length === 1 ? pedidas[0]! : SEDE_TODAS;
}

/**
 * Las sedes que pide la URL (Felipe 2026-10-24: «puedo elegir dos en concreto o más»): `?sede=<id>,<id>`. Sin ninguna, o con
 * «todas», la lista vacía, que es «todas». `?ver=` (el selector viejo) gana mientras dure el cambio, como en `sedeDeLaUrl`.
 */
export function sedesDeLaUrl(sp: { sede?: string | null; ver?: string | null }): ClaveSede[] {
  const v = (sp.ver ?? sp.sede ?? "").trim();
  const lista = v.split(",").map((x) => x.trim()).filter((x) => x && x !== SEDE_TODAS);
  return [...new Set(lista)];
}

/**
 * Las sedes que se ven marcadas: solo las que la cuenta puede elegir, y si quedaron TODAS marcadas, la lista vacía («todas»: si
 * eliges una por una hasta completarlas, se marca «Todas» sola). Quien no ve todo, siempre la suya.
 */
export function sedesElegidas(pedidas: readonly ClaveSede[], sedes: readonly SedeTelar[], veTodo: boolean, propia: ClaveSede | null): ClaveSede[] {
  if (!veTodo) return [propia ?? sedes[0]?.clave ?? SEDE_TODAS];
  const validas = sedes.map((s) => s.clave).filter((c) => pedidas.includes(c));
  return validas.length === sedes.length ? [] : validas;
}

/**
 * Tocar una sede en la barra. «Todas» deja solo «todas». Una sede se suma si no estaba y se quita si estaba; si al sumar quedan
 * todas marcadas, o al quitar no queda ninguna, vuelve a «todas». En una pantalla que todavía mira de a una (`deAUna`), tocar una
 * sede la deja sola.
 */
export function alternarSede(actuales: readonly ClaveSede[], tocada: ClaveSede, sedes: readonly SedeTelar[], deAUna = false): ClaveSede[] {
  if (tocada === SEDE_TODAS) return [];
  if (deAUna) return actuales.length === 1 && actuales[0] === tocada ? [] : [tocada];
  const nuevas = actuales.includes(tocada) ? actuales.filter((c) => c !== tocada) : [...actuales, tocada];
  return sedesElegidas(nuevas, sedes, true, null);
}

/** Cómo va en la URL: la lista con comas, en el orden de la barra; vacía, «todas» (que `hrefTelar` no escribe). */
export function claveDeSedes(elegidas: readonly ClaveSede[], sedes: readonly SedeTelar[]): ClaveSede {
  const enOrden = sedes.map((s) => s.clave).filter((c) => elegidas.includes(c));
  return enOrden.length ? enOrden.join(",") : SEDE_TODAS;
}

/**
 * Las pantallas de Finanzas que ya juntan varias sedes (leen `sedesDeLaUrl` y suman lo de cada una). En las demás, la barra
 * elige de a una sede y lo dice; cada submódulo suma su ruta aquí cuando su pantalla junta varias.
 */
export const RUTAS_CON_VARIAS_SEDES: readonly string[] = [
  // Gastos (2026-10-24): lo que trae su sede se filtra y el resumen se pide sede por sede (`gastos-varias-sedes.ts`).
  "/finanzas/gastos",
];

export const aceptaVariasSedes = (ruta: string) => RUTAS_CON_VARIAS_SEDES.some((r) => ruta === r || ruta.startsWith(`${r}/`));

/**
 * Qué filtra de verdad cada pantalla de Finanzas (tarea 26 de «Las 36»). La barra es común, pero no todo se parte por sede ni cambia con el mes: en
 * Campañas decía «Viendo solo Lima» mostrando toda CAYLA, y el mes no movía nada en Cuentas y dinero. Sede y mes siguen viajando en la URL, para
 * la pantalla siguiente; aquí la barra apaga lo que no aplica y lo dice. Una pantalla nueva se declara aquí: `lib/finanzas-telar-reglas.test.ts`
 * falla si un `page.tsx` de Finanzas no está. `redirige`: no dibuja nada, lleva a otra pantalla.
 */
export type AlcanceDeRuta = { sede: "sede" | "toda"; mes: boolean } | { redirige: true };
export const ALCANCE_POR_RUTA: Readonly<Record<string, AlcanceDeRuta>> = {
  "/finanzas": { redirige: true },
  "/finanzas/resumen": { sede: "sede", mes: true },
  "/finanzas/gastos": { sede: "sede", mes: true },
  "/finanzas/cierre": { sede: "sede", mes: true },
  "/finanzas/dinero": { sede: "sede", mes: false },
  "/finanzas/dinero/por-pagar": { sede: "sede", mes: false },
  "/finanzas/dinero/conciliacion": { sede: "toda", mes: false },
  "/finanzas/dinero/claure": { sede: "toda", mes: false },
  "/finanzas/dinero/efectivo": { redirige: true },
  // A SUNAT se le paga por RUC: `fn_impuestos_panel` no recibe sede, y cada cifra es de la empresa entera.
  "/finanzas/impuestos": { sede: "toda", mes: true },
  "/finanzas/impuestos/sire": { sede: "toda", mes: true },
  "/finanzas/reportes": { sede: "sede", mes: true },
  "/finanzas/reportes/balance": { sede: "sede", mes: true },
  "/finanzas/reportes/cuentas": { sede: "toda", mes: true },
  "/finanzas/reportes/flujo": { sede: "toda", mes: true },
  "/finanzas/reportes/patrimonio": { sede: "toda", mes: true },
  "/finanzas/reportes/campanas": { sede: "toda", mes: false },
  "/finanzas/reportes/presupuesto": { redirige: true },
  "/finanzas/reportes/escenarios": { redirige: true },
};

/** Lo que aplica en esta ruta. Una que no se conoce deja la barra como siempre. */
export function alcanceDeRuta(ruta: string): { sede: "sede" | "toda"; mes: boolean } {
  const a = ALCANCE_POR_RUTA[ruta];
  return a && !("redirige" in a) ? a : { sede: "sede", mes: true };
}

/** Lo que la barra dice cuando algo no aplica. `null`: todo aplica. */
export function dichoDelAlcance(a: { sede: "sede" | "toda"; mes: boolean }): string | null {
  if (a.sede === "toda") return a.mes ? "Aquí es toda CAYLA" : "Aquí es toda CAYLA, y no cambia con el mes";
  return a.mes ? null : "No cambia con el mes";
}

/** Lo que dice la barra en Balance general con «Empresa»: la opción sigue (Ganancias la necesita y la sede viaja en la URL), pero aquí es toda CAYLA. */
export const DICHO_EMPRESA_SIN_BALANCE = "Empresa no tiene Balance aparte: aquí es toda CAYLA";
export const esBalanceDeEmpresa = (ruta: string, elegidas: readonly ClaveSede[]): boolean => ruta === "/finanzas/reportes/balance" && elegidas.length === 1 && elegidas[0] === SEDE_EMPRESA;

/** Por qué una sede sale apagada: va en el `title` de cada una, donde la persona pasa el mouse. */
export const MOTIVO_SEDE_NO_APLICA = "Esta pantalla es de toda CAYLA: no se ve por sede";

/**
 * El rótulo delante de las sedes. Es lo único que siempre se ve: la frase larga se esconde en un laptop, y sin esto una pantalla de toda CAYLA o una
 * que no suma varias no lo decía en ninguna parte. `dice`: aclara algo, así que no se quita aunque falte lugar. Tiene que ser corto: un rótulo
 * largo se come el lugar de las sedes (`lib/mesa-telar-ancho.test.ts`).
 */
export function rotuloDeSedes(o: { sedeNoAplica: boolean; variasSinJuntar: boolean; empresaSinBalance?: boolean }): { texto: string; dice: boolean } {
  if (o.sedeNoAplica || o.empresaSinBalance) return { texto: "Toda CAYLA", dice: true };
  if (o.variasSinJuntar) return { texto: "Aquí, de a una", dice: true };
  return { texto: "Ver sede", dice: false };
}

/**
 * Las sedes que se ven marcadas. Si llegan varias a una pantalla que no las suma (eligiste dos en Gastos y pasaste al Resumen), las cifras son de
 * todas (`sedeDeLaUrl`) y la barra marca «Todas», no dos sedes que nada tienen que ver con lo que se muestra.
 */
export function sedesMarcadas(elegidas: readonly ClaveSede[], deAUna: boolean): readonly ClaveSede[] {
  return deAUna && elegidas.length > 1 ? [] : elegidas;
}

/**
 * Lo que se avisa al tocar otra sede donde se ve de a una: la nueva reemplaza a la que estaba y, sin decirlo, parece una falla. `null`: no reemplazó
 * a ninguna, o donde se pueden sumar.
 */
export function avisoDeAUna(o: { deAUna: boolean; elegidas: readonly ClaveSede[]; tocada: ClaveSede; sedes: readonly SedeTelar[] }): string | null {
  if (!o.deAUna || o.tocada === SEDE_TODAS || o.elegidas.length !== 1 || o.elegidas[0] === o.tocada) return null;
  const nombre = o.sedes.find((s) => s.clave === o.tocada)?.nombre;
  return nombre ? `Aquí se ve una sede a la vez. Ahora estás viendo ${nombre}.` : null;
}

/** Estados financieros (antes «Reportes»): su ruta no se renombró (ADR-0585, como `/clientas`). */
export const RUTA_ESTADOS_FINANCIEROS = "/finanzas/reportes";

/**
 * Los hilos de la barra en ESTA pantalla. Quien tiene Estados financieros ve ahí CAYLA entera (ADR-0585: `fn_ve_estados_financieros_de_todo`),
 * aunque en Gastos o en Cuentas y dinero siga viendo solo su sede (esas lecturas no cambiaron). `estados` son los hilos de todas las
 * sedes y la empresa, o `null` si la cuenta ya los ve en todo Finanzas o no tiene el módulo.
 */
export function hilosDeLaRuta(
  ruta: string,
  base: { sedes: SedeTelar[]; veTodo: boolean },
  estados: SedeTelar[] | null
): { sedes: SedeTelar[]; veTodo: boolean } {
  const enEstados = ruta === RUTA_ESTADOS_FINANCIEROS || ruta.startsWith(`${RUTA_ESTADOS_FINANCIEROS}/`);
  return enEstados && estados ? { sedes: estados, veTodo: true } : base;
}

/**
 * La sede y el mes de Finanzas viajan también por el menú lateral: un enlace a otra pantalla de Finanzas, tocado DESDE Finanzas,
 * lleva `?sede=` y `?mes=` tal como están. Fuera de Finanzas, o hacia otro módulo, el enlace queda igual.
 */
export function hrefConSedeYMes(href: string, desde: string, actuales: Iterable<[string, string]>): string {
  const esFinanzas = (r: string) => r === "/finanzas" || r.startsWith("/finanzas/");
  if (!esFinanzas(desde) || !esFinanzas(href) || href.includes("?")) return href;
  const antes = new Map(actuales);
  const p = new URLSearchParams();
  const sede = antes.get("sede");
  const mes = antes.get("mes");
  if (sede && sede !== SEDE_TODAS) p.set("sede", sede);
  if (esMesTelar(mes)) p.set("mes", mes);
  const q = p.toString();
  return q ? `${href}?${q}` : href;
}

/** «Tienda Trujillo» → «Trujillo». */
export const nombreCortoSede = (nombre: string) => nombre.replace(/^Tienda\s+/i, "").trim();

/** El color del hilo de una ubicación. Sale de la ciudad o de su sigla (TRU, AQP, LIM) o del tipo, porque `ubicaciones` no tiene
 *  código; una sede que no se reconoce va en taupe («otra»), nunca con el color de otra sede. Las tiendas de CAYLA se llaman
 *  «Tienda TRU», «Tienda AQP» y «Tienda LIM»: con solo el nombre de la ciudad ninguna se reconocía y todas salían del mismo marrón.
 *  La sigla va entera y suelta (`\b`): «Truco» o «Limpieza» no son ni Trujillo ni Lima. */
export function colorDeSede(u: { nombre: string; tipo?: string | null } | typeof SEDE_EMPRESA): ColorSede {
  if (u === SEDE_EMPRESA) return "emp";
  if (u.tipo === "taller") return "tal";
  // Un almacén no es la tienda de su ciudad: con el color de Lima, el gasto del almacén se leería como de la tienda.
  if (u.tipo === "almacen") return "otra";
  const n = u.nombre.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (n.includes("trujillo") || /\btru\b/.test(n)) return "tru";
  if (n.includes("arequipa") || /\baqp\b/.test(n)) return "aqp";
  if (n.includes("lima") || /\blim\b/.test(n)) return "lim";
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

/** Cierre de mes: su pantalla elige el mes que se CIERRA con la barra común, y el mes en curso nunca se cierra. */
export const RUTA_CIERRE = "/finanzas/cierre";
/** Comparar con SUNAT: se compara el mes que se declara; la propuesta de un mes en curso SUNAT todavía no la arma. */
export const RUTA_SIRE = "/finanzas/impuestos/sire";
const miraMesTerminado = (ruta: string) => [RUTA_CIERRE, RUTA_SIRE].some((r) => ruta === r || ruta.startsWith(`${r}/`));

/** El último mes que la barra deja elegir en esta pantalla: en Cierre y en Comparar con SUNAT, el anterior al de hoy; en las demás, el de hoy. */
export function ultimoMesDeLaRuta(ruta: string, mesDeHoy: string): string {
  if (!miraMesTerminado(ruta)) return mesDeHoy;
  const [a, m] = mesDeHoy.split("-").map(Number) as [number, number];
  return m === 1 ? mesTelar(a - 1, 12) : mesTelar(a, m - 1);
}

/**
 * El mes que mira esta pantalla, el MISMO para la barra y para la página. En Cierre y en Comparar con SUNAT, sin `?mes=` o con uno
 * que todavía no terminó, es el anterior al de hoy (antes la barra decía octubre y la página, septiembre). Las demás, como siempre.
 */
export function mesDeLaRuta(ruta: string, mesUrl: string | null | undefined, mesDeHoy: string): string {
  const tope = ultimoMesDeLaRuta(ruta, mesDeHoy);
  if (!esMesTelar(mesUrl)) return tope;
  return miraMesTerminado(ruta) && mesUrl > tope ? tope : mesUrl;
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

/** «Viendo las cinco sedes juntas» / «Viendo solo Lima» / «Viendo Trujillo y Lima». Acepta una clave o la lista de elegidas. */
export function dichoDeLaSede(elegida: ClaveSede | readonly ClaveSede[], sedes: readonly SedeTelar[]): string {
  const lista = typeof elegida === "string" ? (elegida === SEDE_TODAS ? [] : [elegida]) : elegida;
  if (!lista.length) return sedes.length === 1 ? `Viendo ${sedes[0]!.nombre}` : `Viendo las ${NUMEROS[sedes.length] ?? sedes.length} sedes juntas`;
  const nombres = sedes.filter((s) => lista.includes(s.clave)).map((s) => s.nombre);
  if (!nombres.length) return "Viendo todas las sedes";
  if (nombres.length === 1) return `Viendo solo ${nombres[0]}`;
  return `Viendo ${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
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
