// Recibir, la categoría como una sola cosa (ADR-0393, actualización 2026-10-26): la lógica pura que junta las líneas de un envío en
// categorías y reparte entre ellas lo que la persona cuenta. Sin React ni red; se prueba sola (`recepcion-grupos-reglas.test.ts`).
//
//   PROMETE: agrupar las líneas del envío que son de lo mismo (mismo proveedor, categoría y marca: la llave con la que «Nos debe» suma el
//   reclamo); dar los números de la categoría (lo contado, lo separado, lo que sigue sin separar); y, cuando la persona escribe UN total
//   o separa una prenda, decir qué queda guardado en cada línea.
//   NO HACE: no habla con la base ni decide dinero. La base sigue guardando una fila por línea: cuando nada se separó, ese número por línea
//   es un reparto de trabajo (en el orden de la compra) y NO dice de cuál prenda faltó; solo lo separado tiene cantidad exacta por prenda.
//
// EL REPARTO es siempre el mismo para los mismos datos. Cada línea no baja de lo suyo ya separado ni de lo que ya entró al stock (su mínimo);
// sobre eso, lo sin separar llena las líneas en el orden de la compra hasta lo que dijeron, y lo que no cabe va a la última. Así separar
// Sofía 7 y Lima 3 con 10 contadas deja 7 y 3, y cerrar sin separar deja 5 y 5 sin inventar nada que importe: el reclamo suma por categoría
// y marca, y lo que entra al stock entra por prenda. Y sin separar nada, la categoría solo puede faltar o solo sobrar, nunca las dos.

import type { CampoDeGuia } from "./guia-campos";
import type { PrendaDebida } from "./nos-debe-reglas";
import {
  SEPARADO_VACIO,
  causasDe,
  contadasDe,
  diferenciaDe,
  idCampoCierre,
  marcaDeLinea,
  nuevasSinDescribir,
  prendasAnotadasDe,
  totalSeparado,
  type ClaveLinea,
  type ConteoDeLinea,
  type LineaParaContar,
  type PrendaAnotada,
  type Separado,
} from "./recepcion-conteo-reglas";

/** Las líneas que son de lo mismo, vistas como una sola categoría. */
export type GrupoDeLineas = {
  /** «prov|categoría|marca» para lo de la guía; «extra:n» para cada cosa fuera de la guía (esa nunca se junta). */
  clave: string;
  /** En el orden del envío (el de la compra). Nunca vacío. */
  lineas: LineaParaContar[];
  /** La primera línea: lo que no es de ninguna línea en particular se guarda en ella. */
  principal: LineaParaContar;
  /** «Dijeron»: la suma de lo que salió; `null` si el grupo no viene en la guía. */
  dijeron: number | null;
  /** Lo contado de todas las líneas. */
  contadas: number;
  /** Lo que ya entró al stock de todas las líneas (en un envío reabierto). */
  enStock: number;
  /** Lo separado de todas las líneas, junto. */
  separado: Separado;
  /** ¿Se contó alguna línea? (el grupo está «contado» cuando todas las de la guía tienen su número). */
  contado: boolean;
};

const SIN = "-";

/** La llave de una línea: lo de la guía se junta por proveedor, categoría y marca; cada cosa de fuera de la guía va sola. */
export function claveDeGrupo(l: LineaParaContar): string {
  if (!l.linea) return String(l.clave);
  return `${l.proveedor?.id ?? SIN}|${l.categoria?.id ?? SIN}|${l.marca?.id ?? SIN}`;
}

const minimoDe = (l: LineaParaContar): number => (l.conteo?.enStock ?? 0) + totalSeparado(l.conteo?.separado ?? SEPARADO_VACIO);
const contadasDeLinea = (l: LineaParaContar): number => l.conteo?.contadas ?? 0;
const normaliza = (d: string): string => d.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

