/**
 * Las variantes en la ficha de una prenda que YA existe (ADR-0263): corregir su color o su talla, agregar colores y
 * tallas, cambiar precio o costo en bloque y traducir todo eso a la cuenta de «qué va a cambiar» del guardado en dos
 * tiempos (ADR-0257, `variantesParaResumen`). Puro: sin React ni red.
 *
 * EL PROBLEMA. Hasta el 2026-09-28 la ficha era una lista de filas sueltas: el color y la talla de una variante que ya
 * existía eran de solo lectura (D-133), agregar Azul a una prenda S/M/L eran tres filas escritas a mano, y el alta —que
 * piensa por ejes, talla × color— y la ficha resolvían lo mismo de dos formas. BOD-0003 nació «Sin color» con 17
 * unidades en tienda y no había cómo ponerle el color sin inventar un −17 / +17 en el inventario.
 *
 * DOS GESTOS QUE NO SE MEZCLAN (Don Norman: la encargada que no tiene a quién preguntar).
 *   - CORREGIR: «esta prenda se registró mal». La variante es la misma prenda física: conserva su id, su stock, su
 *     historia y sus etiquetas pegadas (el código viejo sigue sonando, D-137). Si ya se vendió, solo un líder (D-136).
 *   - AGREGAR: «llegó un color o una talla nueva». Nacen variantes nuevas, sin stock.
 *
 * CONTRATO
 *   PROMETE: dado el estado local de las filas, decir qué se ve en cada grupo de color, qué corrección choca con otra
 *            variante (D-138, «Sin color» cuenta como un color), qué viaja en `p_variantes` y en qué orden (las claves
 *            de identidad SOLO en las corregidas), qué falta para guardar y cómo cuenta cada fila en la barra y la hoja.
 *   ASUME:   la base es la que manda (`fn_corregir_identidad_variante`, 20260929045000): lo de aquí es para avisar
 *            ANTES y mostrar lo mismo que va a quedar (código previsto, fotos y temporada que siguen al color). Si
 *            algo de aquí se equivoca, la base rechaza y la ficha muestra su frase.
 *   NO HACE: no lee ni escribe en la base; no decide permisos (el «solo líder» lo exige la base con la cuenta);
 *            no une variantes (D-138: si una corrección cae sobre otra que existe, se bloquea).
 */

import { claveCelda, codigoVariantePrevisto, margenPorcentaje } from "./alta-producto";
import type { VarianteFicha } from "./producto-cambios-reglas";
import { compararTallas } from "./tallas";
import { SIN_PROPIA } from "./temporada-reglas";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Qué ES una variante dentro de su prenda: su color y su talla. `null` = «Sin color» / sin talla (y cuenta como uno). */
export type Identidad = { colorCodigo: string | null; tallaId: string | null };

/** Una corrección: la clave que viene cambia ese eje; `undefined` = ese eje no se toca. `null` = sin color / sin talla. */
export type Destino = { colorCodigo?: string | null; tallaId?: string | null };

/** Cómo está la variante en la base (la foto al abrir la ficha, o tras el último guardado bueno). */
export type GuardadaFicha = Identidad & {
  precio: string;
  costo: string;
  activo: boolean;
  /** El código que lee la pistola (BOD-0003-S). */
  codigo: string | null;
  etiquetaIds: string[];
};

export type FilaFicha = Identidad & {
  /** Estable para React y para ubicar la fila: el id de la variante, o `nueva:…` si todavía no existe. */
  clave: string;
  id: string | null;
  /** `null` = variante nueva (se crea al guardar). */
  guardada: GuardadaFicha | null;
  /** Los códigos que ya suenan para esta variante (el propio, el de fábrica, los viejos tras una corrección). */
  codigosBarras: string[];
  precio: string;
  costo: string;
  /** El costo viene de Compras o del Taller (promedio ponderado): no se corrige a mano (20260927190000). */
  costoFijo: boolean;
  activo: boolean;
  etiquetaIds: string[];
};

/** Lo que `fn_variantes_estado` dice de una variante: sus unidades (todas las sedes) y si ya se vendió o se apartó. */
export type EstadoVariante = {
  stock: number;
  apartado: number;
  /** Solo las sedes donde tiene unidades, por nombre. */
  sedes: { ubicacionId: string; nombre: string; cantidad: number }[];
  /** Salió con una clienta: tiene `venta_items`, `separacion_items` o es la prenda que se llevó en un cambio
   *  (`cambios.variante_nueva_id`). Corregirla es solo de un líder (D-136, T6). */
  vendida: boolean;
};

/** Cómo se llaman las cosas en pantalla. `talla` devuelve el valor tal cual («S», «38») o "" si no tiene talla. */
export type NombresFicha = { color: (codigo: string | null) => string; talla: (tallaId: string | null) => string };

/** Lo que trae `getProducto` por variante (solo lo que la ficha usa). */
export type VarianteOrigen = Identidad & {
  id: string;
  precio: number;
  costo: number | null;
  costoOficial: boolean | null;
  activo: boolean;
  codigo: string | null;
  codigosBarras: string[];
  etiquetaIds: string[];
};

// ---------------------------------------------------------------------------
// Armar las filas y nombrarlas
// ---------------------------------------------------------------------------

const mismaIdentidad = (a: Identidad, b: Identidad) => a.colorCodigo === b.colorCodigo && a.tallaId === b.tallaId;

/** «Negro S», «Sin color M», «Negro» (sin talla). Es como la encargada nombra una prenda. */
export function nombreVariante(v: Identidad, n: NombresFicha): string {
  const talla = n.talla(v.tallaId);
  return talla ? `${n.color(v.colorCodigo)} ${talla}` : n.color(v.colorCodigo);
}

/**
 * Las filas con que abre la ficha. Ordenadas por color («Sin color» primero, después por nombre) y por talla: el orden
 * de los grupos queda fijo desde aquí (un grupo corregido no salta de lugar; uno agregado va al final).
 */
export function filasDeProducto(variantes: readonly VarianteOrigen[], n: NombresFicha): FilaFicha[] {
  const rango = (c: string | null) => (c === null ? "" : `~${n.color(c)}`);
  return [...variantes]
    .sort((a, b) => rango(a.colorCodigo).localeCompare(rango(b.colorCodigo), "es") || compararTallas(n.talla(a.tallaId), n.talla(b.tallaId)))
    .map((v) => {
      // Con dos decimales (59.90, no 59.9): se lee como un precio. Comparar para «¿cambió?» es por número (`resumenDeCambios`, lib/producto-cambios-reglas.ts).
      const precio = v.precio.toFixed(2);
      const costo = v.costo === null ? "" : v.costo.toFixed(2);
      return {
        clave: v.id,
        id: v.id,
        colorCodigo: v.colorCodigo,
        tallaId: v.tallaId,
        guardada: {
          colorCodigo: v.colorCodigo,
          tallaId: v.tallaId,
          precio,
          costo,
          activo: v.activo,
          codigo: v.codigo,
          etiquetaIds: v.etiquetaIds,
        },
        codigosBarras: v.codigosBarras,
        precio,
        costo,
        // Sin saber si es oficial (la migración aún no está, o la lectura falló), se trata como oficial: es lo que no puede
        // pisar nada. La ficha lo dice aparte (`costoSinComprobar`), para no afirmar que «ya entró por Compras».
        costoFijo: v.costoOficial !== false,
        activo: v.activo,
        etiquetaIds: v.etiquetaIds,
      };
    });
}

