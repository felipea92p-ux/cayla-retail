// Motor de demanda, etapa 1 (ADR-0347): UNA cifra de demanda. Lógica pura, sin React ni red, para probarla entera.
// Diseño: docs/investigacion/2026-10-05-algoritmo-de-inventario.md (capas 1 y 2).
//
// EL PROBLEMA. En CAYLA los modelos no se repiten: una prenda nueva vende 1 o 2 en su vida en una tienda. Con 1 venta, «se vende
// 1 cada 3 días» es ruido. Lo que sí se repite es el GRUPO: polos talla M de color tierra en TRU. Zara (una elasticidad por grupo) y
// Nextail (la familia si el producto vendió menos de 200) llegaron a lo mismo: se pronostica donde hay datos y se baja con
// proporciones.
//
// LA CUENTA (encogimiento gamma-Poisson, la versión barata del modelo jerárquico bayesiano):
//   · ritmo del grupo, por prenda colgada y por día: r_g = (vendidas del grupo + anotadas del grupo) ÷ (días-prenda colgadas del grupo)
//   · ritmo de la prenda: r = (x + K · r_g) ÷ (e + K), con x = lo que vendió, e = los días que estuvo colgada y K = 14 días-prenda.
//     Es decir: la prenda pesa e/(e+K) y su grupo K/(e+K). Con 2 días colgada, manda el grupo; con 60, manda la prenda.
//   · un día sin estar colgada NO es un día sin demanda: no entra al denominador (la profecía que se cumple sola, ADR-0346).
//
// CONTRATO
//   PROMETE: leer `fn_demanda_sede` (20261005215000) sin confiar en su forma; dar el ritmo de cada prenda y de cada
//            grupo con su porqué; sumar solo las tiendas donde el motor puede hablar (ADR-0346), y nunca inventar un ritmo donde no
//            hay ni ventas ni exposición.
//   ASUME:   que la base ya contó bien lo vendido (la misma definición que el motor del piso) y los días colgada (≥ 10 minutos, desde
//            el día siguiente al cuadre).
//   NO HACE: no decide cuánto producir ni comprar (eso lo dice cada pantalla con sus reglas) ni deja hablar a una tienda que no
//            cumple ADR-0346.

export const RPC_DEMANDA = "fn_demanda_sede";
/** Días cerrados que se leen. Cuatro semanas: lo bastante para ver un patrón, lo bastante cerca para que siga siendo esta temporada. */
export const DIAS_DEMANDA = 28;
/** Cuántos días-prenda «vale» la opinión del grupo. 14 = dos semanas colgada: desde ahí la prenda empieza a mandar sobre su grupo. */
export const K_DIAS_PRENDA = 14;
/** «Se vendió rápido y falta»: lo que hay alcanza menos que esto, al ritmo del grupo (el mismo umbral del motor del piso). */
export const DIAS_ALCANCE_FALTA = 14;

export type PrendaDemanda = {
  varianteId: string;
  productoId: string;
  categoriaId: string | null;
  tallaId: string | null;
  talla: string | null;
  colorCodigo: string | null;
  familiaColor: string | null;
  vendidas: number;
  diasExpuesta: number;
  pisoHoy: number;
  almacenHoy: number;
};

export type GrupoLeido = {
  categoriaId: string | null;
  tallaId: string | null;
  familiaColor: string | null;
  anotadas: number;
  /** Lo que se pidió y no había, con su prenda exacta (ADR-0348). */
  perdidas: number;
  diasAlgunaExpuesta: number;
};

export type LecturaDemanda = {
  hoy: string;
  desde: string;
  hasta: string;
  /** Días cerrados de la ventana (0 si la tienda se cuadró hoy o ayer). */
  dias: number;
  cuadradoEn: string | null;
  variantes: PrendaDemanda[];
  grupos: GrupoLeido[];
};