/** Junta lo separado de varias líneas: las prendas conocidas (una sola vez cada una) y las nuevas (las de igual descripción se suman). */
export function juntarSeparado(partes: readonly Separado[]): Separado {
  const prendas = new Map<string, Separado["prendas"][number]>();
  const descritas = new Map<string, Separado["nuevas"][number] & { descripcion: string }>();
  let sinDescribir = 0;
  for (const s of partes) {
    for (const p of s.prendas) {
      const ya = prendas.get(p.productoId);
      prendas.set(p.productoId, ya ? { ...ya, cantidad: ya.cantidad + p.cantidad, variantes: null } : p);
    }
    for (const n of s.nuevas) {
      if (!n.descripcion) {
        sinDescribir += n.cantidad;
        continue;
      }
      const k = normaliza(n.descripcion);
      const ya = descritas.get(k);
      descritas.set(k, ya ? { ...ya, cantidad: ya.cantidad + n.cantidad } : { ...n, descripcion: n.descripcion });
    }
  }
  return {
    prendas: [...prendas.values()],
    nuevas: [...descritas.values(), ...(sinDescribir > 0 ? [{ cantidad: sinDescribir, descripcion: null }] : [])],
  };
}

/**
 * Qué hacer con lo que se quiere agregar a la lista:
 * · `dentro`: ya está esa categoría con esa marca (vacía = sin marca) y, si el envío trae varios proveedores, de ese proveedor (`proveedorId` null: no hace falta distinguirlo). Un modelo
 *   más no es otra línea: se anota dentro de la que ya está.
 * · `nueva`: es otra línea. Con la marca vacía también: cada modelo lleva su marca, y vacía es «no tiene» (Felipe 2026-11-03).
 */
export type AlAgregar = { tipo: "dentro"; grupo: GrupoDeLineas } | { tipo: "nueva" };

export function alAgregarALaLista(grupos: readonly GrupoDeLineas[], q: { proveedorId: string | null; categoriaId: string; marcaId: string | null }): AlAgregar {
  const deEsto = grupos.filter(({ principal: l }) => l.categoria?.id === q.categoriaId && (q.proveedorId === null || l.proveedor?.id === q.proveedorId));
  const misma = deEsto.find(({ principal: l }) => (l.marca?.id ?? null) === q.marcaId);
  return misma ? { tipo: "dentro", grupo: misma } : { tipo: "nueva" };
}

/** Las categorías del envío, en el orden en que aparece su primera línea. */
export function agruparLineas(lineas: readonly LineaParaContar[], claveDe: (l: LineaParaContar) => string = claveDeGrupo): GrupoDeLineas[] {
  const porClave = new Map<string, LineaParaContar[]>();
  for (const l of lineas) {
    const k = claveDe(l);
    const ya = porClave.get(k);
    if (ya) ya.push(l);
    else porClave.set(k, [l]);
  }
  return [...porClave.entries()].map(([clave, ls]) => ({
    clave,
    lineas: ls,
    principal: ls[0],
    dijeron: ls.every((l) => l.dijeron == null) ? null : ls.reduce((a, l) => a + (l.dijeron ?? 0), 0),
    contadas: ls.reduce((a, l) => a + contadasDeLinea(l), 0),
    enStock: ls.reduce((a, l) => a + (l.conteo?.enStock ?? 0), 0),
    separado: juntarSeparado(ls.map((l) => l.conteo?.separado ?? SEPARADO_VACIO)),
    contado: ls.every((l) => (l.linea ? l.conteo !== null : (l.conteo?.contadas ?? 0) > 0)),
  }));
}

/** Lo mínimo que puede contar la categoría: lo que ya entró al stock más lo ya separado. */
export const minimoDelGrupo = (g: GrupoDeLineas): number => g.lineas.reduce((a, l) => a + minimoDe(l), 0);

/** Lo que queda guardado en una línea. */
/**
 * Las filas de Cerrar (Felipe 2026-11-03): lo que no cuadró se explica contra lo que Compras dijo. Si anotó el modelo, por modelo (Compras sabe qué reclamar); si solo dijo «Vestidos: 20», por
 * categoría. La misma prenda comprada en dos líneas sigue siendo una sola fila.
 */
export const agruparLineasDelCierre = (lineas: readonly LineaParaContar[]): GrupoDeLineas[] =>
  agruparLineas(lineas, (l) => {
    const anotada = l.linea ? prendasAnotadasDe(l)[0] : undefined;
    return anotada ? `${claveDeGrupo(l)}|${anotada.productoId ?? normaliza(anotada.nombre)}` : claveDeGrupo(l);
  });

