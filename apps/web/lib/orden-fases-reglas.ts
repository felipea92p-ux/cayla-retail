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

/**
 * La clave de un proceso del catálogo (`procesos_produccion`, ADR-0570 actividad 5). Desde que el líder da de alta procesos sin programar, una clave es un texto:
 * los doce de siempre más los que se sumen. Lo que el código decide por una clave fija (la espina, el ploteo como hito) sigue nombrando la del sistema.
 */
export type FaseClave = string;
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
  /** Una fase que se MARCA «hecha» con un toque en vez de contar prendas (hoy solo Ploteo): la misma regla que `fn_fase_es_hito` de la base (lo prueba `orden-fases-reglas.test.ts`). Un servicio de una fase así cobra por ORDEN (el fijo), no por prenda. */
  hito: boolean;
  /** Si la hoja «Nueva orden» la ofrece. Bordado y Estampado «no se usan por ahora» (Felipe, 2026-10-16) y Acabado es de la ruta anterior: siguen en la base y en lo que ya se abrió, pero no se ofrecen. */
  enLaHoja: boolean;
  /** Su lugar en la ruta (`fn_fase_secuencia`); en bordado y estampado, sobre la prenda armada. */
  secuencia: number;
  /** Bordado y estampado: su lugar sobre la pieza cortada. Los demás, null. */
  secuenciaPieza: number | null;
  /** Apagado por el líder: lo ya abierto lo sigue llevando, pero no se ofrece ni entra a una orden nueva. */
  activo: boolean;
  /** Quién lo hace de costumbre: con eso nace el paso al agregarlo. */
  quienSugerido: Quien;
  /** Uno de los de siempre (su clave la usa el código): se renombra, pero no se apaga si es de la espina. */
  delSistema: boolean;
  /** En cuántas fases de órdenes está (solo lo dice el catálogo leído de la base). */
  usos?: number;
};

const SISTEMA = { activo: true, delSistema: true, secuenciaPieza: null } as const;

/**
 * El catálogo de RESPALDO, idéntico a lo que siembra `20261029210000_produccion_catalogo_de_procesos.sql` (lo prueba `orden-fases-reglas.test.ts`). La pantalla usa el que
 * lee de la base (`leerProcesos`); este solo cuando esa lectura falla, para que una orden se pueda dibujar igual.
 */