/** Una fila se ve en su grupo si está activa o si se abrió activa: la que se desactiva ahora sigue en su lugar, con
 *  su aviso. Las que ya estaban desactivadas al abrir van al final, plegadas («Mostrar desactivadas»). */
export function enGrupo(f: FilaFicha): boolean {
  return f.activo || !!f.guardada?.activo;
}

function ejesDe(filas: readonly FilaFicha[], n: NombresFicha): { colores: (string | null)[]; tallas: (string | null)[] } {
  const colores: (string | null)[] = [];
  const tallas: (string | null)[] = [];
  for (const f of filas) {
    if (!colores.includes(f.colorCodigo)) colores.push(f.colorCodigo);
    if (!tallas.includes(f.tallaId)) tallas.push(f.tallaId);
  }
  tallas.sort((a, b) => compararTallas(n.talla(a), n.talla(b)));
  return { colores, tallas };
}

/** Los colores y las tallas que la prenda VENDE hoy (variantes activas, nuevas incluidas). Tallas ordenadas. */
export function ejesDeLaPrenda(filas: readonly FilaFicha[], n: NombresFicha): { colores: (string | null)[]; tallas: (string | null)[] } {
  return ejesDe(
    filas.filter((f) => f.activo),
    n,
  );
}

/**
 * Los colores y las tallas con que se arma lo que se AGREGA: los que la prenda vende hoy; si no vende ninguna (todas
 * desactivadas), los de TODAS sus variantes (`deDesactivadas`). Sin esto, una prenda Negro S/M/L toda desactivada
 * recibía un «Azul marino» sin talla (una «Única») o tallas nuevas «Sin color», y la base las aceptaba.
 */
export function ejesDeReferencia(filas: readonly FilaFicha[], n: NombresFicha): { colores: (string | null)[]; tallas: (string | null)[]; deDesactivadas: boolean } {
  const activas = filas.filter((f) => f.activo);
  return activas.length > 0 ? { ...ejesDe(activas, n), deDesactivadas: false } : { ...ejesDe(filas, n), deDesactivadas: filas.length > 0 };
}

/**
 * Las tallas en que nace un color que llegó: las de la prenda (`ejesDeReferencia`), y de esas solo se eligen las que la
 * categoría de HOY habilita —la base rechaza una variante nueva en otra talla y con eso el guardado entero—. Las demás se
 * muestran apagadas, con su porqué. Una prenda sin variantes toma las de su categoría. Vacío = la prenda no tiene talla
 * (nace una sola variante por color, como una correa).
 */
export function tallasParaAgregarColor(
  filas: readonly FilaFicha[],
  n: NombresFicha,
  habilitadas: readonly { id: string }[],
): { id: string; habilitada: boolean }[] {
  const ids = new Set(habilitadas.map((t) => t.id));
  if (filas.length === 0) return habilitadas.map((t) => ({ id: t.id, habilitada: true }));
  return ejesDeReferencia(filas, n)
    .tallas.filter((t): t is string => t !== null)
    .map((id) => ({ id, habilitada: ids.has(id) }));
}

/** «XXL ya no está habilitada en Bodies»: por qué una talla de la prenda no se ofrece al agregar un color. */
export function textoTallasApagadas(apagadas: readonly string[], n: NombresFicha, categoriaNombre?: string): string | null {
  if (apagadas.length === 0) return null;
  const nombres = apagadas.map((t) => n.talla(t) || "sin talla");
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  const donde = categoriaNombre ? `en ${categoriaNombre}` : "en su categoría";
  return apagadas.length === 1
    ? `${lista} ya no está habilitada ${donde}: el color nuevo no nace en esa talla.`
    : `${lista} ya no están habilitadas ${donde}: el color nuevo no nace en esas tallas.`;
}

/**
 * Los colores en que nace una talla que llegó: los de la prenda (`ejesDeReferencia`) que siguen activos en el vocabulario
 * (`activos`); los que ya no, aparte —la base no crea una variante en un color inactivo y rechazaría el guardado entero—.
 * `sinColor`: la prenda es «Sin color» (y la talla nace así, como las que ya tiene). Sin variantes, ni lo uno ni lo otro:
 * primero hay que agregar un color.
 */
export function coloresParaAgregarTalla(
  filas: readonly FilaFicha[],
  n: NombresFicha,
  activos: readonly string[],
): { colores: string[]; inactivos: string[]; sinColor: boolean; deDesactivadas: boolean } {
  const ref = ejesDeReferencia(filas, n);
  const conColor = ref.colores.filter((c): c is string => c !== null);
  return {
    colores: conColor.filter((c) => activos.includes(c)),
    inactivos: conColor.filter((c) => !activos.includes(c)),
    sinColor: conColor.length === 0 && ref.colores.length > 0,
    deDesactivadas: ref.deDesactivadas,
  };
}

/** Las filas de un grupo de color (lo que corrige «Corregir color») o de una talla (lo que corrige «Corregir talla»). */
export function filasDelEje(filas: readonly FilaFicha[], eje: "color" | "talla", valor: string | null): FilaFicha[] {
  return filas.filter((f) => enGrupo(f) && (eje === "color" ? f.colorCodigo === valor : f.tallaId === valor));
}

/** Unidades en stock de estas filas (todas las sedes). `null` si no se sabe (la función de estado no está en la base). */
export function unidadesEnStock(filas: readonly FilaFicha[], estado: Readonly<Record<string, EstadoVariante>> | null): number | null {
  if (!estado) return null;
  return filas.reduce((suma, f) => suma + (f.id ? (estado[f.id]?.stock ?? 0) : 0), 0);
}

// ---------------------------------------------------------------------------
// Corregir (D-136 · D-137 · D-138)
// ---------------------------------------------------------------------------

/** Todas son nuevas (todavía no existen): cambiarlas no es «corregir» nada, es «cambiar» (el botón, el chip y el modal
 *  dicen el mismo verbo). Una sola que ya exista y el gesto es «Corregir». */
export function todasNuevas(filas: readonly FilaFicha[]): boolean {
  return filas.length > 0 && filas.every((f) => !f.guardada);
}

/** ¿Esta fila (que ya existe) tiene otro color o talla que en la base? */
export function corregida(f: FilaFicha): boolean {
  return !!f.guardada && (f.colorCodigo !== f.guardada.colorCodigo || f.tallaId !== f.guardada.tallaId);
}

function aplicarDestino(f: Identidad, d: Destino): Identidad {
  return { colorCodigo: d.colorCodigo === undefined ? f.colorCodigo : d.colorCodigo, tallaId: d.tallaId === undefined ? f.tallaId : d.tallaId };
}

/** Cambia el color y/o la talla de estas filas. No revisa choques: eso es `choqueDeCorreccion`, antes. */
export function corregir(filas: readonly FilaFicha[], claves: readonly string[], destino: Destino): FilaFicha[] {
  return filas.map((f) => (claves.includes(f.clave) ? { ...f, ...aplicarDestino(f, destino) } : f));
}

/** Lo que devuelve «Deshacer»: la fila vuelve a su color y su talla guardados. */
export function destinoGuardado(f: FilaFicha): Destino {
  return f.guardada ? { colorCodigo: f.guardada.colorCodigo, tallaId: f.guardada.tallaId } : {};
}

export type Choque = {
  /** La fila que se quiere corregir. */
  fila: FilaFicha;
  /** La que ya tiene esa combinación. */
  con: FilaFicha;
  /** `con` también se está corrigiendo en este mismo gesto (dos quedarían iguales). */
  entreLasQueSeCorrigen: boolean;
};

