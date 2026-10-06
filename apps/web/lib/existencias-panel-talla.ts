/* ====================================================================
   El panel de una talla en Existencias (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`)

   Tocar una talla abre un panel con tres vistas (Esta talla · Todas · Ficha). En «Esta talla», siete acciones en tarjetas, cada una
   con lo que dice debajo de su nombre («8 en almacén») o por qué está apagada, y la que la pantalla sugiere resaltada. Este archivo
   decide esas siete tarjetas y «Qué toca con esta talla» (más abajo); el componente solo los dibuja. Lógica pura, con su prueba.

   Los nombres son los del sistema (ADR-0339): «Colgar en el piso» (la «Reponer» de la maqueta) y «Subir a almacén» (su «Retirar del
   piso»). Una acción que la persona no puede hacer por su rol no se dibuja (ADR-0161: nunca un botón que acabe en «Sin acceso»).
   «Apartar» abre la separación de Vender con la talla puesta (ahí se cobra el adelanto); «Pedir a otra sede» usa los pedidos
   entre tiendas que ya existen (`pedir_a_otra_sede`, `pedir_prenda_para_apartar`) y dice debajo quién la tiene.
   ==================================================================== */

import { estadoTalla, type FilaPrenda } from "./existencias-prendas";
import { fraseDeLoQueFalta, tallasQueFaltan, type PrendaParaReponer } from "./reponer-prenda-reglas";
import { nombreCortoSede } from "./stock-por-sede";

export type ClaveAccionTalla = "colgar" | "subir" | "enviar" | "apartar" | "pedir" | "ajustar" | "ficha";

export type AccionTalla = {
  clave: ClaveAccionTalla;
  texto: string;
  /** Lo que dice debajo del nombre: qué hay, o por qué está apagada. */
  sub: string;
  ok: boolean;
  /** La que la pantalla recomienda para esta talla (una sola, o ninguna): va primero y resaltada. */
  sugerida: boolean;
  /** Su tecla (1–7): fija por ACCIÓN, no por lugar, porque el orden cambia con la talla (2026-10-06). Quien usa el teclado no se pierde. */
  tecla: number;
};

const TECLA: Record<ClaveAccionTalla, number> = { colgar: 1, subir: 2, enviar: 3, apartar: 4, pedir: 5, ajustar: 6, ficha: 7 };

/** En qué orden conviene ofrecerlas según dónde está la prenda (2026-10-06, pedido de uso: «que el orden cambie según lo que necesita esa
 *  prenda y se muestren primero las que puede usar»): con algo en el piso, venderla (apartar) es lo primero; sin nada colgado pero algo
 *  atrás, colgarla; sin nada en la sede, pedirla. */
const ORDEN_SEGUN_LUGAR: Record<"conPiso" | "sinPiso" | "sinStock", readonly ClaveAccionTalla[]> = {
  conPiso: ["apartar", "colgar", "subir", "enviar", "pedir", "ajustar", "ficha"],
  sinPiso: ["colgar", "apartar", "enviar", "pedir", "subir", "ajustar", "ficha"],
  sinStock: ["pedir", "ajustar", "ficha", "apartar", "colgar", "subir", "enviar"],
};

export type PermisosDeTalla = {
  puedeReponer: boolean;
  puedeEnviar: boolean;
  puedeAjustar: boolean;
  /** Módulo Apartados en una tienda: «Apartar» abre la separación de Vender con esta talla. */
  puedeApartar?: boolean;
  /** Puede pedir a otra tienda (módulo Traslados, en una tienda). */
  puedePedir?: boolean;
  /** Las otras tiendas a las que se les puede pedir, con lo que tiene cada una de esta talla. */
  origenes?: readonly { nombre: string; cantidad: number }[];
};

type FilaDeTalla = FilaPrenda & { enRed?: readonly { sede: string; cantidad: number }[] };

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/** «LIM tiene 2 · AQP tiene 1»: lo que dice «Pedir a otra sede» debajo de su nombre. */
function quienTiene(origenes: readonly { nombre: string; cantidad: number }[]): string | null {
  const con = origenes.filter((o) => o.cantidad > 0);
  return con.length ? con.map((o) => `${nombreCorto(o.nombre)} tiene ${o.cantidad}`).join(" · ") : null;
}
const nombreCorto = (n: string) => n.replace(/^tienda\s+/i, "").trim();

