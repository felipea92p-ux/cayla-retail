import { aCentimos, leerDinero, type LecturaDinero } from "./modelo-nuevo-reglas";

// «Fases y quién las hace», el bloque nuevo de la hoja «Nueva orden de producción» (ADR-0400, decisiones 2, 3 y 5; actividad 2): las reglas
// puras. Sin React ni Supabase, para que las importen la página (servidor) y el formulario (cliente), y para que la pantalla DIGA qué falta con
// las mismas reglas que la base va a aplicar.
//
// LA BASE MANDA: `fn_produccion_fases_normalizar` (migración 20261014154000) valida todo otra vez y rechaza con un `hint` estable. Acá solo se
// adelanta, en la pantalla, lo que ya se sabe. Regla del repo (CLAUDE.md «Guía de foco», punto 5): `problemasFases` NO agrega reglas de negocio;
// sale de lo que la base rechaza, y `orden-fases-reglas.test.ts` lee la migración y exige que cada `hint` exista allá.
//
// CONTRATO
//   PROMETE: que si `problemasFases` no dice nada, `fasesParaRpc` arma un `p_fases` que `fn_produccion_fases_normalizar` acepta (la espina
//            completa, cada fase una vez, posición solo en bordado y estampado, y un servicio con proveedor vigente, tarifa y fecha válidas); y
//            al revés: si la base lo aceptaría, acá no se marca ninguna falta. Que la secuencia de la ruta es la de `fn_fase_secuencia`.
//   ASUME:   los números llegan como TEXTO (lo que hay en las cajas) y se leen ESTRICTO, como el precio de esta misma hoja (`leerDinero`:
//            solo dígitos y un punto; «4,50» se explica, no se adivina). `hoy` es `aaaa-mm-dd` de Lima (`hoyLima()`), como `fn_hoy_lima()`.
//   NO HACE: no escribe en la base, no decide cuándo se puede abrir la orden (eso lo suma el formulario con el resto de faltas) y no bloquea por
//            la cantidad mínima del servicio: eso es un AVISO (`avisoMinimo`), decisión 5 del ADR-0400.

export type FaseClave =
  | "ploteo"
  | "corte"
  | "habilitado"
  | "costura"
  | "ojales_botones"
  | "limpieza_revision"
  | "planchado"
  | "etiquetado_embolsado"
  | "acabado"
  | "bordado"
  | "estampado"
  | "lavanderia";
export type Quien = "taller" | "servicio";
/** Solo bordado y estampado: sobre la pieza cortada (antes de costura) o sobre la prenda armada (después). */
export type Posicion = "pieza" | "prenda";

/** La ruta a la que pertenece una fase (ADR-0400 act. k y l): la anterior (corte · costura · acabado), la nueva (Ploteo · Corte · Habilitado · Costura · … · Etiquetar y embolsar) o las dos. */
export type RutaDeFase = "anterior" | "nueva" | "ambas";

export type FaseDelCatalogo = {
  clave: FaseClave;
  nombre: string;
  /** La espina de su ruta: va en toda orden de esa ruta, no se apaga. */
  siempre: boolean;
  /** Elige si va sobre pieza o sobre prenda (bordado y estampado). */
  posicionable: boolean;
  /** En lenguaje de tienda, para el pie de la fila. */
  ayuda: string;
  /** De qué ruta es. `acabado` solo de la anterior; las seis nuevas solo de la nueva. */
  ruta: RutaDeFase;
  /** Una fase que se MARCA «hecha» con un toque en vez de contar prendas (hoy solo Ploteo): la misma regla que `fn_fase_es_hito` de la base (lo prueba `orden-fases-reglas.test.ts`). */
  hito: boolean;
};