/**
 * D-138: la corrección cae sobre una combinación que ya tiene OTRA variante de la prenda (activa o no; «Sin color» cuenta
 * como un color), o deja dos de las corregidas iguales. `null` = no choca. La base lo vuelve a exigir.
 */
export function choqueDeCorreccion(filas: readonly FilaFicha[], claves: readonly string[], destino: Destino): Choque | null {
  const quietas = filas.filter((f) => !claves.includes(f.clave));
  const yaMovidas: { destino: Identidad; fila: FilaFicha }[] = [];
  for (const f of filas) {
    if (!claves.includes(f.clave)) continue;
    const d = aplicarDestino(f, destino);
    const con = quietas.find((o) => mismaIdentidad(o, d));
    if (con) return { fila: f, con, entreLasQueSeCorrigen: false };
    const gemela = yaMovidas.find((m) => mismaIdentidad(m.destino, d));
    if (gemela) return { fila: f, con: gemela.fila, entreLasQueSeCorrigen: true };
    yaMovidas.push({ destino: d, fila: f });
  }
  return null;
}

/** Lo que los textos de la ficha necesitan saber de la prenda (ContextoFicha lo cumple). */
export type ContextoTextos = {
  nombres: NombresFicha;
  /** El código del producto (BOD-0003): la base del código de cada variante. */
  codigoProducto: string | null;
  estado: Readonly<Record<string, EstadoVariante>> | null;
};

/**
 * El código que la fila MUESTRA en pantalla: el suyo si no cambió; el previsto si es nueva o se corrigió. Es el que se
 * nombra en los avisos, para que la persona encuentre la fila de la que se le habla.
 */
export function codigoQueMuestra(filas: readonly FilaFicha[], f: FilaFicha, base: string | null, n: NombresFicha): string | null {
  if (f.guardada && !corregida(f)) return f.guardada.codigo;
  return codigoPrevisto(filas, f, f, base, n);
}

/**
 * El aviso de un choque, con la variante que ya está (el código que muestra su fila) y qué hacer.
 *   - La otra es una corrección todavía sin guardar: basta deshacer esa (nada de desactivar ni de ajustar stock).
 *   - La otra existe y se vende: primero sus unidades pasan a la otra con un ajuste, DESPUÉS se desactiva esta (desactivar
 *     no saca las unidades del inventario: solo deja de venderlas).
 */
export function textoChoque(c: Choque, destino: Destino, filas: readonly FilaFicha[], ctx: ContextoTextos): string {
  const n = ctx.nombres;
  const nombre = nombreVariante(aplicarDestino(c.fila, destino), n);
  if (c.entreLasQueSeCorrigen) return `Dos variantes quedarían como ${nombre}: corrige de a una.`;
  if (!c.con.guardada) return `${nombre} ya está entre las variantes nuevas de esta ficha: quítala primero, o elige otra combinación.`;
  const codigoOtra = codigoQueMuestra(filas, c.con, ctx.codigoProducto, n);
  const codigo = codigoOtra ? ` (${codigoOtra})` : "";
  if (corregida(c.con)) return `${nombre} es la corrección pendiente de ${nombreVariante(c.con.guardada, n)}${codigo}: deshaz esa primero.`;
  // Las mismas frases que `fn_corregir_identidad_variante` (hint `variante_ya_existe`): antes y después de pulsar, lo mismo.
  if (!c.con.activo) return `Ya existe ${nombre} en esta prenda${codigo}, pero está desactivada: reactívala en vez de corregir esta.`;
  const u = c.fila.id && ctx.estado ? (ctx.estado[c.fila.id]?.stock ?? 0) : null;
  const receta =
    u === null
      ? "pasa su stock a esa con un ajuste y después desactiva esta"
      : u > 0
        ? `pasa sus ${u} u. a esa con un ajuste y después desactiva esta`
        : "desactiva esta (no tiene unidades)";
  return `Ya existe ${nombre} en esta prenda${codigo}. Elige otra combinación; si de verdad son la misma prenda, ${receta}.`;
}

/**
 * D-136: si alguna de estas variantes ya salió con una clienta (una venta, una separación con abonos en Apartados o la
 * prenda que se llevó en un cambio: `EstadoVariante.vendida`) y la cuenta no es de un líder, el porqué en palabras;
 * `null` = se puede. Sin saber (`estado` null: la función no está en la base) se permite y decide la base.
 * La frase nombra SOLO lo que cuenta, igual que la base (`fn_corregir_identidad_variante`): «Apartar» de Existencias
 * (sin dinero, la fila muestra «· N ap.») no bloquea, y decir «o una clienta la apartó» contradecía a esa misma fila.
 */
export function bloqueoPorVenta(
  filas: readonly FilaFicha[],
  estado: Readonly<Record<string, EstadoVariante>> | null,
  esLider: boolean,
  n: NombresFicha,
): string | null {
  if (esLider || !estado) return null;
  const vendidas = filas.filter((f) => f.id && estado[f.id]?.vendida);
  if (vendidas.length === 0) return null;
  const nombres = vendidas.map((f) => f.guardada?.codigo ?? nombreVariante(f, n));
  const lista = nombres.length <= 3 ? nombres.join(", ") : `${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} más`;
  return `${lista} ya ${vendidas.length === 1 ? "salió" : "salieron"} con un cliente (venta, separación en Apartados o cambio): solo un líder corrige su color o su talla.`;
}

/** «Sin color» se ofrece al corregir solo si no deja a la prenda mezclando: todas las demás activas ya son «Sin color». */
export function puedeQuedarSinColor(filas: readonly FilaFicha[], claves: readonly string[]): boolean {
  return filas.every((f) => claves.includes(f.clave) || !f.activo || f.colorCodigo === null);
}

/**
 * El código que va a tener la variante con su identidad nueva (D-137): el de siempre (base-color-talla) y, si otra
 * variante de la prenda ya lo usa (como código o en sus códigos de barras), con -2, -3… `null` si la prenda todavía no
 * tiene código. Aproximado: la base es la que lo asigna.
 */
export function codigoPrevisto(filas: readonly FilaFicha[], fila: FilaFicha, destino: Identidad, base: string | null, n: NombresFicha): string | null {
  if (!base) return null;
  const propuesto = codigoVariantePrevisto(base, destino.colorCodigo, n.talla(destino.tallaId) || null);
  const ocupados = new Set<string>();
  for (const o of filas) {
    if (o.clave === fila.clave) continue;
    if (o.guardada?.codigo) ocupados.add(o.guardada.codigo);
    for (const c of o.codigosBarras) ocupados.add(c);
  }
  if (!ocupados.has(propuesto)) return propuesto;
  let i = 2;
  while (ocupados.has(`${propuesto}-${i}`)) i++;
  return `${propuesto}-${i}`;
}

/** La vista previa de una corrección: de qué código a qué código pasa cada fila. */
export function vistaPreviaCorreccion(
  filas: readonly FilaFicha[],
  claves: readonly string[],
  destino: Destino,
  base: string | null,
  n: NombresFicha,
): { clave: string; antes: string; despues: string | null; nombre: string }[] {
  return filas
    .filter((f) => claves.includes(f.clave))
    .map((f) => {
      const d = aplicarDestino(f, destino);
      // Volver a lo guardado no cambia el código: la base solo lo recalcula si la identidad es otra.
      const vuelve = f.guardada && mismaIdentidad(d, f.guardada);
      return {
        clave: f.clave,
        antes: f.guardada?.codigo ?? nombreVariante(f, n),
        despues: vuelve ? (f.guardada?.codigo ?? null) : codigoPrevisto(filas, f, d, base, n),
        nombre: nombreVariante(d, n),
      };
    });
}