export const FASES: ReadonlyArray<FaseDelCatalogo> = [
  { ...SISTEMA, clave: "ploteo", nombre: "Ploteo", siempre: true, posicionable: false, ayuda: "La marcada a escala real: define cuánta tela comprar", ruta: "nueva", hito: true, enLaHoja: true, secuencia: 5, quienSugerido: "servicio" },
  { ...SISTEMA, clave: "corte", nombre: "Corte", siempre: true, posicionable: false, ayuda: "Trazo, tendido y corte", ruta: "ambas", hito: false, enLaHoja: true, secuencia: 10, quienSugerido: "taller" },
  { ...SISTEMA, clave: "habilitado", nombre: "Habilitado", siempre: true, posicionable: false, ayuda: "Preparar lo cortado para coser: numerar, armar paquetes, sumar avíos y el corte menor de Tricotex", ruta: "nueva", hito: false, enLaHoja: true, secuencia: 15, quienSugerido: "taller" },
  { ...SISTEMA, clave: "costura", nombre: "Costura", siempre: true, posicionable: false, ayuda: "Armar la prenda: costura, ojal y botón", ruta: "ambas", hito: false, enLaHoja: true, secuencia: 30, quienSugerido: "taller" },
  { ...SISTEMA, delSistema: false, clave: "pegar_cierre", nombre: "Pegar cierre", siempre: false, posicionable: false, ayuda: "Pegar la cremallera a la prenda armada", ruta: "ambas", hito: false, enLaHoja: true, secuencia: 32, quienSugerido: "taller" },
  { ...SISTEMA, clave: "ojales_botones", nombre: "Ojales y botones", siempre: false, posicionable: false, ayuda: "Solo si el modelo los lleva", ruta: "nueva", hito: false, enLaHoja: true, secuencia: 35, quienSugerido: "taller" },
  { ...SISTEMA, clave: "bordado", nombre: "Bordado", siempre: false, posicionable: true, ayuda: "Sobre la pieza cortada o sobre la prenda armada", ruta: "ambas", hito: false, enLaHoja: false, secuencia: 40, secuenciaPieza: 20, quienSugerido: "servicio" },
  { ...SISTEMA, clave: "estampado", nombre: "Estampado", siempre: false, posicionable: true, ayuda: "Sobre la pieza cortada o sobre la prenda armada", ruta: "ambas", hito: false, enLaHoja: false, secuencia: 45, secuenciaPieza: 25, quienSugerido: "servicio" },
  { ...SISTEMA, clave: "lavanderia", nombre: "Lavado o teñido", siempre: false, posicionable: false, ayuda: "Lavar o teñir la prenda armada, antes de planchar", ruta: "ambas", hito: false, enLaHoja: true, secuencia: 50, quienSugerido: "servicio" },
  // ADR-0551 (Felipe, 2026-10-27): los pasos fijos son cinco. Limpiar hilos y revisar y Etiquetar y embolsar los hace la tienda: siguen en la base y en lo ya abierto, pero la hoja no los ofrece.
  { ...SISTEMA, clave: "limpieza_revision", nombre: "Limpiar hilos y revisar", siempre: false, posicionable: false, ayuda: "Quitar hilos sobrantes y revisar cada prenda", ruta: "nueva", hito: false, enLaHoja: false, secuencia: 55, quienSugerido: "taller" },
  { ...SISTEMA, clave: "acabado", nombre: "Acabado", siempre: true, posicionable: false, ayuda: "Revisión, planchado, etiqueta y embolsado", ruta: "anterior", hito: false, enLaHoja: false, secuencia: 60, quienSugerido: "taller" },
  { ...SISTEMA, clave: "planchado", nombre: "Planchado", siempre: true, posicionable: false, ayuda: "Planchar la prenda terminada", ruta: "nueva", hito: false, enLaHoja: true, secuencia: 65, quienSugerido: "taller" },
  { ...SISTEMA, clave: "etiquetado_embolsado", nombre: "Etiquetar y embolsar", siempre: false, posicionable: false, ayuda: "Etiqueta, bolsa y lista para despachar", ruta: "nueva", hito: false, enLaHoja: false, secuencia: 70, quienSugerido: "taller" },
];

/** La RPC del catálogo (migración 20261029210000). */
export const RPC_PROCESOS = "fn_procesos_produccion";

/**
 * Lo que devuelve `fn_procesos_produccion`, como lo usa la pantalla. Una fila que no se lee bien no entra; si no entra ninguna, `null` (la pantalla usa el respaldo).
 * La espina y el hito los decide el CÓDIGO por la clave del sistema (son la forma de la ruta, ADR-0400), no lo que diga la fila: la base tampoco deja cambiarlos.
 */
export function leerProcesos(data: unknown): FaseDelCatalogo[] | null {
  if (!Array.isArray(data)) return null;
  const salida: FaseDelCatalogo[] = [];
  for (const f of data) {
    if (typeof f !== "object" || f === null) continue;
    const r = f as Record<string, unknown>;
    const clave = typeof r.clave === "string" ? r.clave : "";
    const nombre = typeof r.nombre === "string" ? r.nombre.trim() : "";
    const secuencia = Number(r.secuencia);
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(clave) || nombre === "" || !Number.isInteger(secuencia)) continue;
    const pieza = r.secuencia_pieza === null || r.secuencia_pieza === undefined ? null : Number(r.secuencia_pieza);
    const ruta = r.ruta === "anterior" || r.ruta === "nueva" ? r.ruta : "ambas";
    salida.push({
      clave,
      nombre,
      ayuda: typeof r.ayuda === "string" ? r.ayuda : "",
      siempre: r.espina === true,
      posicionable: pieza !== null && Number.isInteger(pieza),
      ruta,
      hito: r.hito === true,
      enLaHoja: r.en_la_hoja === true,
      secuencia,
      secuenciaPieza: pieza !== null && Number.isInteger(pieza) ? pieza : null,
      activo: r.activo !== false,
      quienSugerido: r.quien_sugerido === "servicio" ? "servicio" : "taller",
      delSistema: r.del_sistema === true,
      usos: Number.isInteger(Number(r.usos)) ? Number(r.usos) : undefined,
    });
  }
  return salida.length > 0 ? salida.sort((a, b) => (a.secuenciaPieza ?? a.secuencia) - (b.secuenciaPieza ?? b.secuencia)) : null;
}