/** Las fases, fijas en código (ADR-0400: una lista que cambia una vez al año no necesita pantalla). El orden de la RUTA lo da `secuenciaDe`. */
export const FASES: ReadonlyArray<FaseDelCatalogo> = [
  { clave: "ploteo", nombre: "Ploteo", siempre: true, posicionable: false, ayuda: "La marcada a escala real: define cuánta tela comprar", ruta: "nueva", hito: true },
  { clave: "corte", nombre: "Corte", siempre: true, posicionable: false, ayuda: "Trazo, tendido y corte", ruta: "ambas", hito: false },
  { clave: "habilitado", nombre: "Habilitado", siempre: true, posicionable: false, ayuda: "Preparar lo cortado para coser: numerar, armar paquetes, sumar avíos y el corte menor de Tricotex", ruta: "nueva", hito: false },
  { clave: "costura", nombre: "Costura", siempre: true, posicionable: false, ayuda: "Armar la prenda: costura, ojal y botón", ruta: "ambas", hito: false },
  { clave: "ojales_botones", nombre: "Ojales y botones", siempre: false, posicionable: false, ayuda: "Solo si el modelo los lleva", ruta: "nueva", hito: false },
  { clave: "limpieza_revision", nombre: "Limpiar hilos y revisar", siempre: true, posicionable: false, ayuda: "Quitar hilos sobrantes y revisar cada prenda", ruta: "nueva", hito: false },
  { clave: "planchado", nombre: "Planchado", siempre: true, posicionable: false, ayuda: "Planchar la prenda terminada", ruta: "nueva", hito: false },
  { clave: "etiquetado_embolsado", nombre: "Etiquetar y embolsar", siempre: true, posicionable: false, ayuda: "Etiqueta, bolsa y lista para despachar", ruta: "nueva", hito: false },
  { clave: "acabado", nombre: "Acabado", siempre: true, posicionable: false, ayuda: "Revisión, planchado, etiqueta y embolsado", ruta: "anterior", hito: false },
  { clave: "bordado", nombre: "Bordado", siempre: false, posicionable: true, ayuda: "Sobre la pieza cortada o sobre la prenda armada", ruta: "ambas", hito: false },
  { clave: "estampado", nombre: "Estampado", siempre: false, posicionable: true, ayuda: "Sobre la pieza cortada o sobre la prenda armada", ruta: "ambas", hito: false },
  { clave: "lavanderia", nombre: "Lavandería", siempre: false, posicionable: false, ayuda: "Lavado o teñido de la prenda armada, antes del acabado", ruta: "ambas", hito: false },
];

/**
 * Las fases que la hoja «Nueva orden» ofrece HOY. Mientras la hoja siga abriendo la ruta anterior (la web desplegada y la base aceptan las dos; ADR-0400 act. l),
 * las fases solo de la ruta nueva no se ofrecen: la actividad que rehace la hoja cambia esta línea.
 */
export const FASES_DE_LA_HOJA: ReadonlyArray<FaseDelCatalogo> = FASES.filter((f) => f.ruta !== "nueva");

const POR_CLAVE = new Map(FASES.map((f) => [f.clave, f] as const));

/** La fase del catálogo por su clave (su nombre, si es de la espina, si elige posición). */
export function faseDe(clave: FaseClave): FaseDelCatalogo {
  return POR_CLAVE.get(clave) ?? FASES[0];
}

/**
 * El lugar de la fase en la ruta, idéntico a `fn_fase_secuencia`: ploteo → corte → habilitado → [bordado/estampado sobre pieza] → costura → ojales y botones →
 * [bordado/estampado sobre prenda] → [lavandería] → limpiar y revisar → acabado (ruta anterior) → planchado → etiquetar y embolsar. Un bordado o un estampado sin posición no tiene lugar (null), igual que en la base.
 */