/** El nombre de una fila de Cerrar: el modelo si se anotó, y si no, la categoría. */
export function nombreDelGrupoDelCierre(g: GrupoDeLineas): string {
  const anotada = g.principal.linea ? prendasAnotadasDe(g.principal)[0] : undefined;
  const p = g.principal;
  return [anotada?.nombre ?? p.categoria?.nombre ?? "Categoría", p.categoria ? marcaDeLinea(p).nombre : null].filter(Boolean).join(" · ");
}

export type CambioDeLinea = { linea: LineaParaContar; clave: ClaveLinea; contadas: number; separado: Separado };

export type Reparto = {
  /** Solo las líneas que cambian. */
  cambios: CambioDeLinea[];
  /** Lo contado de la categoría tras el reparto (sube si se separó más de lo contado). */
  contadas: number;
  subio: boolean;
};

/**
 * Reparte el total de la categoría entre sus líneas, siempre igual para los mismos datos (no depende de cómo se llegó a ellos). `minimos` es lo
 * que cada línea no puede bajar: lo ya separado en ella y lo que ya entró al stock. Sobre eso, lo sin separar llena las líneas en el orden de
 * la compra hasta lo que dijeron y lo que no cabe va a la última (es lo que llegó de más). Así, sin separar nada, la categoría solo puede
 * faltar o solo puede sobrar —nunca una línea de más y otra de menos—, y el reclamo por la categoría es el neto.
 */
function repartirContadas(lineas: readonly LineaParaContar[], minimos: readonly number[], total: number): { contadas: number[]; subio: boolean } {
  const suma = minimos.reduce((a, m) => a + m, 0);
  const c = [...minimos];
  let resto = Math.max(total, suma) - suma;
  for (let i = 0; i < lineas.length && resto > 0; i++) {
    const pone = Math.min(Math.max(0, (lineas[i].dijeron ?? 0) - c[i]), resto);
    c[i] += pone;
    resto -= pone;
  }
  if (resto > 0) c[c.length - 1] += resto;
  return { contadas: c, subio: total < suma };
}

/** La persona escribió el total de la categoría: qué queda en cada línea. Lo separado no se mueve. */
export function repartirTotal(g: GrupoDeLineas, total: number): Reparto {
  const minimos = g.lineas.map(minimoDe);
  const { contadas, subio } = repartirContadas(g.lineas, minimos, Math.max(0, Math.trunc(total)));
  // Una línea sin conteo también se guarda (aunque sea en 0): la categoría solo está contada cuando todas sus líneas tienen su número.
  const cambios: CambioDeLinea[] = [];
  g.lineas.forEach((l, i) => {
    if (l.conteo !== null && contadas[i] === contadasDeLinea(l)) return;
    cambios.push({ linea: l, clave: l.clave, contadas: contadas[i], separado: l.conteo?.separado ?? SEPARADO_VACIO });
  });
  return { cambios, contadas: contadas.reduce((a, x) => a + x, 0), subio };
}

export type PrendaDe = { productoId: string } | { descripcion: string | null };

/** ¿La prenda separada (del catálogo, o nueva con descripción) es la que anotó esta línea al comprar? */
function esDeLaLinea(l: LineaParaContar, prenda: PrendaDe): boolean {
  return prendasAnotadasDe(l).some((a: PrendaAnotada) =>
    "productoId" in prenda ? a.productoId === prenda.productoId : a.productoId === null && prenda.descripcion != null && normaliza(a.nombre) === normaliza(prenda.descripcion),
  );
}

const claveDeDescripcion = (d: string | null): string | null => (d ? normaliza(d) : null);

/**
 * De qué línea es una prenda separada: la línea donde ya estaba separada; si no, la que la anotó al comprar; si ninguna, la primera.
 * (Lo que se guarda por línea es un detalle: la persona ve la categoría.)
 */