/** Las fases que la hoja «Nueva orden» ofrece: las activas con `enLaHoja`, en el orden del catálogo. */
export function fasesDeLaHoja(catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): FaseDelCatalogo[] {
  return catalogo.filter((f) => f.enLaHoja && f.activo);
}

/**
 * @internal La prueba cruza la hoja de respaldo con la siembra; la pantalla usa `fasesDeLaHoja(catalogo)` con el catálogo leído.
 * Las fases que la hoja «Nueva orden» ofrece con el catálogo de respaldo (ADR-0400 act. k y l, ADR-0551): la ruta nueva —Ploteo · Corte · Habilitado · Costura · los opcionales—, en el
 * orden del catálogo. Las cinco fijas viajan siempre; un opcional se enciende si el modelo lo lleva. Limpiar hilos y revisar y Etiquetar y embolsar no se ofrecen (los hace la tienda).
 */
export const FASES_DE_LA_HOJA: ReadonlyArray<FaseDelCatalogo> = fasesDeLaHoja(FASES);

/** La fase del catálogo por su clave. Una clave que el catálogo no tiene (uno que no se leyó) se dibuja con su clave como nombre, opcional y sin lugar propio. */
export function faseDe(clave: FaseClave, catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): FaseDelCatalogo {
  return (
    catalogo.find((f) => f.clave === clave) ??
    FASES.find((f) => f.clave === clave) ?? {
      clave,
      nombre: clave,
      siempre: false,
      posicionable: false,
      ayuda: "",
      ruta: "ambas",
      hito: false,
      enLaHoja: false,
      secuencia: 0,
      secuenciaPieza: null,
      activo: false,
      quienSugerido: "taller",
      delSistema: false,
    }
  );
}

/**
 * El lugar de la fase en la ruta, idéntico a `fn_fase_secuencia`: el del catálogo; bordado y estampado, según vayan sobre la pieza o sobre la prenda. Un bordado o un estampado sin
 * posición no tiene lugar (null), igual que en la base, y una clave que no está en el catálogo tampoco.
 */
export function secuenciaDe(clave: FaseClave, posicion: Posicion | null, catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): number | null {
  const f = catalogo.find((x) => x.clave === clave) ?? FASES.find((x) => x.clave === clave);
  if (!f) return null;
  if (f.secuenciaPieza === null) return f.secuencia;
  return posicion === "pieza" ? f.secuenciaPieza : posicion === "prenda" ? f.secuencia : null;
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
  /** «Pendiente de registrar» (ADR-0551 pendiente de registrar): sale afuera, pero todavía no se sabe con quién. Sin proveedor; puede llevar su costo (tarifa, fijo, mínimo), que se devenga como el de cualquier servicio, y sin costo no suma nada hasta que se registre. Solo cuenta en un servicio. */
  pendiente?: boolean;
};

/** Lo que la hoja sabe antes de pintar las fases (ADR-0551). Sin él, el bloque nace como siempre: la espina en el Taller y los opcionales apagados. */
export type ContextoDeFases = {
  /** Lo que el modelo dijo de ojales y botones: `true` prende el paso; `false` y `null` (nadie lo ha preguntado) lo dejan apagado. */
  ojalesBotones?: boolean | null;
  /** Lo que el modelo lleva de cada proceso (`producto_procesos`, ADR-0570 actividad 5): `true` lo prende, «el modelo sugiere y la orden manda». */
  delModelo?: Readonly<Record<FaseClave, boolean>>;
  /** Las fases que nacen en un servicio de afuera (Ploteo y Corte, `serviciosPorDefecto`) y su proveedor; `null` = hay a quién elegir pero falta elegir. */
  servicios?: Partial<Record<FaseClave, string | null>>;
};