export function secuenciaDe(clave: FaseClave, posicion: Posicion | null): number | null {
  switch (clave) {
    case "ploteo":
      return 5;
    case "corte":
      return 10;
    case "habilitado":
      return 15;
    case "bordado":
      return posicion === "pieza" ? 20 : posicion === "prenda" ? 40 : null;
    case "estampado":
      return posicion === "pieza" ? 25 : posicion === "prenda" ? 45 : null;
    case "costura":
      return 30;
    case "ojales_botones":
      return 35;
    case "lavanderia":
      return 50;
    case "limpieza_revision":
      return 55;
    case "acabado":
      return 60;
    case "planchado":
      return 65;
    case "etiquetado_embolsado":
      return 70;
  }
}

/** Una fila del bloque. Los números van como TEXTO, igual que las cajas; `posicion` solo cuenta en bordado y estampado. */
export type FaseBorrador = {
  clave: FaseClave;
  encendida: boolean;
  quien: Quien;
  proveedorId: string | null;
  tarifa: string;
  fijo: string;
  minimo: string;
  fechaPrometida: string;
  posicion: Posicion | null;
};

/** Cómo nace el bloque: la espina encendida y en el Taller; bordado y estampado apagados, sobre pieza; lavandería apagada. En el orden de la ruta. */
export function fasesIniciales(): FaseBorrador[] {
  return ordenarFases(
    FASES_DE_LA_HOJA.map((f) => ({
      clave: f.clave,
      encendida: f.siempre,
      quien: "taller",
      proveedorId: null,
      tarifa: "",
      fijo: "",
      minimo: "",
      fechaPrometida: "",
      posicion: f.posicionable ? "pieza" : null,
    }))
  );
}

/** Las fases en el orden de la ruta. Un bordado o estampado sin posición se acomoda como si fuera sobre pieza (solo para dibujarlo: la base lo rechaza). */
export function ordenarFases<F extends Pick<FaseBorrador, "clave" | "posicion">>(fases: readonly F[]): F[] {
  const lugar = (f: F) => secuenciaDe(f.clave, f.posicion) ?? secuenciaDe(f.clave, "pieza") ?? 0;
  return [...fases].sort((a, b) => lugar(a) - lugar(b));
}

/** Una fase de la espina viaja siempre, aunque la fila diga `encendida: false`: la base exige corte, costura y acabado (`fases_espina`) y la hoja no las apaga. */
export function faseViaja(f: Pick<FaseBorrador, "clave" | "encendida">): boolean {
  return f.encendida || faseDe(f.clave).siempre;
}

/** Las fases que van a la orden (la espina y las encendidas), cada clave UNA vez (la primera fila gana, como `fase_repetida` exige), en el orden de la ruta. */
export function fasesEncendidas(fases: readonly FaseBorrador[]): FaseBorrador[] {
  const vistas = new Set<FaseClave>();
  const unicas: FaseBorrador[] = [];
  for (const f of fases) {
    if (vistas.has(f.clave) || !faseViaja(f)) continue;
    vistas.add(f.clave);
    unicas.push(f);
  }
  return ordenarFases(unicas);
}

// ---------- La lista de precios del proveedor (sugiere; la fase copia y congela) ----------

/** Una fila de `proveedor_tarifas`. `vigenteDesde` es `aaaa-mm-dd`. */
export type TarifaDeLista = { proveedorId: string; faseClave: FaseClave; tarifa: number; minimo: number | null; fijo: number; vigenteDesde: string };

/** La tarifa que la base copiaría si la caja va vacía: la del proveedor para esa fase, vigente a `hoy` (`vigente_desde <= hoy`) y la más reciente. */
export function tarifaSugerida(proveedorId: string | null, clave: FaseClave, lista: readonly TarifaDeLista[], hoy: string): TarifaDeLista | null {
  if (!proveedorId) return null;
  let mejor: TarifaDeLista | null = null;
  for (const t of lista) {
    if (t.proveedorId !== proveedorId || t.faseClave !== clave || t.vigenteDesde > hoy) continue;
    if (!mejor || t.vigenteDesde > mejor.vigenteDesde) mejor = t;
  }
  return mejor;
}