// ---------------------------------------------------------------------------
// Fotos y temporada siguen al color (ADR-0228, ADR-0246): lo mismo que hace la base al corregir.
//
// Nada se mueve «gesto a gesto». Todo lo que tiene color —una foto guardada, una recién subida, la temporada elegida a
// mano para un color— se guarda con su COLOR DE ORIGEN (un color de lo guardado) y se ubica en cada pintada con las
// mudanzas que la base haría HOY (`mudanzasAlGuardar`). Así «Deshacer» una corrección lo devuelve todo solo: la
// integración de ADR-0263 lo hizo para las fotos guardadas y la revisión del 2026-09-28 encontró el mismo desfase en las
// fotos nuevas y en la temporada elegida a mano (se quedaban en el color en que se fundieron y se guardaban ahí).
// ---------------------------------------------------------------------------

/** Un traslado de color: viejo → nuevo (`null` = «Sin color»). */
export type Mudanza = readonly [string, string | null];

/**
 * Los colores que la BASE va a mudar al guardar, en el orden en que los muda (`fn_corregir_identidad_variante`): corrige
 * las variantes en el orden de `payloadVariantes` y, tras cada una, si su color viejo ya no lo tiene ninguna variante que
 * EXISTA (activa o no; las nuevas todavía no se crearon), sus fotos y su temporada pasan al color nuevo.
 *
 * Se calcula SIEMPRE desde lo guardado, no gesto a gesto (integración ADR-0263). Gesto a gesto había dos diferencias con
 * la base: (1) «Deshacer» después de fundir un color en otro que ya existía (Negro S → Azul S con un Azul M) no devolvía
 * las fotos del Negro —el Azul no desaparecía— y el guardado las mandaba como Azul sin que nadie lo pidiera; (2) corregir
 * todo el Negro a Azul y en el mismo guardado agregar una Negro M nueva: la ficha veía que el Negro seguía (por la nueva)
 * y la base lo mudaba igual (la nueva nace después).
 */
export function mudanzasAlGuardar(filas: readonly FilaFicha[]): Mudanza[] {
  const orden = ordenDeGuardado(filas) ?? filas;
  const colorDe = new Map<string, string | null>();
  for (const f of filas) if (f.guardada) colorDe.set(f.clave, f.guardada.colorCodigo);
  const mudanzas: Mudanza[] = [];
  for (const f of orden) {
    if (!corregida(f)) continue;
    const viejo = colorDe.get(f.clave) ?? null;
    colorDe.set(f.clave, f.colorCodigo);
    if (viejo === null || viejo === f.colorCodigo) continue;
    if (![...colorDe.values()].includes(viejo)) mudanzas.push([viejo, f.colorCodigo]);
  }
  return mudanzas;
}

/** Dónde termina un color después de estas mudanzas, en orden (la base hace un `update … where color = viejo` por cada una). */
export function colorTrasMudanzas(color: string | null, mudanzas: readonly Mudanza[]): string | null {
  let c = color;
  for (const [viejo, nuevo] of mudanzas) if (c === viejo) c = nuevo;
  return c;
}

/**
 * De dónde sale algo que se eligió a mano para el color que HOY se ve como `color`: `origen` es el color de lo guardado
 * que, con las correcciones pendientes, termina en `color`. En orden:
 *   - un color guardado que no se muda es él mismo (al fundir Negro S en el Azul, lo elegido para el Azul es del Azul);
 *   - un color al que llega una corrección es el de las filas que llegan (Negro corregido a Rojo: lo elegido para el Rojo
 *     sigue a esas prendas, y si se deshace, vuelve al Negro);
 *   - un color que no está en lo guardado es él mismo (uno agregado);
 *   - un color guardado que se muda pero todavía se ve (por filas nuevas en él) queda `fijo`: la base guarda lo que se le
 *     manda después de corregir, y eso es literalmente ese color.
 * Siempre vale `ubicar(anclar(c, filas), mudanzasAlGuardar(filas)) === c`: elegir algo no lo mueve de donde se eligió.
 */
export type Anclaje = { origen: string | null; fijo: boolean };

export function anclar(color: string | null, filas: readonly FilaFicha[]): Anclaje {
  if (color === null) return { origen: null, fijo: false };
  const mudanzas = mudanzasAlGuardar(filas);
  const queda = colorTrasMudanzas(color, mudanzas) === color;
  if (queda && filas.some((f) => f.guardada?.colorCodigo === color)) return { origen: color, fijo: false };
  const desde = mudanzas.find(([viejo]) => colorTrasMudanzas(viejo, mudanzas) === color);
  if (desde) return { origen: desde[0], fijo: false };
  return { origen: color, fijo: !queda };
}

/** Dónde se ve hoy algo anclado a un color de origen (las generales, sin color, no se mueven nunca). */
export function ubicar(a: Anclaje, mudanzas: readonly Mudanza[]): string | null {
  return a.fijo ? a.origen : colorTrasMudanzas(a.origen, mudanzas);
}

/** Una foto de la ficha con su color de ORIGEN en `colorCodigo` (y `fijo`, ver `anclar`). */
type FotoAnclada = { clientKey: string; colorCodigo: string | null; fijo?: boolean };

/** Las fotos como se ven y como viajan al guardar: cada una en el color al que la llevan las correcciones pendientes. */
export function fotosComoSeVen<T extends FotoAnclada>(fotos: readonly T[], mudanzas: readonly Mudanza[]): T[] {
  return fotos.map((f) => {
    const color = ubicar({ origen: f.colorCodigo, fijo: !!f.fijo }, mudanzas);
    return color === f.colorCodigo ? f : { ...f, colorCodigo: color };
  });
}

/**
 * Lo que devuelve el editor de fotos (con los colores como se ven) pasa a colores de origen: la foto cuyo color no cambió
 * conserva su origen; la recién subida o la que se recoloreó a mano se ancla ahora al color que se le puso.
 */
export function anclarFotos<T extends FotoAnclada>(siguientes: readonly T[], antes: readonly T[], filas: readonly FilaFicha[]): (T & { fijo: boolean })[] {
  const mudanzas = mudanzasAlGuardar(filas);
  const previas = new Map(antes.map((f) => [f.clientKey, f]));
  return siguientes.map((f) => {
    const previa = previas.get(f.clientKey);
    const suya = previa ? { origen: previa.colorCodigo, fijo: !!previa.fijo } : null;
    const a = suya && ubicar(suya, mudanzas) === f.colorCodigo ? suya : anclar(f.colorCodigo, filas);
    return { ...f, colorCodigo: a.origen, fijo: a.fijo };
  });
}

/** La temporada que la persona eligió a mano para un color, anclada a su color de origen. */
export type TemporadaElegida = Anclaje & { clave: string };

/** Elegir la temporada del color que hoy se ve como `color` (reemplaza lo elegido antes para ese mismo origen). */
export function elegirTemporada(elegidas: readonly TemporadaElegida[], color: string, clave: string, filas: readonly FilaFicha[]): TemporadaElegida[] {
  const a = anclar(color, filas);
  return [...elegidas.filter((e) => e.origen !== a.origen || e.fijo !== a.fijo), { ...a, clave }];
}