// ---------------------------------------------------------------------------------------------------------------------
// 1. Leer
// ---------------------------------------------------------------------------------------------------------------------

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const entero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);
const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Lo que devuelve `fn_demanda_sede`. null si no calza (o si la base respondió NULL: no se opera esa sede). */
export function leerDemanda(v: unknown): LecturaDemanda | null {
  if (!esObjeto(v) || !esFecha(v.hoy) || !esFecha(v.desde) || !esFecha(v.hasta)) return null;
  const variantes = (Array.isArray(v.variantes) ? v.variantes : []).filter(esObjeto).flatMap((p): PrendaDemanda[] => {
    const varianteId = texto(p.variante_id);
    const productoId = texto(p.producto_id);
    if (!varianteId || !productoId) return [];
    return [
      {
        varianteId,
        productoId,
        categoriaId: texto(p.categoria_id),
        tallaId: texto(p.talla_id),
        talla: texto(p.talla),
        colorCodigo: texto(p.color_codigo),
        familiaColor: texto(p.familia_color),
        vendidas: entero(p.vendidas),
        diasExpuesta: entero(p.dias_expuesta),
        pisoHoy: entero(p.piso_hoy),
        almacenHoy: entero(p.almacen_hoy),
      },
    ];
  });
  const grupos = (Array.isArray(v.grupos) ? v.grupos : []).filter(esObjeto).map(
    (g): GrupoLeido => ({
      categoriaId: texto(g.categoria_id),
      tallaId: texto(g.talla_id),
      familiaColor: texto(g.familia_color),
      anotadas: entero(g.anotadas),
      perdidas: entero(g.perdidas),
      diasAlgunaExpuesta: entero(g.dias_alguna_expuesta),
    })
  );
  return {
    hoy: v.hoy,
    desde: v.desde,
    hasta: v.hasta,
    dias: entero(v.dias),
    cuadradoEn: texto(v.cuadrado_en),
    variantes,
    grupos,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Grupos
// ---------------------------------------------------------------------------------------------------------------------

/** La llave del grupo: categoría × talla × familia de color (la misma que `claveAtributo` del motor del piso, por id de talla). */
export const claveGrupo = (categoriaId: string | null, tallaId: string | null, familiaColor: string | null): string =>
  `${categoriaId ?? "-"}|${tallaId ?? "-"}|${familiaColor ?? "-"}`;

export type GrupoDemanda = {
  clave: string;
  categoriaId: string | null;
  tallaId: string | null;
  talla: string | null;
  familiaColor: string | null;
  /** La demanda del grupo: lo vendido con su prenda, lo anotado «sin registrar» y lo que se pidió y no había (ADR-0348). */
  ventas: number;
  anotadas: number;
  perdidas: number;
  /** Suma de los días que estuvo colgada cada prenda del grupo. */
  diasPrenda: number;
  /** Días en que hubo al menos una prenda del grupo colgada. */
  diasAlguna: number;
  /** Ritmo por prenda colgada y por día (para apoyar a cada prenda); null sin días colgada. */
  ritmoPorPrenda: number | null;
  /** Lo que vende el grupo por día en la tienda. */
  ritmoDia: number | null;
  /** true si el grupo vendió sin que el sistema lo viera colgado (stock sin cargar): el ritmo se midió sobre la ventana entera. */
  exposicionEstimada: boolean;
  /** Lo libre hoy en piso y almacén. */
  disponible: number;
};

export function gruposDeDemanda(l: LecturaDemanda): Map<string, GrupoDemanda> {
  const mapa = new Map<string, GrupoDemanda>();
  const tomar = (categoriaId: string | null, tallaId: string | null, familiaColor: string | null) => {
    const clave = claveGrupo(categoriaId, tallaId, familiaColor);
    let g = mapa.get(clave);
    if (!g) {
      g = { clave, categoriaId, tallaId, talla: null, familiaColor, ventas: 0, anotadas: 0, perdidas: 0, diasPrenda: 0, diasAlguna: 0, ritmoPorPrenda: null, ritmoDia: null, exposicionEstimada: false, disponible: 0 };
      mapa.set(clave, g);
    }
    return g;
  };
  for (const p of l.variantes) {
    const g = tomar(p.categoriaId, p.tallaId, p.familiaColor);
    g.talla ??= p.talla;
    g.ventas += p.vendidas;
    g.diasPrenda += p.diasExpuesta;
    g.disponible += p.pisoHoy + p.almacenHoy;
  }
  for (const r of l.grupos) {
    const g = tomar(r.categoriaId, r.tallaId, r.familiaColor);
    // Lo que se pidió y no había es demanda que no se pudo atender: cuenta como una venta (ADR-0348). Sin esto, lo que se agota
    // «deja de venderse» justo cuando más se pide.
    g.ventas += r.anotadas + r.perdidas;
    g.anotadas += r.anotadas;
    g.perdidas += r.perdidas;
    g.diasAlguna = r.diasAlgunaExpuesta;
  }
  for (const g of mapa.values()) {
    g.ritmoPorPrenda = g.diasPrenda > 0 ? g.ventas / g.diasPrenda : null;
    if (g.diasAlguna > 0) g.ritmoDia = g.ventas / g.diasAlguna;
    else if (g.ventas > 0 && l.dias > 0) {
      g.ritmoDia = g.ventas / l.dias;
      g.exposicionEstimada = true;
    }
  }
  return mapa;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Prendas
// ---------------------------------------------------------------------------------------------------------------------

export type RitmoPrenda = {
  varianteId: string;
  /** Unidades por día mientras está colgada; null si no hay base (ni ventas ni días colgada, ni grupo). */
  ritmoDia: number | null;
  /** Cuánto pesa la propia prenda frente a su grupo (0 a 1). */
  pesoPropio: number;
  vendidas: number;
  diasExpuesta: number;
};

/** El ritmo de una prenda apoyado en su grupo: (x + K·r_g) ÷ (e + K). */
export function ritmoDePrenda(p: PrendaDemanda, g: GrupoDemanda | undefined, k = K_DIAS_PRENDA): RitmoPrenda {
  const pesoPropio = p.diasExpuesta / (p.diasExpuesta + k);
  const rg = g?.ritmoPorPrenda ?? null;
  let ritmoDia: number | null;
  if (rg !== null) ritmoDia = (p.vendidas + k * rg) / (p.diasExpuesta + k);
  else ritmoDia = p.diasExpuesta > 0 ? p.vendidas / p.diasExpuesta : null;
  return { varianteId: p.varianteId, ritmoDia, pesoPropio, vendidas: p.vendidas, diasExpuesta: p.diasExpuesta };
}

export function ritmosDePrendas(l: LecturaDemanda): Map<string, RitmoPrenda> {
  const grupos = gruposDeDemanda(l);
  return new Map(l.variantes.map((p) => [p.varianteId, ritmoDePrenda(p, grupos.get(claveGrupo(p.categoriaId, p.tallaId, p.familiaColor)))]));
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. La red (solo las tiendas donde el motor puede hablar)
// ---------------------------------------------------------------------------------------------------------------------

export type SedeDemanda = { ubicacionId: string; nombre: string; puedeHablar: boolean; lectura: LecturaDemanda | null };

/** Ritmo de cada prenda sumando las tiendas que pueden hablar. Una tienda callada no suma nada: ni cero ni su número. */
export function ritmoDeLaRed(sedes: readonly SedeDemanda[]): Map<string, number> {
  const red = new Map<string, number>();
  for (const s of sedes) {
    if (!s.puedeHablar || !s.lectura) continue;
    for (const r of ritmosDePrendas(s.lectura).values()) {
      if (r.ritmoDia === null) continue;
      red.set(r.varianteId, (red.get(r.varianteId) ?? 0) + r.ritmoDia);
    }
  }
  return red;
}

/** Cuánto fabricar de una prenda según el motor: lo que se venderá en `dias` menos lo que ya hay y viene. */
export function sugerenciaDelMotor(ritmoDia: number | undefined, disponible: number, dias: number): number | null {
  if (ritmoDia === undefined || ritmoDia <= 0) return null;
  return Math.max(0, Math.ceil(ritmoDia * dias - disponible - 1e-9));
}

export type FaltaEnGrupo = {
  clave: string;
  categoriaId: string | null;
  talla: string | null;
  familiaColor: string | null;
  ritmoDia: number;
  disponible: number;
  /** Cuántos días alcanza lo que hay, al ritmo del grupo. */
  alcanceDias: number;
  sedes: string[];
};

/**
 * «Se vendió rápido y falta» para el Taller: los grupos (categoría × talla × familia de color) cuya venta, sumando las tiendas que
 * pueden hablar, no alcanza `DIAS_ALCANCE_FALTA` días con lo que hay. De más urgente a menos.
 */
export function seVendioRapidoYFalta(sedes: readonly SedeDemanda[], categoriaId?: string | null): FaltaEnGrupo[] {
  const red = new Map<string, FaltaEnGrupo>();
  for (const s of sedes) {
    if (!s.puedeHablar || !s.lectura) continue;
    for (const g of gruposDeDemanda(s.lectura).values()) {
      if (categoriaId !== undefined && g.categoriaId !== categoriaId) continue;
      if (g.ritmoDia === null || g.ritmoDia <= 0) continue;
      const f = red.get(g.clave) ?? { clave: g.clave, categoriaId: g.categoriaId, talla: g.talla, familiaColor: g.familiaColor, ritmoDia: 0, disponible: 0, alcanceDias: 0, sedes: [] };
      f.talla ??= g.talla;
      f.ritmoDia += g.ritmoDia;
      f.disponible += g.disponible;
      f.sedes.push(s.nombre);
      red.set(g.clave, f);
    }
  }
  return [...red.values()]
    .map((f) => ({ ...f, alcanceDias: f.disponible / f.ritmoDia }))
    .filter((f) => f.alcanceDias < DIAS_ALCANCE_FALTA)
    .sort((a, b) => a.alcanceDias - b.alcanceDias || b.ritmoDia - a.ritmoDia || a.clave.localeCompare(b.clave));
}

const redondear1 = (n: number) => Math.round(n * 10) / 10;

/** «Se venden 1,4 por día; lo que hay alcanza 3 días.» */
export function fraseDeFalta(f: FaltaEnGrupo): string {
  const ritmo = redondear1(f.ritmoDia).toLocaleString("es-PE");
  const alcance = f.disponible === 0 ? "ya no queda ninguna" : `lo que hay alcanza ${Math.floor(f.alcanceDias)} ${Math.floor(f.alcanceDias) === 1 ? "día" : "días"}`;
  return `Se venden ${ritmo} por día; ${alcance}.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. Producción: la curva del motor, AL LADO de la de siempre (Felipe, 2026-10-05: comparar antes de reemplazar)
// ---------------------------------------------------------------------------------------------------------------------

export type CurvaDelMotor = {
  /** Las tiendas cuyos datos usa (las que pueden hablar). Vacío = el motor todavía no recomienda. */
  hablan: string[];
  /** Por prenda: cuánto fabricar según el motor (null = sin base para decir). */
  porVariante: Map<string, number | null>;
  total: number;
};

/**
 * La curva del motor para un modelo. `disponible(varianteId)` es lo que la curva de siempre ya cuenta como disponible (red, Taller,
 * en camino y órdenes abiertas), para que las dos se comparen sobre el mismo stock y solo cambie el ritmo.
 */
export function curvaDelMotor(
  variantes: readonly { varianteId: string }[],
  sedes: readonly SedeDemanda[],
  disponible: (varianteId: string) => number,
  dias: number
): CurvaDelMotor {
  const hablan = sedes.filter((s) => s.puedeHablar && s.lectura).map((s) => s.nombre);
  const red = ritmoDeLaRed(sedes);
  const porVariante = new Map<string, number | null>();
  let total = 0;
  for (const v of variantes) {
    const n = hablan.length === 0 ? null : sugerenciaDelMotor(red.get(v.varianteId), disponible(v.varianteId), dias);
    porVariante.set(v.varianteId, n);
    total += n ?? 0;
  }
  return { hablan, porVariante, total };
}

/** «Con datos de Tienda TRU y Tienda AQP.» */
export function fraseDeQuienHabla(hablan: readonly string[]): string {
  if (hablan.length === 0) return "";
  const lista = hablan.length > 1 ? `${hablan.slice(0, -1).join(", ")} y ${hablan.at(-1)}` : hablan[0];
  return `Con datos de ${lista}.`;
}