// ---------- Los proveedores que pueden hacer una fase ----------

export type ProveedorServicio = { id: string; nombre: string; rubro: string; activo: boolean };

/** Los rubros que la base NO acepta como servicio (`fase_proveedor_rubro`): quien vende tela o avíos no cose ni borda. */
export const RUBROS_QUE_NO_SIRVEN: ReadonlyArray<string> = ["tela", "avios"];

/** Los que se ofrecen en el combo: activos y de un rubro de servicio (maquila u otro). */
export function proveedoresQueSirven<P extends ProveedorServicio>(proveedores: readonly P[]): P[] {
  return proveedores.filter((p) => p.activo && !RUBROS_QUE_NO_SIRVEN.includes(p.rubro));
}

// ---------- Leer lo escrito en una fase de servicio, como lo leería la base ----------

export type LecturaEntero = { tipo: "vacio" } | { tipo: "ok"; valor: number } | { tipo: "invalido" };

/** La cantidad mínima: un entero positivo escrito con dígitos. La base hace `::integer` y rechaza «1.5», «abc» y lo que no cabe en 32 bits. */
export function leerEntero(texto: string): LecturaEntero {
  const t = texto.trim();
  if (t === "") return { tipo: "vacio" };
  if (!/^\d+$/.test(t)) return { tipo: "invalido" };
  const n = Number(t);
  return n <= 2147483647 ? { tipo: "ok", valor: n } : { tipo: "invalido" };
}