/**
 * Dónde se ve hoy cada temporada elegida a mano (color → clave). Si una cae en OTRO color por una corrección y ese color
 * tiene la suya guardada, manda la guardada (ADR-0246: «si el nuevo tiene la suya, manda la del nuevo») y lo elegido se
 * deja de lado sin borrarse: «Deshacer» lo trae de vuelta. Lo elegido para el propio color manda sobre todo.
 */
export function ubicarTemporadas(
  elegidas: readonly TemporadaElegida[],
  mudanzas: readonly Mudanza[],
  porColorBase: Readonly<Record<string, string>>,
): Record<string, string> {
  const llegadas: Record<string, string> = {};
  const propias: Record<string, string> = {};
  for (const e of elegidas) {
    const color = ubicar(e, mudanzas);
    if (color === null) continue;
    if (color === e.origen) {
      propias[color] = e.clave;
      continue;
    }
    const suya = porColorBase[color];
    const tieneLaSuya = suya !== undefined && suya !== SIN_PROPIA && colorTrasMudanzas(color, mudanzas) === color;
    if (!tieneLaSuya) llegadas[color] = e.clave;
  }
  return { ...llegadas, ...propias };
}

/** La temporada propia GUARDADA de un color que desaparece pasa al nuevo si el nuevo no tiene la suya; si la tiene (o
 *  es «Sin color», que no puede tener), manda la del nuevo y la vieja se descarta. Las mudanzas se aplican en orden. */