/** Cómo nace el bloque: la espina encendida y en el Taller (salvo lo que dice el contexto); bordado y estampado apagados, sobre pieza; lavandería apagada. En el orden de la ruta. */
export function fasesIniciales(contexto: ContextoDeFases = {}, catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): FaseBorrador[] {
  return ordenarFases(
    fasesDeLaHoja(catalogo).map((f) => {
      const afuera = contexto.servicios !== undefined && f.clave in contexto.servicios;
      return {
        clave: f.clave,
        encendida: f.siempre || contexto.delModelo?.[f.clave] === true || (f.clave === "ojales_botones" && contexto.ojalesBotones === true),
        // Un servicio sin proveedor no se puede abrir: el «de costumbre afuera» de un opcional solo se usa al agregarlo a mano (`quienSugerido`).
        quien: afuera ? ("servicio" as const) : ("taller" as const),
        proveedorId: afuera ? (contexto.servicios?.[f.clave] ?? null) : null,
        tarifa: "",
        fijo: "",
        minimo: "",
        fechaPrometida: "",
        posicion: f.posicionable ? ("pieza" as const) : null,
      };
    }),
    catalogo
  );
}

/** Las fases que nacen en un servicio de afuera (Felipe, 2026-10-27: Ploteo y Corte). */
export const FASES_QUE_NACEN_AFUERA: ReadonlyArray<FaseClave> = ["ploteo", "corte"];

/** ¿La lista de precios de este proveedor le sirve a esta fase? El ploteo se cobra por orden (el fijo); las demás, por prenda. Misma regla que `fn_produccion_fases_normalizar`. */
function tarifaUsable(t: TarifaDeLista, clave: FaseClave): boolean {
  return faseDe(clave).hito ? t.fijo > 0 : t.tarifa > 0;
}

/**
 * Ploteo y Corte nacen «Afuera» SOLO si ya hay a quién mandarlos: un proveedor activo de servicios con precio vigente para esa fase. Sin él, nacen en el Taller (una orden no
 * puede abrirse con un servicio sin proveedor: si no, hoy, con un solo proveedor cargado, toda orden nacería bloqueada). Con uno solo, queda elegido; con varios, el valor es
 * `null` y la hoja pide elegir a quién. Cada fase se resuelve sola: puede haber proveedor de corte y no de ploteo.
 */
export function serviciosPorDefecto(proveedores: readonly ProveedorServicio[], lista: readonly TarifaDeLista[], hoy: string): Partial<Record<FaseClave, string | null>> {
  const salida: Partial<Record<FaseClave, string | null>> = {};
  for (const clave of FASES_QUE_NACEN_AFUERA) {
    const con = proveedoresQueSirven(proveedores).filter((p) => {
      const t = tarifaSugerida(p.id, clave, lista, hoy);
      return t !== null && tarifaUsable(t, clave);
    });
    if (con.length > 0) salida[clave] = con.length === 1 ? con[0].id : null;
  }
  return salida;
}

/** Las filas de `fn_procesos_de_modelos` como las usa la hoja: por modelo, lo que dijo de cada proceso. Una fila que no se lee bien no contesta. */
export function leerProcesosDeModelos(data: unknown): Record<string, Record<FaseClave, boolean>> {
  const salida: Record<string, Record<FaseClave, boolean>> = {};
  if (!Array.isArray(data)) return salida;
  for (const f of data) {
    if (typeof f !== "object" || f === null) continue;
    const { producto_id: id, proceso_clave: clave, lleva } = f as { producto_id?: unknown; proceso_clave?: unknown; lleva?: unknown };
    if (typeof id === "string" && typeof clave === "string" && typeof lleva === "boolean") (salida[id] ??= {})[clave] = lleva;
  }
  return salida;
}

/**
 * Lo que dijo el modelo de cada proceso, puesto en las fases (ADR-0570, actividad 5; generaliza `conOjalesDelModelo`): cada opcional de la hoja se prende si el modelo lo lleva y se apaga si no
 * (o si nadie lo ha dicho). La espina y lo que la persona escribió en cada fila no se tocan.
 */