/** `aaaa-mm-dd` y un día que existe en el calendario (la base hace `::date`). */
export function esFechaIso(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const t = Date.parse(`${texto}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === texto;
}

/** Los topes de `fn_produccion_fases_normalizar`: la prueba los compara con la migración. */
export const TARIFA_MAXIMA = 9999.99;
export const FIJO_MAXIMO = 99999.99;

export type ServicioLeido = {
  tarifa: LecturaDinero;
  fijo: LecturaDinero;
  minimo: LecturaEntero;
  /** La fila de la lista de precios que aplica a `hoy` (si la hay), aunque la caja traiga algo escrito. */
  sugerida: TarifaDeLista | null;
  /** Lo que la base guardaría: la tarifa escrita o, con la caja vacía, la de la lista; null si no hay ninguna. */
  tarifaPrenda: number | null;
  fijoOrden: number;
  cantidadMinima: number | null;
  /** true cuando la tarifa salió de la lista; con ella viajan el mínimo y el fijo que no se escribieron. */
  deLaLista: boolean;
};

/**
 * Lo que la base haría con las tres cajas de un servicio (`fn_produccion_fases_normalizar`): la tarifa escrita manda; si va vacía, se copia la de
 * la lista y, con ella, la cantidad mínima que no se escribió y el fijo si el escrito es 0. Un texto que no es número deja ese valor en nada
 * (la base lo rechaza con `fase_tarifa_invalida`; acá lo dice `problemasFases`).
 */
export function leerServicio(fase: FaseBorrador, lista: readonly TarifaDeLista[], hoy: string): ServicioLeido {
  const tarifa = leerDinero(fase.tarifa);
  const fijo = leerDinero(fase.fijo);
  const minimo = leerEntero(fase.minimo);
  const sugerida = tarifaSugerida(fase.proveedorId, fase.clave, lista, hoy);
  let tarifaPrenda = tarifa.tipo === "ok" ? tarifa.valor : null;
  let fijoOrden = fijo.tipo === "ok" ? fijo.valor : 0;
  let cantidadMinima = minimo.tipo === "ok" ? minimo.valor : null;
  const deLaLista = tarifa.tipo === "vacio" && sugerida !== null;
  if (deLaLista && sugerida) {
    tarifaPrenda = sugerida.tarifa;
    cantidadMinima = cantidadMinima ?? sugerida.minimo;
    fijoOrden = fijoOrden > 0 ? fijoOrden : sugerida.fijo;
  }
  return { tarifa, fijo, minimo, sugerida, tarifaPrenda, fijoOrden, cantidadMinima, deLaLista };
}

// ---------- Lo que falta (solo lo que la base rechaza) ----------

/** Los `hint` de `fn_produccion_fases_normalizar` que una fila de la hoja puede provocar. Los demás de esa función (`fases_espina`, `fase_desconocida`,
 *  `fase_repetida`, `fase_con_posicion`, `fase_quien`, `fase_proveedor`) no pueden pasar desde acá: la espina viaja siempre, la clave y el quién
 *  están tipados, cada clave viaja una vez, la posición solo viaja en bordado y estampado, y el proveedor sale de un combo con ids reales. */
export const HINTS_FASE = [
  "fase_sin_proveedor",
  "fase_proveedor_inactivo",
  "fase_proveedor_rubro",
  "fase_sin_tarifa",
  "fase_tarifa_invalida",
  "fase_fecha_invalida",
  "fase_fecha_pasada",
  "fase_sin_posicion",
] as const;
export type HintFase = (typeof HINTS_FASE)[number];

export type ProblemaFase = { clave: FaseClave; hint: HintFase; texto: string };

export type ContextoFases = {
  /** `aaaa-mm-dd` de Lima: con él se elige la tarifa vigente y se juzga la fecha prometida, como `fn_hoy_lima()`. */
  hoy: string;
  proveedores: readonly ProveedorServicio[];
  /** La lista de precios: con ella una tarifa vacía NO es una falta (la base la copia). Sin lista, toda tarifa se escribe. */
  lista?: readonly TarifaDeLista[];
};

/**
 * Lo que la base rechazaría de las fases que viajan, en el orden de la ruta y, dentro de una fase, en el orden en que la base lo mira. Una fase del
 * Taller no tiene nada que decir: la base ignora proveedor, tarifa y fecha cuando `quien = taller`. Una tarifa vacía solo falta si no hay una
 * sugerida (la base la copia de la lista); «0» o un negativo la base los lee como «sin tarifa», y acá se dice con la frase que ayuda.
 */
export function problemasFases(fases: readonly FaseBorrador[], ctx: ContextoFases): ProblemaFase[] {
  const lista = ctx.lista ?? [];
  const porId = new Map(ctx.proveedores.map((p) => [p.id, p] as const));
  const problemas: ProblemaFase[] = [];
  for (const f of fasesEncendidas(fases)) {
    const cat = faseDe(f.clave);
    const nombre = `«${cat.nombre}»`;
    const di = (hint: HintFase, texto: string) => problemas.push({ clave: f.clave, hint, texto });

    if (cat.posicionable && f.posicion === null) {
      di("fase_sin_posicion", `${nombre} dice si va sobre la pieza cortada o sobre la prenda armada.`);
    }
    if (f.quien !== "servicio") continue;

    if (!f.proveedorId) {
      di("fase_sin_proveedor", `Si ${nombre} sale afuera, elige a quién.`);
    } else {
      const prov = porId.get(f.proveedorId);
      if (!prov || !prov.activo) di("fase_proveedor_inactivo", `Ese proveedor no está activo en el directorio del Taller.`);
      else if (RUBROS_QUE_NO_SIRVEN.includes(prov.rubro)) di("fase_proveedor_rubro", `Ese proveedor vende tela o avíos: un servicio de ${nombre} es de maquila u otro rubro.`);
    }

    const s = leerServicio(f, lista, ctx.hoy);
    if (s.tarifa.tipo === "coma") di("fase_tarifa_invalida", `Escribe la tarifa de ${nombre} con punto, por ejemplo 4.50.`);
    else if (s.tarifa.tipo === "invalido") di("fase_tarifa_invalida", `La tarifa de ${nombre} tiene que ser un número, por ejemplo 4.50.`);
    else if (s.fijo.tipo === "coma") di("fase_tarifa_invalida", `Escribe el fijo por orden de ${nombre} con punto, por ejemplo 80.00.`);
    else if (s.fijo.tipo === "invalido") di("fase_tarifa_invalida", `El fijo por orden de ${nombre} tiene que ser un número, por ejemplo 80.00.`);
    else if (s.minimo.tipo === "invalido") di("fase_tarifa_invalida", `La cantidad mínima de ${nombre} es un número entero, por ejemplo 150.`);
    else if (s.tarifa.tipo === "negativo" || (s.tarifa.tipo === "ok" && s.tarifa.valor <= 0)) di("fase_sin_tarifa", `La tarifa por prenda de ${nombre} tiene que ser mayor que cero.`);
    else if (s.tarifaPrenda === null) di("fase_sin_tarifa", `Falta la tarifa por prenda de ${nombre}: escríbela o guárdala en la lista de precios del proveedor.`);
    else if (s.tarifaPrenda > TARIFA_MAXIMA) di("fase_tarifa_invalida", `La tarifa de ${nombre} no puede pasar de S/\u00a09,999.99.`);
    else if (s.fijo.tipo === "negativo") di("fase_tarifa_invalida", `El fijo por orden de ${nombre} no puede ser negativo.`);
    else if (s.fijoOrden > FIJO_MAXIMO) di("fase_tarifa_invalida", `El fijo por orden de ${nombre} no puede pasar de S/\u00a099,999.99.`);
    else if (s.cantidadMinima !== null && s.cantidadMinima <= 0) di("fase_tarifa_invalida", `La cantidad mínima de ${nombre} tiene que ser mayor que cero.`);

    const fecha = f.fechaPrometida.trim();
    if (fecha !== "" && !esFechaIso(fecha)) di("fase_fecha_invalida", `La fecha prometida de ${nombre} no es una fecha válida.`);
    else if (fecha !== "" && fecha < ctx.hoy) di("fase_fecha_pasada", `La fecha prometida de ${nombre} ya pasó: elige una de hoy en adelante.`);
  }
  return problemas;
}

// ---------- Avisos y textos ----------

/**
 * «Confecciones del Norte cobra desde 150 prendas: esta orden lleva 50». La base NO bloquea (decisión 5 del ADR-0400: avisa). Solo con una fase de
 * servicio que viaja, con una cantidad mínima (escrita o de la lista) y con prendas ya escritas por debajo de ella.
 */
export function avisoMinimo(
  fase: FaseBorrador,
  totalPrendas: number,
  lista: readonly TarifaDeLista[],
  ctx: { hoy: string; proveedores?: readonly ProveedorServicio[] }
): string | null {
  if (!faseViaja(fase) || fase.quien !== "servicio" || totalPrendas <= 0) return null;
  const s = leerServicio(fase, lista, ctx.hoy);
  if (s.cantidadMinima === null || s.cantidadMinima <= 0 || totalPrendas >= s.cantidadMinima) return null;
  const nombre = ctx.proveedores?.find((p) => p.id === fase.proveedorId)?.nombre ?? "Este servicio";
  return `${nombre} cobra desde ${s.cantidadMinima} prendas: esta orden lleva ${totalPrendas}`;
}

/** Σ (tarifa × prendas + fijo) de las fases que salen afuera, en soles a dos decimales (`aCentimos` redondea, no cambia de unidad); null si ninguna sale. Una tarifa que aún no se puede leer suma 0: es un estimado. */
export function costoServiciosEstimado(fases: readonly FaseBorrador[], totalPrendas: number, lista: readonly TarifaDeLista[], hoy: string): number | null {
  let hayServicio = false;
  let total = 0;
  for (const f of fasesEncendidas(fases)) {
    if (f.quien !== "servicio") continue;
    hayServicio = true;
    const s = leerServicio(f, lista, hoy);
    total += (s.tarifaPrenda ?? 0) * Math.max(totalPrendas, 0) + s.fijoOrden;
  }
  return hayServicio ? aCentimos(total) : null;
}

/** Una fase que sale afuera con lo que costaría en TODA la orden y a quién (para repartirlo por prenda en la ficha). */
export type ServicioConCosto = { clave: FaseClave; nombre: string; proveedor: string | null; costo: number };

/**
 * Cada fase que sale afuera con su costo de toda la orden (tarifa × prendas + fijo, a dos decimales) y su proveedor, en el orden de la ruta. Es la MISMA cuenta
 * que `costoServiciosEstimado`, partida fase por fase: la ficha la reparte por prenda para decir cuánto de cada prenda es costura, bordado o lavandería. Una
 * tarifa que aún no se puede leer cuesta 0 (es un estimado); la ficha no la lista, y el «falta» de la hoja es quien lo dice.
 */
export function serviciosConCosto(
  fases: readonly FaseBorrador[],
  totalPrendas: number,
  lista: readonly TarifaDeLista[],
  hoy: string,
  proveedores: readonly ProveedorServicio[]
): ServicioConCosto[] {
  return fasesEncendidas(fases)
    .filter((f) => f.quien === "servicio")
    .map((f) => {
      const s = leerServicio(f, lista, hoy);
      return {
        clave: f.clave,
        nombre: faseDe(f.clave).nombre,
        proveedor: proveedores.find((p) => p.id === f.proveedorId)?.nombre ?? null,
        costo: aCentimos((s.tarifaPrenda ?? 0) * Math.max(totalPrendas, 0) + s.fijoOrden),
      };
    });
}

// ---------- Lo que viaja a la base ----------

export type FaseRpc = {
  clave: FaseClave;
  quien: Quien;
  proveedor_id: string | null;
  tarifa_prenda: string | null;
  fijo_orden: string | null;
  cantidad_minima: string | null;
  fecha_prometida: string | null;
  posicion: Posicion | null;
};

/** Un número leído viaja como texto canónico; uno que no se pudo leer viaja TAL CUAL se escribió, para que sea la base la que lo rechace (nunca se arregla en silencio). */
function textoDe(lectura: LecturaDinero | LecturaEntero, escrito: string, resuelto: number | null): string | null {
  if (lectura.tipo === "ok") return String(resuelto ?? lectura.valor);
  if (lectura.tipo === "vacio") return resuelto === null ? null : String(resuelto);
  return escrito.trim();
}

/**
 * El `p_fases` de `abrir_orden_produccion`: solo las fases que viajan (la espina y las encendidas), en el orden de la ruta. Un servicio lleva la
 * tarifa escrita o la sugerida (y con ella el mínimo y el fijo de la lista, como hace la base); el Taller lleva todo en null. Los números van como texto.
 */
export function fasesParaRpc(fases: readonly FaseBorrador[], lista: readonly TarifaDeLista[], hoy: string): FaseRpc[] {
  return fasesEncendidas(fases).map((f) => {
    const cat = faseDe(f.clave);
    const base: FaseRpc = {
      clave: f.clave,
      quien: f.quien,
      proveedor_id: null,
      tarifa_prenda: null,
      fijo_orden: null,
      cantidad_minima: null,
      fecha_prometida: null,
      posicion: cat.posicionable ? f.posicion : null,
    };
    if (f.quien !== "servicio") return base;
    const s = leerServicio(f, lista, hoy);
    const fecha = f.fechaPrometida.trim();
    return {
      ...base,
      proveedor_id: f.proveedorId,
      tarifa_prenda: textoDe(s.tarifa, f.tarifa, s.tarifaPrenda),
      fijo_orden: textoDe(s.fijo, f.fijo, s.fijoOrden),
      cantidad_minima: textoDe(s.minimo, f.minimo, s.cantidadMinima),
      fecha_prometida: fecha === "" ? null : fecha,
    };
  });
}