export function moverTemporadas(porColor: Readonly<Record<string, string>>, mapa: Iterable<Mudanza>): Record<string, string> {
  const salida = { ...porColor };
  for (const [viejo, nuevo] of mapa) {
    const suya = salida[viejo];
    if (suya === undefined) continue;
    delete salida[viejo];
    const nuevoTiene = nuevo !== null && salida[nuevo] !== undefined && salida[nuevo] !== SIN_PROPIA;
    if (nuevo !== null && !nuevoTiene && suya !== SIN_PROPIA) salida[nuevo] = suya;
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Agregar colores y tallas (Shopify «Add another value», mostrando antes las combinaciones: Lightspeed X-Series)
// ---------------------------------------------------------------------------

export type Combinacion = Identidad & {
  /** `nueva`: se crea; `reactiva`: ya existía desactivada y vuelve a venderse (no se duplica); `ya-esta`: ya se vende. */
  queHace: "nueva" | "reactiva" | "ya-esta";
};

export function clasificarCombinaciones(filas: readonly FilaFicha[], combos: readonly Identidad[]): Combinacion[] {
  return combos.map((c) => {
    const existe = filas.find((f) => mismaIdentidad(f, c));
    return { ...c, queHace: !existe ? "nueva" : existe.activo ? "ya-esta" : "reactiva" };
  });
}

/** El valor que más se repite (empate: el primero que aparece). "" si no hay ninguno. */
function masComun(valores: readonly string[]): string {
  const cuenta = new Map<string, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor = "";
  let veces = 0;
  for (const [v, k] of cuenta) if (k > veces) [mejor, veces] = [v, k];
  return mejor;
}

const normalizarMonto = (v: string) => {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? "" : String(Number(n.toFixed(2)));
};

/** Precio y costo con que nacen las variantes nuevas: los más comunes entre las activas (lo que la persona ya decidió);
 *  si todas están desactivadas, entre todas. */
export function precioYCostoPorDefecto(filas: readonly FilaFicha[]): { precio: string; costo: string } {
  const soloActivas = filas.filter((f) => f.activo);
  const activas = soloActivas.length > 0 ? soloActivas : filas;
  // Se cuenta por número (59.9 y 59.90 son el mismo) y se muestra como precio (59.90).
  const comoMonto = (v: string) => (v === "" ? "" : Number(v).toFixed(2));
  return {
    precio: comoMonto(masComun(activas.map((f) => normalizarMonto(f.precio)).filter((p) => p !== "" && Number(p) > 0))),
    costo: comoMonto(masComun(activas.map((f) => normalizarMonto(costoEfectivo(f))).filter((c) => c !== ""))),
  };
}

/** Las etiquetas que tienen TODAS las activas que ya existen, y que esta cuenta puede poner (`ofrecidas`): con esas
 *  nacen las nuevas («Nuevo» en toda la prenda, la nueva también). */
export function etiquetasComunes(filas: readonly FilaFicha[], ofrecidas: readonly string[]): string[] {
  const activas = filas.filter((f) => f.activo && f.id);
  if (activas.length === 0) return [];
  return activas[0].etiquetaIds.filter((id) => ofrecidas.includes(id) && activas.every((f) => f.etiquetaIds.includes(id)));
}

function claveNueva(filas: readonly FilaFicha[], c: Identidad): string {
  const base = `nueva:${claveCelda(c.tallaId, c.colorCodigo)}`;
  if (!filas.some((f) => f.clave === base)) return base;
  let i = 2;
  while (filas.some((f) => f.clave === `${base}~${i}`)) i++;
  return `${base}~${i}`;
}

/** Suma las combinaciones: crea las que no existen y reactiva las que existían desactivadas; las que ya se venden no se tocan. */
export function agregarCombinaciones(
  filas: readonly FilaFicha[],
  combos: readonly Identidad[],
  valores: { precio: string; costo: string; etiquetaIds: string[] },
): FilaFicha[] {
  let salida = [...filas];
  for (const c of clasificarCombinaciones(filas, combos)) {
    if (c.queHace === "ya-esta") continue;
    if (c.queHace === "reactiva") {
      salida = salida.map((f) => (mismaIdentidad(f, c) ? { ...f, activo: true } : f));
      continue;
    }
    salida.push({
      clave: claveNueva(salida, c),
      id: null,
      colorCodigo: c.colorCodigo,
      tallaId: c.tallaId,
      guardada: null,
      codigosBarras: [],
      precio: valores.precio,
      costo: valores.costo,
      costoFijo: false,
      activo: true,
      etiquetaIds: [...valores.etiquetaIds],
    });
  }
  return salida;
}

/** Cambia lo que se edita en la fila (precio, costo, activa, etiquetas). */
export function cambiarFila(filas: readonly FilaFicha[], clave: string, cambio: Partial<Pick<FilaFicha, "precio" | "costo" | "activo" | "etiquetaIds">>): FilaFicha[] {
  return filas.map((f) => (f.clave === clave ? { ...f, ...cambio } : f));
}

/** «Desactivar color»: desactiva TODAS las tallas del color de una vez. Las que ya existen se desactivan (nunca se borran: guardan
 *  stock e historia); las nuevas, que todavía no existen, simplemente se quitan. */
export function desactivarColor(filas: readonly FilaFicha[], claves: readonly string[]): FilaFicha[] {
  const grupo = new Set(claves);
  return filas.filter((f) => !grupo.has(f.clave) || f.id !== null).map((f) => (grupo.has(f.clave) ? { ...f, activo: false } : f));
}

// ---------------------------------------------------------------------------
// Precio y costo: de a una o en bloque
// ---------------------------------------------------------------------------

/** El costo que se guarda y con el que se calcula el margen. Una variante existente con el campo vacío conserva el que
 *  tenía (el vacío no es «cero»); con costo oficial, siempre el guardado. */
export function costoEfectivo(f: FilaFicha): string {
  if (f.guardada && (f.costoFijo || f.costo.trim() === "")) return f.guardada.costo;
  return f.costo;
}

/**
 * ¿Se pudo saber qué costos vienen de compras? `costoOficial` llega `null` cuando `fn_variantes_con_costo_oficial` falló
 * (red, permiso) o no está en la base: todas quedan fijas (`filasDeProducto`) y la ficha tiene que decir POR QUÉ, no que
 * «ya entraron por Compras» (la ficha de `main` lo distinguía; la integración de ADR-0263 lo había perdido).
 */
export function costosSinComprobar(variantes: readonly Pick<VarianteOrigen, "costoOficial">[]): boolean {
  return variantes.some((v) => v.costoOficial === null);
}

/** La nota bajo las variantes cuando hay costos que no se tocan, y el porqué de la celda de uno de ellos. */
export function textosCostoFijo(sinComprobar: boolean): { nota: string; celda: string } {
  return sinComprobar
    ? {
        nota: "No se pudo comprobar qué costos ya vienen de compras, así que por ahora no se corrigen aquí.",
        celda: "No se pudo comprobar si este costo ya viene de compras: por ahora no se corrige aquí.",
      }
    : {
        nota: "El costo de una variante que ya entró por Compras o por el Taller es su promedio ponderado: no se corrige a mano. Hasta su primera compra, sí.",
        celda: "Viene de sus compras y del Taller (promedio ponderado): no se corrige a mano.",
      };
}

/** Margen sobre el precio, en %. `null` sin costo o sin precio (sin costo no hay margen: antes el vacío mostraba 100 %). */
export function margenDeFila(f: FilaFicha): number | null {
  const costo = costoEfectivo(f);
  if (costo.trim() === "") return null;
  return margenPorcentaje(Number(f.precio), Number(costo));
}

export type CampoBloque = "precio" | "costo";

/** Las opciones de «a cuáles»: todas, un color o una talla (solo si la prenda tiene más de uno). */
export function alcancesDeBloque(filas: readonly FilaFicha[], n: NombresFicha): { valor: string; texto: string }[] {
  const { colores, tallas } = ejesDeLaPrenda(filas, n);
  return [
    { valor: "todas", texto: "Todas las activas" },
    ...(colores.length > 1 ? colores.map((c) => ({ valor: `color:${c ?? ""}`, texto: `Color: ${n.color(c)}` })) : []),
    ...(tallas.length > 1 ? tallas.map((t) => ({ valor: `talla:${t ?? ""}`, texto: `Talla: ${n.talla(t) || "sin talla"}` })) : []),
  ];
}

function enAlcance(f: FilaFicha, alcance: string): boolean {
  if (alcance.startsWith("color:")) return f.colorCodigo === (alcance.slice(6) || null);
  if (alcance.startsWith("talla:")) return f.tallaId === (alcance.slice(6) || null);
  return true;
}

/**
 * Pone el mismo precio (o costo) a las activas del alcance. El costo NO toca las que ya lo traen de compras (`fijas`).
 * `error` si el monto no sirve (un precio tiene que ser mayor que 0; un costo, 0 o más).
 */
export function aplicarEnBloque(
  filas: readonly FilaFicha[],
  campo: CampoBloque,
  alcance: string,
  monto: string,
): { filas: FilaFicha[]; aplicadas: number; fijas: number; error: string | null } {
  const n = Number(monto);
  const invalido = monto.trim() === "" || !Number.isFinite(n) || (campo === "precio" ? n <= 0 : n < 0);
  if (invalido) {
    return { filas: [...filas], aplicadas: 0, fijas: 0, error: campo === "precio" ? "Escribe un precio mayor que 0." : "Escribe un costo de 0 o más." };
  }
  let aplicadas = 0;
  let fijas = 0;
  const salida = filas.map((f) => {
    if (!f.activo || !enAlcance(f, alcance)) return f;
    if (campo === "costo" && f.costoFijo) {
      fijas++;
      return f;
    }
    aplicadas++;
    return { ...f, [campo]: monto.trim() };
  });
  return { filas: salida, aplicadas, fijas, error: null };
}

// ---------------------------------------------------------------------------
// Qué viaja a la base y en qué orden
// ---------------------------------------------------------------------------

/**
 * El orden en que la base tiene que procesar las filas: primero las corregidas (una que va a la combinación GUARDADA de
 * otra corregida espera a que esa se mueva), después las demás que existen, al final las nuevas (así una nueva puede
 * ocupar la combinación que una corregida deja libre). `null` = dos corregidas se intercambian el lugar: eso no se puede
 * en un solo guardado.
 */
export function ordenDeGuardado(filas: readonly FilaFicha[]): FilaFicha[] | null {
  const pendientes = filas.filter(corregida);
  const ordenadas: FilaFicha[] = [];
  while (pendientes.length > 0) {
    const i = pendientes.findIndex((f) => !pendientes.some((o) => o !== f && o.guardada && mismaIdentidad(f, o.guardada)));
    if (i < 0) return null;
    ordenadas.push(...pendientes.splice(i, 1));
  }
  return [...ordenadas, ...filas.filter((f) => f.id && !corregida(f)), ...filas.filter((f) => !f.id)];
}

export type VariantePayload = {
  id?: string;
  color_codigo?: string | null;
  talla_id?: string | null;
  precio: number;
  costo: number;
  activo?: boolean;
};

/**
 * `p_variantes` de `catalogo_actualizar_producto`. Una que existe manda id, precio, costo y activa, y SOLO si se corrigió,
 * `color_codigo` y/o `talla_id` ("" = sin color / sin talla): sin esas claves, la base no toca su identidad. Una nueva
 * manda color, talla, precio y costo (sin SKU: el alta tampoco lo pide).
 */
export function payloadVariantes(filas: readonly FilaFicha[]): VariantePayload[] {
  const ordenadas = ordenDeGuardado(filas) ?? [...filas];
  return ordenadas.map((f) => {
    if (!f.guardada || !f.id) {
      return { color_codigo: f.colorCodigo, talla_id: f.tallaId, precio: Number(f.precio), costo: f.costo.trim() === "" ? 0 : Number(f.costo) };
    }
    const costo = costoEfectivo(f);
    return {
      id: f.id,
      ...(f.colorCodigo !== f.guardada.colorCodigo ? { color_codigo: f.colorCodigo ?? "" } : {}),
      ...(f.tallaId !== f.guardada.tallaId ? { talla_id: f.tallaId ?? "" } : {}),
      precio: Number(f.precio),
      costo: costo.trim() === "" ? 0 : Number(costo),
      activo: f.activo,
    };
  });
}

const mismoConjunto = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function etiquetasCambiaron(f: FilaFicha): boolean {
  return f.guardada ? !mismoConjunto(f.etiquetaIds, f.guardada.etiquetaIds) : f.etiquetaIds.length > 0;
}

/** Las etiquetas que cambiaron, para UNA llamada a `actualizar_variantes_etiquetas`. Solo filas con id (las nuevas lo
 *  reciben de `consolidar`, tras el guardado principal). */
export function asignacionesDeEtiquetas(filas: readonly FilaFicha[]): { variante_id: string; etiqueta_ids: string[] }[] {
  return filas.filter((f) => f.id && etiquetasCambiaron(f)).map((f) => ({ variante_id: f.id as string, etiqueta_ids: f.etiquetaIds }));
}

/** Tras el guardado de etiquetas: lo de ahora pasa a ser lo guardado (reintentar otra parte no las vuelve a mandar). */
export function marcarEtiquetasGuardadas(filas: readonly FilaFicha[]): FilaFicha[] {
  return filas.map((f) => (f.guardada && f.id ? { ...f, guardada: { ...f.guardada, etiquetaIds: [...f.etiquetaIds] } } : f));
}

/** Una variante como la devuelve la base tras guardar (`select id, color_codigo, talla_id, codigo from variantes`). */
export type VarianteDeLaBase = { id: string; color_codigo: string | null; talla_id: string | null; codigo: string | null };

/** Las corregidas que la base NO dejó como se pidió: con la base sin el SQL de ADR-0263, la corrección se ignora sin error. */
export function correccionesSinAplicar(filas: readonly FilaFicha[], deLaBase: readonly VarianteDeLaBase[]): FilaFicha[] {
  return filas.filter((f) => {
    if (!corregida(f)) return false;
    const b = deLaBase.find((x) => x.id === f.id);
    return !b || b.color_codigo !== f.colorCodigo || b.talla_id !== f.tallaId;
  });
}

/**
 * Tras un guardado principal bueno, la foto de la base pasa a ser lo «guardado»: las nuevas reciben su id (por su
 * combinación, que es única en la prenda) y lo corregido deja de estar pendiente. Así, si falla lo que sigue (etiquetas,
 * temporada) y se vuelve a pulsar «Revisar y guardar», no se crean dos veces ni se corrigen dos veces. Las etiquetas quedan
 * como estaban guardadas: todavía falta mandarlas.
 */
export function consolidar(filas: readonly FilaFicha[], deLaBase: readonly VarianteDeLaBase[]): FilaFicha[] {
  const usados = new Set(filas.map((f) => f.id).filter(Boolean));
  return filas.map((f) => {
    const b = f.id
      ? deLaBase.find((x) => x.id === f.id)
      : deLaBase.find((x) => !usados.has(x.id) && x.color_codigo === f.colorCodigo && x.talla_id === f.tallaId);
    if (!b) return f;
    const codigoViejo = f.guardada?.codigo;
    const codigosBarras = codigoViejo && codigoViejo !== b.codigo && !f.codigosBarras.includes(codigoViejo) ? [...f.codigosBarras, codigoViejo] : f.codigosBarras;
    return {
      ...f,
      id: b.id,
      codigosBarras: b.codigo && !codigosBarras.includes(b.codigo) ? [...codigosBarras, b.codigo] : codigosBarras,
      guardada: {
        colorCodigo: b.color_codigo,
        tallaId: b.talla_id,
        precio: f.precio,
        costo: costoEfectivo(f),
        activo: f.activo,
        codigo: b.codigo,
        etiquetaIds: f.guardada?.etiquetaIds ?? [],
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Lo que va a pasar al guardar, y lo que falta
// ---------------------------------------------------------------------------

/**
 * Las variantes como las compara `resumenDeCambios` de `lib/producto-cambios-reglas.ts` (ADR-0257, guardar en dos
 * tiempos): la barra «Tienes N cambios sin guardar», la marca de cada fila y la hoja «Revisa y guarda los cambios» salen
 * de UNA cuenta, y esta es la traducción de la sección de ADR-0263 a esa cuenta (antes, la sección tenía su propio
 * resumen para un lateral que ya no existe: dos formas de contar lo mismo).
 *
 *   - `guardadas`: cómo está cada variante que YA existe en la base (su `guardada`). Tras un guardado principal bueno,
 *     `consolidar` la actualiza: lo que ya quedó deja de contar y la barra dice solo lo que falta (etiquetas, temporada).
 *   - `ahora`: lo que está en la ficha, en el MISMO orden que `filas` (el `indice` de cada cambio es el de su fila). Una
 *     nueva va sin id («se agrega»); una corregida lleva su color y su talla nuevos con sus ejes, para que la hoja diga
 *     «3 variantes pasan de Sin color a Negro»; el costo es el que se GUARDARÍA (`costoEfectivo`).
 */
export function variantesParaResumen(
  filas: readonly FilaFicha[],
  n: NombresFicha,
  estado: Readonly<Record<string, EstadoVariante>> | null,
): { guardadas: VarianteFicha[]; ahora: VarianteFicha[] } {
  const identidad = (v: Identidad): VarianteFicha["identidad"] => ({
    clave: `${v.colorCodigo ?? ""}|${v.tallaId ?? ""}`,
    texto: nombreVariante(v, n),
    ejes: {
      color: { clave: v.colorCodigo ?? "", texto: n.color(v.colorCodigo) },
      talla: { clave: v.tallaId ?? "", texto: n.talla(v.tallaId) || "sin talla" },
    },
  });
  const guardadas = filas.flatMap((f): VarianteFicha[] =>
    f.guardada && f.id
      ? [
          {
            id: f.id,
            nombre: nombreVariante(f.guardada, n),
            activo: f.guardada.activo,
            precio: f.guardada.precio,
            costo: f.guardada.costo,
            etiquetaIds: f.guardada.etiquetaIds,
            identidad: identidad(f.guardada),
          },
        ]
      : [],
  );
  const ahora = filas.map(
    (f): VarianteFicha => ({
      id: f.guardada ? f.id : null,
      nombre: nombreVariante(f, n),
      activo: f.activo,
      precio: f.precio,
      costo: costoEfectivo(f),
      etiquetaIds: f.etiquetaIds,
      identidad: identidad(f),
      unidades: f.id && estado ? (estado[f.id]?.stock ?? 0) : null,
    }),
  );
  return { guardadas, ahora };
}

export type ProblemaFicha = {
  texto: string;
  /** `false` = aviso que deja guardar (se desactivan todas). */
  bloquea: boolean;
  /** La fila a la que hay que ir, si es de una. */
  clave?: string;
};

/** La misma frase que la base (hint `mezcla_sin_color`), para que diga lo mismo antes y después de pulsar. */
export const FRASE_MEZCLA_SIN_COLOR =
  "Esta prenda quedaría con variantes «Sin color» junto a otras con color. Ponle color a las que no lo tienen o desactívalas.";

/** Una prenda que YA venía mezclada (el censo del Conteo podía armarla antes de ADR-0263 T5): se avisa, no se frena. */
export const FRASE_MEZCLA_PREVIA =
  "Esta prenda ya tenía variantes «Sin color» junto a otras con color. Puedes guardar igual; para ordenarla, ponle color a las «Sin color» o desactívalas.";

/** La categoría ELEGIDA en el formulario (puede no ser la guardada): la base valida contra ella la talla de toda variante
 *  nueva o corregida, y rechaza el guardado ENTERO si una no está habilitada. */
export type CategoriaElegida = {
  /** Los ids de las tallas que habilita. */
  tallasHabilitadas: readonly string[];
  nombre?: string;
  /** Es otra que la guardada: «vuelve a la categoría anterior» es una salida. */
  cambio: boolean;
};

/**
 * Lo que impide guardar (o avisa), antes de ir a la base. En orden: primero lo que bloquea. Con `categoria`, revisa además
 * que la talla de cada variante nueva o corregida esté habilitada en ella (sin eso, cambiar de categoría después de agregar
 * una talla dejaba abrir la hoja y la base rechazaba todo con «Esa talla no está habilitada…», sin decir qué fila era).
 */
export function problemasVariantes(filas: readonly FilaFicha[], n: NombresFicha, categoria?: CategoriaElegida): ProblemaFicha[] {
  const p: ProblemaFicha[] = [];
  if (filas.length === 0) return [{ texto: "Agrega al menos una variante con «Agregar color» o «Agregar talla».", bloquea: true }];
  for (const f of filas) {
    if (!f.activo) continue;
    const precio = Number(f.precio);
    if (f.precio.trim() === "" || !Number.isFinite(precio) || precio <= 0) {
      p.push({ texto: `${nombreVariante(f, n)} necesita un precio mayor que 0.`, bloquea: true, clave: f.clave });
    }
    const costo = Number(f.costo);
    if (!f.costoFijo && f.costo.trim() !== "" && (!Number.isFinite(costo) || costo < 0)) {
      p.push({ texto: `El costo de ${nombreVariante(f, n)} no puede ser negativo.`, bloquea: true, clave: f.clave });
    }
  }
  const vistas = new Set<string>();
  for (const f of filas) {
    const k = claveCelda(f.tallaId, f.colorCodigo);
    if (vistas.has(k)) p.push({ texto: `${nombreVariante(f, n)} está dos veces: quita o corrige una.`, bloquea: true, clave: f.clave });
    vistas.add(k);
  }
  if (categoria) {
    const habilitadas = new Set(categoria.tallasHabilitadas);
    const donde = categoria.nombre ? `en ${categoria.nombre}` : "en la categoría elegida";
    for (const f of filas) {
      // Solo lo que la base va a validar: una nueva, o una talla corregida. Una que existe y no cambia de talla no se revisa.
      const tallaQueSeValida = !f.guardada || f.tallaId !== f.guardada.tallaId;
      if (!tallaQueSeValida || f.tallaId === null || habilitadas.has(f.tallaId)) continue;
      const nombre = nombreVariante(f, n);
      const salida = f.guardada ? `deshaz la corrección de ${nombre}` : `quita ${nombre}`;
      const otra = categoria.cambio ? "o vuelve a la categoría anterior" : "o pide que la habiliten en Catálogo → Categorías";
      p.push({ texto: `${n.talla(f.tallaId) || "Esa talla"} no está habilitada ${donde}: ${salida}, ${otra}.`, bloquea: true, clave: f.clave });
    }
  }
  const activas = filas.filter((f) => f.activo);
  if (activas.some((f) => f.colorCodigo === null) && activas.some((f) => f.colorCodigo !== null)) {
    // «No empeora», la misma regla que la base (`variantes_sin_mezcla_de_color`): frena solo si ESTE guardado crea, recolorea
    // o reactiva una variante que queda en la mezcla. Una prenda que ya venía mezclada se sigue guardando (un precio) con
    // un aviso; antes se bloqueaba entera y a quien no es líder no le quedaba salida.
    const tocaLaRegla = (f: FilaFicha) => !f.guardada || f.colorCodigo !== f.guardada.colorCodigo || !f.guardada.activo;
    p.push(activas.some(tocaLaRegla) ? { texto: FRASE_MEZCLA_SIN_COLOR, bloquea: true } : { texto: FRASE_MEZCLA_PREVIA, bloquea: false });
  }
  if (ordenDeGuardado(filas) === null) {
    p.push({ texto: "Dos variantes se intercambian el color o la talla: eso no se puede en un solo guardado. Deshaz una, guarda, y corrígela después.", bloquea: true });
  }
  if (activas.length === 0) {
    // Desactivar no saca unidades del inventario (siguen en el stock, en /productos y en el conteo): solo deja de venderlas.
    p.push({ texto: "Todas las variantes quedan desactivadas: la prenda ya no se podrá vender. Si es lo que quieres, guarda igual.", bloquea: false });
  }
  return p;
}

// ---------------------------------------------------------------------------
// Stock visible (fn_variantes_estado)
// ---------------------------------------------------------------------------

/**
 * Lee la respuesta de `fn_variantes_estado` (un arreglo JSON, una entrada por variante). `null` si no se puede leer
 * (la función no está en la base todavía, o respondió otra cosa): la ficha sigue, sin la columna de stock.
 */
export function leerEstadoVariantes(data: unknown): Record<string, EstadoVariante> | null {
  // `[]` es también lo que responde a una cuenta sin permiso de catálogo: leerlo como «todas en 0 u.» mentiría. Sin
  // entradas, no se sabe (una prenda sin variantes tampoco necesita la columna).
  if (!Array.isArray(data) || data.length === 0) return null;
  const salida: Record<string, EstadoVariante> = {};
  for (const e of data) {
    if (!e || typeof e !== "object" || typeof (e as { variante_id?: unknown }).variante_id !== "string") return null;
    const x = e as { variante_id: string; stock?: unknown; apartado?: unknown; sedes?: unknown; vendida?: unknown };
    const sedes = Array.isArray(x.sedes)
      ? x.sedes
          .filter((s): s is { ubicacion_id: string; nombre: string; cantidad: unknown } => !!s && typeof s === "object" && typeof s.nombre === "string")
          .map((s) => ({ ubicacionId: String(s.ubicacion_id), nombre: s.nombre, cantidad: Number(s.cantidad) || 0 }))
      : [];
    salida[x.variante_id] = { stock: Number(x.stock) || 0, apartado: Number(x.apartado) || 0, sedes, vendida: x.vendida === true };
  }
  return salida;
}

/**
 * Lo que la ficha dice de las variantes que nacen al agregar un color o una talla: nacen sin unidades, y lo que llegó se
 * registra por la puerta de recibir (su nombre en el menú, `lib/menu.ts`: «Recibir mercadería», en Compras o en
 * Inventario según quién la abra). Sin esta línea, «Agregar color» parecía registrar lo que llegó.
 */
export const NACEN_SIN_UNIDADES = "Nacen sin unidades: lo que llegó se registra al recibirlo, en «Recibir mercadería».";

/**
 * El único círculo de candados que el orden de ADR-0263 T8 no cierra: una venta o un traslado de VARIAS tallas de esta
 * prenda (en otro orden que el id) en el mismo instante en que la ficha corrige esas tallas. Postgres lo corta con 40P01 y
 * deshace ENTERA a una de las dos: si la que cae es la ficha, no se guardó nada (ni la versión de la prenda se movió), así
 * que repetir la misma llamada es seguro. Se repite UNA vez —la otra operación ya tiene sus candados y termina en
 * milisegundos—; si vuelve a caer, la ficha lo dice con `FRASE_CHOQUE_DE_CANDADOS` y no con el error crudo.
 * `llamar` arma la consulta de nuevo en cada intento (un builder de supabase-js no se reusa).
 */
export async function conUnReintentoSiChoca<R extends { error: { code?: string | null } | null }>(llamar: () => PromiseLike<R>): Promise<R> {
  const primera = await llamar();
  return esChoqueDeCandados(primera.error) ? await llamar() : primera;
}

/** «deadlock detected» (SQLSTATE 40P01): la base deshizo la transacción entera; nada quedó a medias. */
export function esChoqueDeCandados(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "40P01";
}

export const FRASE_CHOQUE_DE_CANDADOS =
  "Otra operación de la tienda (una venta, un traslado) estaba usando estas mismas prendas en el mismo instante. No se guardó nada: vuelve a pulsar «Revisar y guardar».";

/**
 * Un monto escrito en «Cambiar precio (o costo) en bloque» que no se aplicó: se perdería en silencio al guardar lo demás.
 * `null` = no hay nada pendiente. Bloquea el guardado con el porqué.
 */
export function avisoBloqueSinAplicar(pendiente: CampoBloque | null): string | null {
  if (pendiente === null) return null;
  return `Tienes un ${pendiente === "precio" ? "precio" : "costo"} sin aplicar: pulsa Aplicar o bórralo.`;
}