export function conProcesosDelModelo(fases: readonly FaseBorrador[], delModelo: Readonly<Record<FaseClave, boolean>> | null, catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): FaseBorrador[] {
  return fases.map((f) => (faseDe(f.clave, catalogo).siempre ? f : { ...f, encendida: delModelo?.[f.clave] === true }));
}

/**
 * Lo que se guarda en la ficha del modelo al abrir la orden con «Recordar en la ficha» (ADR-0570, actividad 5): cada proceso opcional de la hoja cuya respuesta cambió. Un proceso que el modelo
 * nunca contestó se anota solo si la orden lo lleva (no se llena la ficha de «no lleva»), salvo Ojales y botones, que la hoja ya preguntaba y se contesta igual que antes (ADR-0551).
 */
export function procesosParaRecordar(
  fases: readonly FaseBorrador[],
  delModelo: Readonly<Record<FaseClave, boolean>> | null,
  catalogo: ReadonlyArray<FaseDelCatalogo> = FASES
): { clave: FaseClave; lleva: boolean }[] {
  const salida: { clave: FaseClave; lleva: boolean }[] = [];
  for (const def of fasesDeLaHoja(catalogo)) {
    if (def.siempre) continue;
    const lleva = fases.some((f) => f.clave === def.clave && f.encendida);
    const antes = delModelo?.[def.clave];
    if (antes === lleva) continue;
    if (antes === undefined && !lleva && def.clave !== "ojales_botones") continue;
    salida.push({ clave: def.clave, lleva });
  }
  return salida;
}

/** Las fases en el orden de la ruta. Un bordado o estampado sin posición se acomoda como si fuera sobre pieza (solo para dibujarlo: la base lo rechaza). */
export function ordenarFases<F extends Pick<FaseBorrador, "clave" | "posicion">>(fases: readonly F[], catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): F[] {
  const lugar = (f: F) => secuenciaDe(f.clave, f.posicion, catalogo) ?? secuenciaDe(f.clave, "pieza", catalogo) ?? 0;
  return [...fases].sort((a, b) => lugar(a) - lugar(b));
}

/** Una fase de la espina viaja siempre, aunque la fila diga `encendida: false`: la base exige corte, costura y acabado (`fases_espina`) y la hoja no las apaga. */
export function faseViaja(f: Pick<FaseBorrador, "clave" | "encendida">, catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): boolean {
  return f.encendida || faseDe(f.clave, catalogo).siempre;
}

/** Las fases que van a la orden (la espina y las encendidas), cada clave UNA vez (la primera fila gana, como `fase_repetida` exige), en el orden de la ruta. */
export function fasesEncendidas(fases: readonly FaseBorrador[], catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): FaseBorrador[] {
  const vistas = new Set<FaseClave>();
  const unicas: FaseBorrador[] = [];
  for (const f of fases) {
    if (vistas.has(f.clave) || !faseViaja(f, catalogo)) continue;
    vistas.add(f.clave);
    unicas.push(f);
  }
  return ordenarFases(unicas, catalogo);
}

// ---------- La lista de precios del proveedor (sugiere; la fase copia y congela) ----------

/** Una fila de `proveedor_tarifas`. `vigenteDesde` es `aaaa-mm-dd`. */
export type TarifaDeLista = { proveedorId: string; faseClave: FaseClave; tarifa: number; minimo: number | null; fijo: number; vigenteDesde: string };