export function accionesDeTalla(f: FilaDeTalla, p: PermisosDeTalla, separa: boolean): AccionTalla[] {
  const piso = Math.max(0, f.pisoDisponible ?? 0);
  const alm = Math.max(0, f.almacenDisponible ?? 0);
  const aqui = separa ? piso + alm : Math.max(0, f.disponible);
  const sinStock = f.disponible <= 0;
  const tienen = quienTiene(p.origenes ?? []);
  // Lo que la talla necesita, con la MISMA vara que «Qué toca» (`queTocaConLaTalla`): colgar si el motor lo pide —o, sin su decisión, si
  // no hay en el piso y sí atrás; nunca en pausa—; si no, pedir cuando queda 1 o ninguna, nada viene en camino y una tienda tiene.
  const accionMotor = f.planPiso?.accion ?? null;
  const pideColgar = separa && alm > 0 && (estadoTalla(f) === "por_colgar" || (accionMotor === null && piso === 0));
  const pidePedir = !pideColgar && tienen !== null && aqui <= 1 && Math.max(0, f.enTransito ?? 0) === 0;
  const filas: Omit<AccionTalla, "tecla">[] = [];
  if (separa && p.puedeReponer) {
    filas.push({ clave: "colgar", texto: "Colgar en el piso", ok: alm > 0, sub: alm > 0 ? `${unidades(alm)} en almacén` : "Nada en almacén", sugerida: pideColgar });
    filas.push({ clave: "subir", texto: "Subir a almacén", ok: piso > 0, sub: piso > 0 ? `${unidades(piso)} en piso` : "Nada en piso", sugerida: false });
  }
  if (p.puedeEnviar) {
    const hay = separa ? alm : f.disponible;
    filas.push({ clave: "enviar", texto: "Enviar a otra sede", ok: hay > 0, sub: hay > 0 ? `${unidades(hay)} ${separa ? "en almacén" : "aquí"}` : separa ? "Nada en almacén" : "Nada aquí", sugerida: false });
  }
  if (p.puedeApartar) {
    filas.push({ clave: "apartar", texto: "Apartar", ok: !sinStock, sub: sinStock ? "Sin stock aquí: pídela" : "Con adelanto · en Vender", sugerida: false });
  }
  if (p.puedePedir) {
    filas.push({ clave: "pedir", texto: "Pedir a otra sede", ok: tienen !== null, sub: tienen ?? "Ninguna tienda tiene", sugerida: pidePedir && !!p.puedePedir }); // al Taller no se le pide por aquí
  }
  if (p.puedeAjustar) filas.push({ clave: "ajustar", texto: "Ajustar stock", ok: true, sub: "Corregir el número", sugerida: false });
  filas.push({ clave: "ficha", texto: "Ficha", ok: true, sub: "Precio, descripción, historial", sugerida: false });

  // Primero la que la talla necesita; después las que se pueden, en el orden de su lugar; al final las que no se pueden ahora.
  const orden = ORDEN_SEGUN_LUGAR[aqui === 0 ? "sinStock" : separa && piso === 0 ? "sinPiso" : "conPiso"];
  const peso = (a: Omit<AccionTalla, "tecla">) => (a.sugerida ? 0 : a.ok ? 100 : 200) + orden.indexOf(a.clave);
  return filas.map((a) => ({ ...a, tecla: TECLA[a.clave] })).sort((a, b) => peso(a) - peso(b));
}

/* ====================================================================
   «Qué toca con esta talla» (2026-10-06, pedido de uso: «le falta especificar si hay, si reponer, qué falta, y si sugiere pedir o no
   a otra sede»). Tres respuestas que SIEMPRE dicen algo, aunque el motor del piso no haya respondido o el piso espere su cuadre:

     · Hay            — sí / no, con cuántas en piso y en almacén (o cuántas vienen en camino).
     · Colgar         — sí (cuántas) / no hace falta / no se puede / en pausa. Manda el motor (`planPiso.accion`) cuando decide; sin su
                        decisión, los números (0 en el piso y algo atrás = sí). En pausa NO manda a colgar: el sistema puede creer
                        guardado lo que ya cuelga (ADR-0328, decisión 5), y lo dice.
     · Pedir a otra   — no hace falta (hay 2 o más aquí, o viene en camino) / sí, a la tienda que más tiene / ninguna tienda tiene. La
       sede             vara de «casi no hay»: 1 o ninguna aquí, nada en camino. Al Taller no se le pide por esta vía (la base lo
                        rechaza): si solo él tiene, se dice, sin botón.

   El título de cada fila es la pregunta misma («¿Hay?», «¿Colgar?», «¿Pedir?»; 2026-10-06, tarde): con «COLGAR EN EL PISO» en
   mayúsculas la columna se partía en dos líneas y el panel se veía amontonado. La respuesta («Sí · cuelga 1…») dice el resto.

   Lógica pura: el panel solo la dibuja. No agrega reglas de negocio: dice con palabras lo que el motor y los números ya dicen.
   ==================================================================== */