export function lineaDeLaPrenda(g: GrupoDeLineas, prenda: PrendaDe): LineaParaContar {
  const estaba = g.lineas.find((l) => {
    const s = l.conteo?.separado ?? SEPARADO_VACIO;
    return "productoId" in prenda
      ? s.prendas.some((p) => p.productoId === prenda.productoId)
      : s.nuevas.some((n) => claveDeDescripcion(n.descripcion) === claveDeDescripcion(prenda.descripcion));
  });
  return estaba ?? g.lineas.find((l) => esDeLaLinea(l, prenda)) ?? g.principal;
}

/**
 * La persona dejó lo separado de la categoría así (`separado`) y contó `total`: qué queda en cada línea. Cada prenda se guarda en la línea
 * donde ya estaba; si es nueva en la lista, en la línea que la anotó al comprar; si ninguna la anotó, en la primera. Después se reparten
 * los números para que ninguna línea quede por debajo de lo suyo.
 */
export function repartirSeparado(g: GrupoDeLineas, separado: Separado, total: number): Reparto {
  const lineas = g.lineas;
  const dueña = (prenda: PrendaDe): number => lineas.indexOf(lineaDeLaPrenda(g, prenda));

  const nuevoPorLinea: Separado[] = lineas.map(() => ({ prendas: [], nuevas: [] }));
  for (const p of separado.prendas) nuevoPorLinea[dueña({ productoId: p.productoId })].prendas.push(p);
  for (const n of separado.nuevas) nuevoPorLinea[dueña({ descripcion: n.descripcion })].nuevas.push(n);

  const minimos = lineas.map((l, i) => (l.conteo?.enStock ?? 0) + totalSeparado(nuevoPorLinea[i]));
  const { contadas, subio } = repartirContadas(lineas, minimos, Math.max(0, Math.trunc(total)));

  const cambios: CambioDeLinea[] = [];
  lineas.forEach((l, i) => {
    const antes = l.conteo?.separado ?? SEPARADO_VACIO;
    const igual = JSON.stringify(antes) === JSON.stringify(nuevoPorLinea[i]);
    if (l.conteo !== null && igual && contadas[i] === contadasDeLinea(l)) return;
    cambios.push({ linea: l, clave: l.clave, contadas: contadas[i], separado: nuevoPorLinea[i] });
  });
  return { cambios, contadas: contadas.reduce((a, x) => a + x, 0), subio };
}


// ---- Lo que muestra la pantalla de una categoría ---------------------------------------------------------------------------------

/** Una prenda anotada al comprar, con la línea de la compra que la anotó. */
export type AnotadaDelGrupo = { linea: LineaParaContar; prenda: PrendaAnotada };

/**
 * Todas las prendas que se anotaron al comprar en esta categoría, en el orden de la compra (también las que ya se separaron). La misma
 * prenda comprada en dos líneas (el mismo modelo del catálogo, o el mismo nombre) es UNA: sus cantidades se suman y queda en la primera.
 */
export function anotadasDelGrupo(g: GrupoDeLineas): AnotadaDelGrupo[] {
  const porPrenda = new Map<string, AnotadaDelGrupo>();
  for (const l of g.lineas) {
    for (const prenda of prendasAnotadasDe(l)) {
      const k = prenda.productoId ?? `nombre:${normaliza(prenda.nombre)}`;
      const ya = porPrenda.get(k);
      porPrenda.set(k, ya ? { linea: ya.linea, prenda: { ...ya.prenda, cantidad: ya.prenda.cantidad + prenda.cantidad } } : { linea: l, prenda });
    }
  }
  return [...porPrenda.values()];
}

/**
 * Cuántas de las prendas contadas de la categoría todavía no se sabe cuáles son (Felipe 2026-10-27). Una prenda está identificada cuando
 * es una del catálogo o una nueva ya descrita con su nombre; las nuevas sin descripción y lo que no se separó NO lo están. Lo que ya entró al
 * stock cuenta como identificado. Es lo que impide pasar a «Cerrar»: tallas y colores se pueden dejar para después, quién es la prenda no.
 */
export function sinIdentificarDelGrupo(g: GrupoDeLineas): number {
  if (!g.lineas.some((l) => l.conteo !== null)) return 0;
  const identificadas = totalSeparado(g.separado) - nuevasSinDescribir(g.separado);
  return Math.max(0, g.contadas - g.enStock - identificadas);
}