/** Las listas de precios de todos los proveedores, en una sola lista plana (lo que lee `tarifaSugerida`). */
export function listaDeTarifas(
  proveedores: readonly { id: string; tarifas: readonly { faseClave: string; tarifa: number; minimo: number | null; fijo: number; vigenteDesde: string }[] }[]
): TarifaDeLista[] {
  return proveedores.flatMap((p) =>
    p.tarifas.map((t) => ({ proveedorId: p.id, faseClave: t.faseClave as FaseClave, tarifa: t.tarifa, minimo: t.minimo, fijo: t.fijo, vigenteDesde: t.vigenteDesde }))
  );
}

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
  // Una fase que se marca (Ploteo) se cobra por ORDEN: el fijo, sin tarifa por prenda ni cantidad mínima (la base los deja en nada: `fn_produccion_fases_normalizar`).
  const porOrden = faseDe(fase.clave).hito;
  const tarifa: LecturaDinero = porOrden ? { tipo: "vacio" } : leerDinero(fase.tarifa);
  const fijo = leerDinero(fase.fijo);
  const minimo: LecturaEntero = porOrden ? { tipo: "vacio" } : leerEntero(fase.minimo);
  const sugerida = tarifaSugerida(fase.proveedorId, fase.clave, lista, hoy);
  let tarifaPrenda = tarifa.tipo === "ok" ? tarifa.valor : null;
  let fijoOrden = fijo.tipo === "ok" ? fijo.valor : 0;
  let cantidadMinima = minimo.tipo === "ok" ? minimo.valor : null;
  const deLaLista = tarifa.tipo === "vacio" && sugerida !== null;
  if (porOrden) {
    if (sugerida) fijoOrden = fijoOrden > 0 ? fijoOrden : sugerida.fijo;
  } else if (deLaLista && sugerida) {
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
  "fase_sin_fijo",
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
  /** El catálogo leído de la base (los nombres de los procesos propios); sin él, el de respaldo. */
  catalogo?: ReadonlyArray<FaseDelCatalogo>;
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
  for (const f of fasesEncendidas(fases, ctx.catalogo)) {
    const cat = faseDe(f.clave, ctx.catalogo);
    const nombre = `«${cat.nombre}»`;
    const di = (hint: HintFase, texto: string) => problemas.push({ clave: f.clave, hint, texto });

    if (cat.posicionable && f.posicion === null) {
      di("fase_sin_posicion", `${nombre} dice si va sobre la pieza cortada o sobre la prenda armada.`);
    }
    if (f.quien !== "servicio") continue;

    // Pendiente de registrar (ADR-0551): no hay proveedor que juzgar y su costo es OPCIONAL (en blanco no suma nada), pero lo que se escriba pasa los mismos topes de un servicio.
    if (!f.proveedorId && !f.pendiente) {
      di("fase_sin_proveedor", `Si ${nombre} sale afuera, elige a quién.`);
    } else if (f.proveedorId && !f.pendiente) {
      const prov = porId.get(f.proveedorId);
      if (!prov || !prov.activo) di("fase_proveedor_inactivo", `Ese proveedor no está activo en el directorio del Taller.`);
      else if (RUBROS_QUE_NO_SIRVEN.includes(prov.rubro)) di("fase_proveedor_rubro", `Ese proveedor vende tela o avíos: un servicio de ${nombre} es de maquila u otro rubro.`);
    }

    const s = leerServicio(f, lista, ctx.hoy);
    if (cat.hito) {
      // Cobra por orden (el ploteo): el fijo es lo único que se escribe. El orden es el de la base: un texto que no es número, después «falta el fijo», después los topes.
      if (s.fijo.tipo === "coma") di("fase_tarifa_invalida", `Escribe lo que cobra ${nombre} por la orden con punto, por ejemplo 40.00.`);
      else if (s.fijo.tipo === "invalido") di("fase_tarifa_invalida", `Lo que cobra ${nombre} por la orden tiene que ser un número, por ejemplo 40.00.`);
      else if (f.pendiente && s.fijo.tipo === "negativo") di("fase_tarifa_invalida", `Lo que cobra ${nombre} por la orden no puede ser negativo.`);
      else if (!f.pendiente && (s.fijo.tipo === "negativo" || s.fijoOrden <= 0)) {
        di("fase_sin_fijo", s.fijo.tipo === "negativo" ? `Lo que cobra ${nombre} por la orden tiene que ser mayor que cero.` : `Falta lo que cobra ${nombre} por esta orden: escríbelo o guárdalo en la lista de precios del proveedor.`);
      } else if (s.fijoOrden > FIJO_MAXIMO) di("fase_tarifa_invalida", `Lo que cobra ${nombre} por la orden no puede pasar de S/\u00a099,999.99.`);
    } else if (s.tarifa.tipo === "coma") di("fase_tarifa_invalida", `Escribe la tarifa de ${nombre} con punto, por ejemplo 4.50.`);
    else if (s.tarifa.tipo === "invalido") di("fase_tarifa_invalida", `La tarifa de ${nombre} tiene que ser un número, por ejemplo 4.50.`);
    else if (s.fijo.tipo === "coma") di("fase_tarifa_invalida", `Escribe el fijo por orden de ${nombre} con punto, por ejemplo 80.00.`);
    else if (s.fijo.tipo === "invalido") di("fase_tarifa_invalida", `El fijo por orden de ${nombre} tiene que ser un número, por ejemplo 80.00.`);
    else if (s.minimo.tipo === "invalido") di("fase_tarifa_invalida", `La cantidad mínima de ${nombre} es un número entero, por ejemplo 150.`);
    else if (s.tarifa.tipo === "negativo" || (s.tarifa.tipo === "ok" && s.tarifa.valor <= 0)) di("fase_sin_tarifa", `La tarifa por prenda de ${nombre} tiene que ser mayor que cero.`);
    else if (s.tarifaPrenda === null && !f.pendiente) di("fase_sin_tarifa", `Falta la tarifa por prenda de ${nombre}: escríbela o guárdala en la lista de precios del proveedor.`);
    else if ((s.tarifaPrenda ?? 0) > TARIFA_MAXIMA) di("fase_tarifa_invalida", `La tarifa de ${nombre} no puede pasar de S/\u00a09,999.99.`);
    else if (s.fijo.tipo === "negativo") di("fase_tarifa_invalida", `El fijo por orden de ${nombre} no puede ser negativo.`);
    else if (s.fijoOrden > FIJO_MAXIMO) di("fase_tarifa_invalida", `El fijo por orden de ${nombre} no puede pasar de S/\u00a099,999.99.`);
    else if (s.cantidadMinima !== null && s.cantidadMinima <= 0) di("fase_tarifa_invalida", `La cantidad mínima de ${nombre} tiene que ser mayor que cero.`);

    const fecha = f.fechaPrometida.trim();
    if (fecha !== "" && !esFechaIso(fecha)) di("fase_fecha_invalida", `La fecha prometida de ${nombre} no es una fecha válida.`);
    else if (fecha !== "" && fecha < ctx.hoy && !f.pendiente) di("fase_fecha_pasada", `La fecha prometida de ${nombre} ya pasó: elige una de hoy en adelante.`);
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
export type ServicioConCosto = { clave: FaseClave; nombre: string; proveedor: string | null; /** Sale afuera sin proveedor a propósito (ADR-0551): no es una falta. */ pendiente: boolean; costo: number };

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
  proveedores: readonly ProveedorServicio[],
  catalogo: ReadonlyArray<FaseDelCatalogo> = FASES
): ServicioConCosto[] {
  return fasesEncendidas(fases, catalogo)
    .filter((f) => f.quien === "servicio")
    .map((f) => {
      const s = leerServicio(f, lista, hoy);
      return {
        clave: f.clave,
        nombre: faseDe(f.clave, catalogo).nombre,
        proveedor: proveedores.find((p) => p.id === f.proveedorId)?.nombre ?? null,
        pendiente: f.pendiente === true,
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
  /** Solo viaja (en true) en un servicio «pendiente de registrar»: la base lo lee en `fn_produccion_fases_normalizar` (ADR-0551 pendiente de registrar). */
  proveedor_pendiente?: boolean;
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
    const fecha = f.fechaPrometida.trim();
    // El pendiente lleva lo que se escribió (sin lista de precios: no hay proveedor), el ploteo solo su fijo.
    const s = leerServicio(f, f.pendiente ? [] : lista, hoy);
    return {
      ...base,
      ...(f.pendiente ? { proveedor_pendiente: true } : {}),
      proveedor_id: f.pendiente ? null : f.proveedorId,
      tarifa_prenda: textoDe(s.tarifa, f.tarifa, s.tarifaPrenda),
      fijo_orden: textoDe(s.fijo, f.fijo, s.fijoOrden),
      cantidad_minima: textoDe(s.minimo, f.minimo, s.cantidadMinima),
      fecha_prometida: fecha === "" ? null : fecha,
    };
  });
}