/** Las tres preguntas, en el orden en que se leen. */
export const PREGUNTA_QUE_TOCA = { hay: "¿Hay?", colgar: "¿Colgar?", pedir: "¿Pedir?" } as const;

export type TonoQueToca = "verde" | "ambar" | "pizarra";

export type RespuestaQueToca = {
  tema: "hay" | "colgar" | "pedir";
  titulo: string;
  /** La respuesta corta, en negrita: «Sí», «No hace falta», «En pausa»… */
  respuesta: string;
  tono: TonoQueToca;
  detalle: string;
  /** El botón que lo resuelve ahí mismo, si quien mira puede hacerlo. */
  accion?: "colgar" | "pedir";
};

type TallaQueToca = FilaDeTalla & { planPiso?: { accion?: string | null; requisito?: number; central?: boolean } | null };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function queTocaConLaTalla(
  f: TallaQueToca,
  o: {
    separa: boolean;
    /** Las tiendas a las que se les puede pedir (por nombre de sede, como viene la red de stock). */
    tiendas: ReadonlySet<string>;
    puedeColgar: boolean;
    puedePedir: boolean;
  }
): RespuestaQueToca[] {
  const piso = Math.max(0, f.pisoDisponible ?? 0);
  const alm = Math.max(0, f.almacenDisponible ?? 0);
  const aqui = o.separa ? piso + alm : Math.max(0, f.disponible);
  const enCamino = Math.max(0, f.enTransito ?? 0);
  const aparte = [f.apartado > 0 ? plural(f.apartado, "apartada", "apartadas") : null, (f.danado ?? 0) > 0 ? plural(f.danado ?? 0, "dañada", "dañadas") : null].filter(
    (x): x is string => x !== null
  );
  const notaAparte = aparte.length ? ` · aparte, ${aparte.join(" y ")}` : "";

  const salida: RespuestaQueToca[] = [];

  // Hay: lo libre para vender (lo apartado y lo dañado no se venden: van aparte).
  salida.push(
    aqui > 0
      ? { tema: "hay", titulo: PREGUNTA_QUE_TOCA.hay, respuesta: "Sí", tono: "verde", detalle: (o.separa ? `${piso} en piso · ${alm} en almacén` : `${plural(aqui, "unidad", "unidades")} en esta sede`) + notaAparte }
      : {
          tema: "hay",
          titulo: PREGUNTA_QUE_TOCA.hay,
          respuesta: "No",
          tono: "pizarra",
          detalle: (enCamino > 0 ? `Nada para vender aquí · vienen ${enCamino} en camino` : "Nada para vender en esta sede") + notaAparte,
        }
  );

  if (!o.separa) return salida;

  // Colgar en el piso: manda el motor cuando decide; sin su decisión, los números.
  const accion = f.planPiso?.accion ?? null;
  const conBoton = (r: RespuestaQueToca): RespuestaQueToca => (o.puedeColgar ? { ...r, accion: "colgar" } : r);
  if (alm === 0) {
    salida.push(
      piso > 0
        ? { tema: "colgar", titulo: PREGUNTA_QUE_TOCA.colgar, respuesta: "No hace falta", tono: "verde", detalle: `Hay ${piso} en el piso` }
        : { tema: "colgar", titulo: PREGUNTA_QUE_TOCA.colgar, respuesta: "No se puede", tono: "pizarra", detalle: "No hay en el almacén" }
    );
  } else if (accion === "pausa_sin_cuadre") {
    salida.push({
      tema: "colgar",
      titulo: PREGUNTA_QUE_TOCA.colgar,
      respuesta: "En pausa",
      tono: "pizarra",
      detalle: `El sistema dice ${piso} en el piso y ${alm} en almacén, pero el piso de esta sede no está cuadrado: mira si ya cuelga antes de colgar más`,
    });
  } else if (accion === "mantener") {
    salida.push({
      tema: "colgar",
      titulo: PREGUNTA_QUE_TOCA.colgar,
      respuesta: "No hace falta",
      tono: "verde",
      detalle:
        piso > 0
          ? `Hay ${piso} en el piso`
          : f.planPiso?.central === false
            ? `Talla de los extremos: no necesita estar colgada (hay ${alm} en almacén si la piden)`
            : `El piso tiene lo que necesita (hay ${alm} en almacén)`,
    });
  } else if (accion === "por_colgar" || (accion === null && piso === 0)) {
    // «por_colgar» del motor, o sin motor: 0 en el piso y algo atrás. Cuántas: lo que falta para su requisito (1 por color, de fábrica).
    const requisito = Math.max(1, f.planPiso?.requisito ?? 1);
    const n = Math.min(alm, Math.max(1, requisito - piso));
    salida.push(
      conBoton({
        tema: "colgar",
        titulo: PREGUNTA_QUE_TOCA.colgar,
        respuesta: "Sí",
        tono: "ambar",
        detalle: piso === 0 ? `Cuelga ${n}: no hay en el piso y hay ${alm} en almacén` : `Cuelga ${n} más: hay ${piso} en el piso y debería haber ${requisito}`,
      })
    );
  } else {
    salida.push({ tema: "colgar", titulo: PREGUNTA_QUE_TOCA.colgar, respuesta: "No hace falta", tono: "verde", detalle: `Hay ${piso} en el piso` });
  }

  // Pedir a otra sede: la vara de «casi no hay» (1 o ninguna aquí, nada en camino).
  const conStock = (f.enRed ?? []).filter((s) => s.cantidad > 0);
  const tiendasCon = conStock.filter((s) => o.tiendas.has(s.sede)).sort((a, b) => b.cantidad - a.cantidad);
  const otrasCon = conStock.filter((s) => !o.tiendas.has(s.sede)).sort((a, b) => b.cantidad - a.cantidad);
  const titulo = PREGUNTA_QUE_TOCA.pedir;
  if (enCamino > 0) {
    salida.push({ tema: "pedir", titulo, respuesta: "No hace falta", tono: "verde", detalle: `Vienen ${enCamino} en camino` });
  } else if (aqui >= 2) {
    salida.push({ tema: "pedir", titulo, respuesta: "No hace falta", tono: "verde", detalle: `Hay ${aqui} en esta sede` });
  } else if (tiendasCon.length > 0) {
    const mejor = tiendasCon[0];
    salida.push({
      tema: "pedir",
      titulo,
      respuesta: "Sí",
      tono: aqui === 0 ? "ambar" : "pizarra",
      detalle: `${aqui === 0 ? "No hay aquí" : "Queda 1 aquí"}: ${nombreCortoSede(mejor.sede)} tiene ${mejor.cantidad}${tiendasCon.length > 1 ? ` (y ${plural(tiendasCon.length - 1, "tienda", "tiendas")} más)` : ""}`,
      ...(o.puedePedir ? { accion: "pedir" as const } : {}),
    });
  } else if (otrasCon.length > 0) {
    const quien = otrasCon[0];
    salida.push({
      tema: "pedir",
      titulo,
      respuesta: "A una tienda, no",
      tono: "pizarra",
      detalle: `Ninguna tienda tiene; ${nombreCortoSede(quien.sede)} tiene ${quien.cantidad}: pídeselo a ${nombreCortoSede(quien.sede)}`,
    });
  } else {
    salida.push({ tema: "pedir", titulo, respuesta: "Nadie tiene", tono: "pizarra", detalle: aqui === 1 ? "Queda 1 aquí y ninguna otra sede tiene" : "Ninguna otra sede tiene" });
  }
  return salida;
}