/** Las categorías contadas a las que todavía les faltan prendas por identificar: con alguna, no se puede pasar a «Cerrar». */
export const gruposSinIdentificar = (grupos: readonly GrupoDeLineas[]): GrupoDeLineas[] => grupos.filter((g) => sinIdentificarDelGrupo(g) > 0);

/** La llave del campo de la guía «identifica las prendas de esta categoría» (`data-campo` de su «¿Qué … son?»). */
export const idCampoIdentificar = (claveGrupo: string): string => `identificar-${claveGrupo.replace(/[^a-zA-Z0-9]+/g, "-")}`;

/** Cómo se llamaron las prendas de la compra («Vestido Sofía, Vestido Lima»), sin repetir. */
export function descripcionDelGrupo(g: GrupoDeLineas): string | null {
  const nombres = [...new Set(g.lineas.map((l) => l.linea?.descripcion?.trim()).filter((d): d is string => !!d))];
  return nombres.length ? nombres.join(", ") : null;
}

// ---- La categoría en el cierre ---------------------------------------------------------------------------------------------------

/**
 * La categoría vista como UNA sola línea, para dibujarla en el cierre con las mismas piezas de una línea (lo que dijeron y lo contado, «para
 * después», las prendas con nombre). Es solo una vista: nunca va a la base (`p_lineas` sigue llevando las líneas de verdad).
 */
export function lineaDelGrupo(g: GrupoDeLineas): LineaParaContar {
  const base = g.principal.conteo ?? g.lineas.find((l) => l.conteo !== null)?.conteo ?? null;
  if (!base) return { ...g.principal, dijeron: g.dijeron };
  const conteo: ConteoDeLinea = {
    ...base,
    contadas: g.contadas,
    separado: g.separado,
    enStock: g.enStock,
    costosPrendas: Object.assign({}, ...g.lineas.map((l) => l.conteo?.costosPrendas ?? {})),
    sinSeparar: g.lineas.reduce((a, l) => a + (l.conteo?.sinSeparar ?? 0), 0),
    pendientes: g.lineas.flatMap((l) => l.conteo?.pendientes ?? []),
  };
  return { ...g.principal, conteo, dijeron: g.dijeron };
}

/** Lo que pasó con lo que no cuadró en una categoría: una causa para lo que faltó y otra para lo que sobró (casi siempre solo una). */
export type CausaDelGrupo = {
  tipo: "faltante" | "sobrante";
  opciones: { valor: string; texto: string; ayuda: string; aviso?: string }[];
  /** Las líneas a las que esta causa se aplica: todas las que faltaron (o sobraron). */
  lineas: LineaParaContar[];
  cantidad: number;
};

/**
 * Qué hay que explicar al cerrar una categoría. Cada línea sigue guardando su propia causa (la base las pide por línea), pero la persona
 * contesta una sola vez por tipo: lo que se elige vale para todas las líneas que faltaron (o sobraron).
 */
export function causasDelGrupo(g: GrupoDeLineas, deudaPendiente: number, sinAviso: boolean, prendasDebidas: readonly PrendaDebida[] = []): CausaDelGrupo[] {
  const por = new Map<CausaDelGrupo["tipo"], CausaDelGrupo>();
  for (const l of g.lineas) {
    const c = causasDe(l, deudaPendiente, sinAviso, prendasDebidas);
    if (!c || !l.conteo) continue;
    const dif = diferenciaDe(l);
    const cantidad = c.tipo === "faltante" ? -(dif ?? 0) : (dif ?? contadasDe(l));
    const ya = por.get(c.tipo);
    if (ya) {
      ya.lineas.push(l);
      ya.cantidad += cantidad;
    } else {
      por.set(c.tipo, { tipo: c.tipo, opciones: c.opciones, lineas: [l], cantidad });
    }
  }
  return (["faltante", "sobrante"] as const).flatMap((t) => (por.has(t) ? [por.get(t) as CausaDelGrupo] : []));
}