/** «Faltan en el piso» del modelo entero, aunque el motor no decida: con su decisión, la de siempre (`fraseDeLoQueFalta`, y al colgar
 *  quedan marcadas); sin ella, lo que dicen los números (0 en el piso y algo en el almacén, sin las tallas que el motor manda mantener).
 *  Con el piso en pausa, la frase lo advierte: puede que ya cuelguen. `null` si no falta nada.
 *  `ids`: las tallas que faltan (por `varianteId`), para que el panel las dibuje como botones que llevan a cada una. */
export function loQueFaltaEnElPiso(
  prendas: readonly PrendaParaReponer[]
): { titulo: string; tallas: string; ids: ReadonlySet<string>; marcadas: boolean; enPausa: boolean } | null {
  const delMotor = fraseDeLoQueFalta(prendas);
  if (delMotor) {
    const i = delMotor.indexOf(":");
    return { titulo: delMotor.slice(0, i), tallas: delMotor.slice(i + 1).trim().replace(/\.$/, ""), ids: tallasQueFaltan(prendas), marcadas: true, enPausa: false };
  }
  let enPausa = false;
  const ids = new Set<string>();
  const partes = prendas
    .map((p) => {
      const tallas = p.tallas
        .filter((f) => {
          const accion = f.planPiso?.accion ?? null;
          if (accion === "mantener" || accion === "por_colgar") return false; // el motor ya decidió (y por_colgar lo dijo arriba)
          const sinPiso = Math.max(0, f.pisoDisponible ?? 0) === 0 && Math.max(0, f.almacenDisponible ?? 0) > 0;
          if (sinPiso && accion === "pausa_sin_cuadre") enPausa = true;
          if (sinPiso) ids.add(f.varianteId);
          return sinPiso;
        })
        .map((f) => f.talla?.trim() || "Única");
      if (tallas.length === 0) return null;
      const color = p.color?.trim();
      return prendas.length > 1 && color ? `${color} ${tallas.join(", ")}` : tallas.join(", ");
    })
    .filter((x): x is string => x !== null);
  if (partes.length === 0) return null;
  return { titulo: enPausa ? "Sin colgar, según el sistema" : "Faltan en el piso", tallas: partes.join(" · "), ids, marcadas: false, enPausa };
}

/* ====================================================================
   Lo que dicen las tallas de arriba del panel (2026-10-06, noche; pedido: «es muy repetitivo poner de nuevo la talla, eso se podría
   poner arriba junto a las tallas»). El panel ya no vuelve a listar tallas más abajo («Faltan en el piso» con sus botones, «Casi no hay
   aquí» con una fila por talla, las del filtro en pastillas): cada botón de talla lo dice en su lugar —fondo ámbar si falta en el piso,
   «otra sede» o «en camino» debajo si aquí no queda ninguna, la insignia del filtro como en las tarjetas— y UNA línea bajo los botones
   dice cuántas faltan, sin volver a nombrarlas. Los otros colores con algo pendiente llevan un punto en su círculo, como en las tarjetas.
   ==================================================================== */

/** Debajo del número de una talla: cuántas hay en el piso (o en la sede, donde no se separa) o, si aquí no queda ninguna libre, si
 *  viene en camino u otra sede la tiene. `afuera`: el texto habla de otra sede (va en pizarra). */
export function pieDeTalla(f: FilaDeTalla, separa: boolean): { texto: string; afuera: boolean } {
  if (f.disponible <= 0) {
    if ((f.enTransito ?? 0) > 0) return { texto: "en camino", afuera: true };
    if ((f.enRed ?? []).some((s) => s.cantidad > 0)) return { texto: "otra sede", afuera: true };
    return { texto: "—", afuera: false };
  }
  return { texto: separa ? `${Math.max(0, f.pisoDisponible ?? 0)} piso` : String(f.disponible), afuera: false };
}

export type MarcaDeColor = "filtro" | "falta" | "afuera" | null;

/** El punto en el círculo de un color. Con un filtro puesto, si alguna talla de ese color lo cumple (como en las tarjetas); sin filtro,
 *  si le falta algo en el piso o, si no, si tiene alguna agotada aquí que otra sede tiene. */
export function marcaDeColor<F extends FilaDeTalla>(
  tallas: readonly F[],
  o: { faltan: ReadonlySet<string>; coincide?: ((f: F) => boolean) | null; separa: boolean }
): MarcaDeColor {
  if (o.coincide) return tallas.some(o.coincide) ? "filtro" : null;
  if (tallas.some((t) => o.faltan.has(t.varianteId))) return "falta";
  if (tallas.some((t) => pieDeTalla(t, o.separa).texto === "otra sede")) return "afuera";
  return null;
}

const unirNombres = (nombres: readonly string[]) =>
  nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;

/** La única línea bajo las tallas: cuántas faltan en el piso de este color y en qué otros colores también, sin nombrar las tallas (los
 *  botones de arriba ya las marcan en ámbar). `null` si no falta nada en el modelo. */
export function lineaDeLoQueFalta(
  colores: readonly { clave: string; color: string | null; tallas: readonly { varianteId: string }[] }[],
  claveActual: string,
  falta: { titulo: string; ids: ReadonlySet<string> } | null
): string | null {
  if (!falta) return null;
  const cuantas = (c: (typeof colores)[number]) => c.tallas.filter((t) => falta.ids.has(t.varianteId)).length;
  const actual = colores.find((c) => c.clave === claveActual);
  const aqui = actual ? cuantas(actual) : 0;
  const otros = colores.filter((c) => c.clave !== claveActual && cuantas(c) > 0).map((c) => c.color?.trim() || "Sin color");
  if (aqui === 0 && otros.length === 0) return null;
  if (aqui === 0) return `${falta.titulo}: en ${unirNombres(otros)}`;
  return `${falta.titulo}: ${plural(aqui, "talla", "tallas")}${otros.length ? ` · también en ${unirNombres(otros)}` : ""}`;
}