/**
 * ¿Esta fila de Cerrar pide algo? Lo que falta contar, lo que no cuadró y el costo de lo que no estaba en la guía (`editaCostoFuera`: en un envío sin aviso, solo quien ve el dinero de Compras lo
 * escribe). Es lo mismo que pide `camposDelCierre`, sin mirar lo ya contestado: una fila no se va de su lugar bajo el mouse al elegir qué pasó.
 */
export function grupoPideDecision(g: GrupoDeLineas, sinAviso: boolean, editaCostoFuera: boolean): boolean {
  return g.lineas.some((l) => l.linea && !l.conteo) || causasDelGrupo(g, 0, sinAviso).length > 0 || (!g.principal.linea && g.contadas > 0 && editaCostoFuera);
}

/** Con más filas que estas, lo que no pide nada se pliega y sus precios nacen cerrados: con 75 líneas, Cerrar medía casi 16.000 px. Con menos, se ve todo como siempre. */
export const FILAS_DE_CIERRE_A_LA_VISTA = 6;

/** Qué se muestra de Cerrar: primero lo que pide una decisión; lo demás, plegado si son muchas (`plegar`). */
export function filasDelCierre(grupos: readonly GrupoDeLineas[], sinAviso: boolean, editaCostoFuera: boolean): { piden: GrupoDeLineas[]; cuadran: GrupoDeLineas[]; plegar: boolean } {
  const piden = grupos.filter((g) => grupoPideDecision(g, sinAviso, editaCostoFuera));
  const cuadran = grupos.filter((g) => !grupoPideDecision(g, sinAviso, editaCostoFuera));
  return { piden, cuadran, plegar: grupos.length > FILAS_DE_CIERRE_A_LA_VISTA && cuadran.length > 1 };
}

/** Lo que dice la franja que abre lo plegado. Si algo adentro cambió, lo dice: que no quede escondido lo que va a guardarse al cerrar. */
export function textoDeLasPlegadas(cuadran: number, conCambios: number, sinAviso: boolean, nadaPide: boolean): string {
  const cuantas = sinAviso ? `Ver las otras ${cuadran}` : nadaPide ? `Todas cuadran: ver las ${cuadran}` : `Ver las ${cuadran} que cuadran`;
  return conCambios > 0 ? `${cuantas} · ${conCambios} con cambios` : cuantas;
}

/**
 * Los campos de la guía del cierre por categoría: los de `camposDelCierre` piden una causa (y un «cuéntala») por línea; aquí van juntos, uno
 * por categoría y por tipo, con el id de la primera línea (donde se dibuja la caja) y hechos cuando todas lo están.
 */
export function camposDelCierrePorGrupo(campos: readonly CampoDeGuia[], grupos: readonly GrupoDeLineas[]): CampoDeGuia[] {
  const llave = new Map<string, { grupo: GrupoDeLineas; clave: string }>();
  for (const g of grupos) {
    for (const l of g.lineas) {
      llave.set(idCampoCierre("contar", l.clave), { grupo: g, clave: `${g.clave}|contar` });
      const dif = diferenciaDe(l);
      llave.set(idCampoCierre("causa", l.clave), { grupo: g, clave: `${g.clave}|causa|${dif != null && dif < 0 ? "faltante" : "sobrante"}` });
    }
  }
  const unidos = new Map<string, CampoDeGuia>();
  const r: CampoDeGuia[] = [];
  for (const c of campos) {
    const k = llave.get(c.id);
    if (!k) {
      r.push(c);
      continue;
    }
    const ya = unidos.get(k.clave);
    if (!ya) {
      const nombre = [k.grupo.principal.categoria?.nombre, k.grupo.principal.categoria ? marcaDeLinea(k.grupo.principal).nombre : null].filter(Boolean).join(" · ") || "esta categoría";
      const uno: CampoDeGuia = { ...c, nombre: c.id.startsWith("causa") ? `Qué pasó · ${nombre}` : nombre };
      unidos.set(k.clave, uno);
      r.push(uno);
    } else if (!c.hecho) {
      ya.hecho = false;
      if (!ya.pendiente) ya.pendiente = c.pendiente;
    }
  }
  return r;
}
