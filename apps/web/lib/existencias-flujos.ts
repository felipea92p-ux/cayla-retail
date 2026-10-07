/* ====================================================================
   Los pasos guiados del panel de una talla (2026-10-06, maqueta `docs/maquetas/existencias-tactil-2026-10/`, «flujos guiados»)

   Cada acción del panel se hace DENTRO del panel, paso a paso: arriba la acción y la talla con sus pasos numerados, en medio el
   paso de ahora, abajo «Falta: …» (tocable) y Atrás / Continuar. Este archivo decide los pasos de cada acción, cuándo un paso
   está completo, qué le falta, qué dice el botón final y el resumen antes de confirmar. Lógica pura, con su prueba; el
   componente (`FlujoTalla.tsx`) solo dibuja y llama a la base.

   «Falta» sale SOLO de lo que la función de la base exige (regla de la guía de foco, ADR-0284): lo opcional no se lista.
   Cada acción llama a la MISMA función que su ventana de siempre, con los mismos armadores (`argumentosDeBajada`,
   `argumentosDeRetiro`, `argumentosDeAjuste`, `argumentosDeReporte`, `pedir_a_otra_sede`, `pedir_prenda_para_apartar`):
   el panel no inventa reglas de stock.

   Lo que la maqueta dibuja y el sistema hace en otro lugar, a propósito:
   · «Enviar a otra sede» termina en «Nuevo traslado» ya cargado (cantidad y sede): el traslado es el único que saca prendas de
     una sede (guía, recepción, «en camino»). Desde el piso, lo que se va a enviar se sube «para enviar» (paso Destino de Subir).
   · «Apartar» abre la separación de Vender con la prenda ya puesta (Felipe eligió «Separación de Vender»): ahí se cobra el
     adelanto, con la caja abierta, el comprobante y la ficha del cliente.
   · El «lo confirma un líder» de Ajustar no existe en la base: el ajuste se guarda con su motivo y queda en Movimientos.
   ==================================================================== */

import { problemasReporte, type CampoReporte } from "./danadas-reglas";
import { NOTA_MINIMA_ENCONTRE } from "./ajuste-reglas";
import { cantidadEnSede, type SedeConStockId } from "./stock-por-sede";

export type TipoFlujo = "colgar" | "colgarVarias" | "subir" | "enviar" | "pedir" | "ajustar" | "danada";

export type PasoFlujo = "cantidad" | "varias" | "destino" | "hacia" | "para" | "origen" | "cliente" | "lugar" | "cambio" | "motivo" | "quetiene" | "quien";

/** Los motivos de «Ajustar» con las palabras de la maqueta. Cada uno viaja a la base como uno de sus cuatro motivos
 *  (`MOTIVOS_AJUSTE`): «Error al cobrar» y «Uso interno» son «otro» con su nombre como nota, y «Se dañó» no ajusta: lleva a
 *  «Reportar dañada» (una dañada no se resta, se reporta y el líder decide). */
export type MotivoFlujo = "no_aparece" | "conte_menos" | "error_cobro" | "uso_interno" | "se_dano" | "otro" | "encontre" | "conte_mas";

export type DatosFlujo = {
  n?: number;
  /** «Colgar varias»: cuántas de cada talla (por `varianteId`). */
  cant?: Record<string, number>;
  destino?: "queda" | "enviar";
  sedeId?: string;
  nota?: string;
  para?: "reponer" | "cliente";
  origenId?: string;
  nombres?: string;
  apellidos?: string;
  celular?: string;
  lugar?: "piso" | "almacen";
  signo?: "sumar" | "quitar";
  motivo?: MotivoFlujo;
};

export type SedeConCantidad = { id: string; nombre: string; cantidad: number };

/** Lo que el flujo necesita saber de la talla y de la pantalla para decidir. */
export type ContextoFlujo = {
  /** Libres en el piso y en el almacén de ESTA talla. */
  piso: number;
  almacen: number;
  /** Separa piso y almacén (una tienda); el Taller no. */
  separa: boolean;
  /** «Colgar varias»: lo libre en el almacén de cada talla del modelo, para topar. */
  almacenPorTalla?: Record<string, number>;
  /** A dónde se puede subir «para enviar» / enviar (otras sedes). Vacío: Subir no pregunta destino. */
  destinos: readonly { id: string; nombre: string }[];
  /** A quién se le puede pedir esta talla y cuánto tiene cada una. */
  origenes: readonly SedeConCantidad[];
  /** ¿Puede pedir para un cliente que espera? (módulo Apartados, y es una tienda). */
  puedePedirParaCliente: boolean;
  responsableListo: boolean;
};

export const NOMBRE_FLUJO: Record<TipoFlujo, string> = {
  colgar: "Colgar en el piso",
  colgarVarias: "Colgar varias",
  subir: "Subir a almacén",
  enviar: "Enviar a otra sede",
  pedir: "Pedir a otra sede",
  ajustar: "Ajustar stock",
  danada: "Reportar dañada",
};

export const ETIQUETA_PASO: Record<PasoFlujo, string> = {
  cantidad: "Cuántas",
  varias: "Cuántas de cada una",
  destino: "Destino",
  hacia: "Sede",
  para: "Para quién",
  origen: "Sede",
  cliente: "Cliente",
  lugar: "Dónde",
  cambio: "Cambio",
  motivo: "Motivo",
  quetiene: "Qué tiene",
  quien: "Quién",
};

/** Lo que dice «Falta: …» de cada paso, en minúscula para encadenarlo. */
export const FALTA_PASO: Record<PasoFlujo, string> = {
  cantidad: "cuántas",
  varias: "cuántas de cada talla",
  destino: "a dónde va",
  hacia: "a qué sede",
  para: "para quién es",
  origen: "la sede",
  cliente: "el cliente",
  lugar: "dónde",
  cambio: "sumar o quitar y cuántas",
  motivo: "el motivo",
  quetiene: "qué tiene",
  quien: "quién lo hace",
};

export function pasosDe(tipo: TipoFlujo, d: DatosFlujo, c: Pick<ContextoFlujo, "separa" | "destinos">): PasoFlujo[] {
  switch (tipo) {
    case "colgar":
      return ["cantidad", "quien"];
    case "colgarVarias":
      return ["varias", "quien"];
    case "subir":
      return c.destinos.length > 0 ? ["cantidad", "destino", "quien"] : ["cantidad", "quien"];
    case "enviar":
      // Sin «Quién»: lo pide «Nuevo traslado», que es donde se firma la salida.
      return ["cantidad", "hacia"];
    case "pedir":
      return d.para === "cliente" ? ["para", "origen", "cliente", "quien"] : ["para", "origen", "cantidad", "quien"];
    case "ajustar":
      return c.separa ? ["lugar", "cambio", "motivo", "quien"] : ["cambio", "motivo", "quien"];
    case "danada":
      return c.separa ? ["lugar", "cantidad", "quetiene", "quien"] : ["cantidad", "quetiene", "quien"];
  }
}

/** Lo libre en el lugar elegido (el Taller no separa: todo es «piso»). */
function libreEn(c: Pick<ContextoFlujo, "piso" | "almacen" | "separa">, lugar: DatosFlujo["lugar"]): number {
  if (!c.separa) return c.piso + c.almacen;
  return lugar === "almacen" ? c.almacen : c.piso;
}

/** El tope de «¿Cuántas?» de cada acción: nunca más de lo que hay donde se saca. */
export function maxCantidad(tipo: TipoFlujo, d: DatosFlujo, c: ContextoFlujo): number {
  switch (tipo) {
    case "colgar":
    case "enviar":
      return c.separa ? c.almacen : c.piso + c.almacen;
    case "subir":
      return c.piso;
    case "pedir":
      return c.origenes.find((o) => o.id === d.origenId)?.cantidad ?? 0;
    case "danada":
      return libreEn(c, d.lugar);
    default:
      return 0;
  }
}

/** Los motivos que se ofrecen según sumar o quitar y el lugar. «Encontré prendas» solo suma y, donde se separa piso y almacén,
 *  solo en el almacén (lo que sube al piso se cuelga desde el almacén: `reposicionCerrada`). */
export function motivosDeAjuste(signo: DatosFlujo["signo"], lugar: DatosFlujo["lugar"], separa: boolean): { clave: MotivoFlujo; texto: string; ayuda: string }[] {
  if (signo === "sumar") {
    const lista: { clave: MotivoFlujo; texto: string; ayuda: string }[] = [];
    if (!(separa && lugar === "piso")) lista.push({ clave: "encontre", texto: "Encontré unidades", ayuda: "Escribe dónde estaban" });
    lista.push({ clave: "conte_mas", texto: "Conté y hay más", ayuda: "El número del sistema se quedó corto" }, { clave: "otro", texto: "Otro", ayuda: "Con nota" });
    return lista;
  }
  return [
    { clave: "no_aparece", texto: "No aparece", ayuda: "La buscaste y no está" },
    { clave: "conte_menos", texto: "Conté y hay menos", ayuda: "El número del sistema se pasó" },
    { clave: "error_cobro", texto: "Error al cobrar", ayuda: "Se vendió otra talla o color" },
    { clave: "uso_interno", texto: "Uso interno", ayuda: "Se usó en la tienda" },
    { clave: "se_dano", texto: "Se dañó", ayuda: "No se resta: se reporta" },
    { clave: "otro", texto: "Otro", ayuda: "Con nota" },
  ];
}

/** El motivo y la nota que viajan a `ajustar_inventario` (sus cuatro motivos: reposicion, merma, conteo_fisico, otro). */
export function motivoParaLaBase(m: MotivoFlujo, nota: string): { motivo: "reposicion" | "merma" | "conteo_fisico" | "otro"; nota: string } {
  const extra = nota.trim();
  switch (m) {
    case "encontre":
      return { motivo: "reposicion", nota: extra };
    case "no_aparece":
      return { motivo: "merma", nota: extra };
    case "conte_menos":
    case "conte_mas":
      return { motivo: "conteo_fisico", nota: extra };
    case "error_cobro":
      return { motivo: "otro", nota: extra ? `Error al cobrar: ${extra}` : "Error al cobrar" };
    case "uso_interno":
      return { motivo: "otro", nota: extra ? `Uso interno: ${extra}` : "Uso interno" };
    default:
      return { motivo: "otro", nota: extra };
  }
}

/** ¿El motivo pide nota? «Encontré» (lo exige la base) y «Otro» (sin nota no se sabe qué pasó). */
export function motivoPideNotaFlujo(m: MotivoFlujo | undefined): boolean {
  return m === "encontre" || m === "otro";
}

const soloDigitos = (s: string | undefined) => (s ?? "").replace(/\D/g, "");
export const celularValido = (s: string | undefined) => /^9\d{8}$/.test(soloDigitos(s));

/** Reportar dañada pregunta a SU validación de siempre (`problemasReporte`, la de la base): el paso está completo si no tiene problema. */
const CAMPO_DANADA: Partial<Record<PasoFlujo, CampoReporte>> = { lugar: "desde", cantidad: "cantidad", quetiene: "motivo" };
function pasoDeDanadaCompleto(paso: PasoFlujo, d: DatosFlujo, c: ContextoFlujo): boolean | null {
  const campo = CAMPO_DANADA[paso];
  if (!campo) return null;
  const talla = { varianteId: "", talla: null, piso: c.separa ? c.piso : c.piso + c.almacen, almacen: c.separa ? c.almacen : 0 };
  const desde = c.separa ? (d.lugar ?? null) : "piso";
  return !problemasReporte({ talla, desde, cantidad: d.n ?? 0, motivo: d.nota ?? "" }).some((p) => p.campo === campo);
}

export function pasoCompleto(paso: PasoFlujo, tipo: TipoFlujo, d: DatosFlujo, c: ContextoFlujo): boolean {
  if (tipo === "danada") {
    const r = pasoDeDanadaCompleto(paso, d, c);
    if (r !== null) return r;
  }
  switch (paso) {
    case "cantidad": {
      const n = d.n ?? 0;
      return n > 0 && n <= maxCantidad(tipo, d, c);
    }
    case "varias":
      return Object.entries(d.cant ?? {}).some(([v, n]) => n > 0 && n <= (c.almacenPorTalla?.[v] ?? 0)) && Object.entries(d.cant ?? {}).every(([v, n]) => n <= (c.almacenPorTalla?.[v] ?? 0));
    case "destino":
      return d.destino === "queda" || (d.destino === "enviar" && Boolean(d.sedeId));
    case "hacia":
      return Boolean(d.sedeId);
    case "para":
      return d.para === "reponer" || (d.para === "cliente" && c.puedePedirParaCliente);
    case "origen":
      return Boolean(d.origenId) && (c.origenes.find((o) => o.id === d.origenId)?.cantidad ?? 0) > 0;
    case "cliente":
      return Boolean(d.nombres?.trim()) && Boolean(d.apellidos?.trim()) && celularValido(d.celular);
    case "lugar":
      return d.lugar === "piso" || d.lugar === "almacen";
    case "cambio": {
      const n = d.n ?? 0;
      if (!d.signo || n <= 0) return false;
      return d.signo === "sumar" || n <= libreEn(c, d.lugar);
    }
    case "motivo":
      if (!d.motivo || d.motivo === "se_dano") return false;
      if (!motivosDeAjuste(d.signo, d.lugar, c.separa).some((m) => m.clave === d.motivo)) return false;
      if (d.motivo === "encontre") return (d.nota ?? "").trim().length >= NOTA_MINIMA_ENCONTRE;
      if (d.motivo === "otro") return (d.nota ?? "").trim().length >= 3;
      return true;
    case "quetiene":
      return false; // solo existe en Reportar dañada, que responde arriba
    case "quien":
      return c.responsableListo;
  }
}

/** Los pasos hasta el de ahora que no están completos: lo que dice «Falta: …» (cada uno lleva a su paso). */
export function faltanHasta(tipo: TipoFlujo, i: number, d: DatosFlujo, c: ContextoFlujo): PasoFlujo[] {
  return pasosDe(tipo, d, c)
    .slice(0, i + 1)
    .filter((p) => !pasoCompleto(p, tipo, d, c));
}

export function totalVarias(d: DatosFlujo): number {
  return Object.values(d.cant ?? {}).reduce((a, b) => a + Math.max(0, b), 0);
}

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/** «Así va a quedar» del paso Colgar / Subir de una talla (2026-10-07, maqueta `existencias-tarjeta-cajon-2026-10`): de dónde sale y a
 *  dónde llega, con lo que hay antes y lo que queda después. Lo que viaja va entre las dos cajas. `null` en los demás pasos. */
export function asiQueda(tipo: TipoFlujo, n: number, c: Pick<ContextoFlujo, "piso" | "almacen">): { de: LadoMovido; a: LadoMovido } | null {
  const k = Math.max(0, n);
  const piso = (despues: number): LadoMovido => ({ lugar: "piso", antes: c.piso, despues });
  const almacen = (despues: number): LadoMovido => ({ lugar: "almacen", antes: c.almacen, despues });
  if (tipo === "colgar") return { de: almacen(c.almacen - k), a: piso(c.piso + k) };
  if (tipo === "subir") return { de: piso(c.piso - k), a: almacen(c.almacen + k) };
  return null;
}
export type LadoMovido = { lugar: "piso" | "almacen"; antes: number; despues: number };

/** El botón del último paso, con el verbo y el número: «Colgar 3», «Subir 2 a almacén», «Enviar pedido». */
export function verboFinal(tipo: TipoFlujo, d: DatosFlujo, sedeNombre?: string | null): string {
  const n = d.n ?? 0;
  switch (tipo) {
    case "colgar":
      return n > 0 ? `Colgar ${n}` : "Colgar";
    case "colgarVarias": {
      const t = totalVarias(d);
      return t > 0 ? `Colgar ${unidades(t)}` : "Colgar";
    }
    case "subir":
      return d.destino === "enviar" ? `Subir ${n || ""} para enviar`.replace("  ", " ") : `Subir ${n || ""} a almacén`.replace("  ", " ");
    case "enviar":
      return sedeNombre ? `Armar el traslado a ${sedeNombre}` : "Armar el traslado";
    case "pedir":
      return d.para === "cliente" ? "Pedir y apartar" : "Enviar pedido";
    case "ajustar":
      return "Ajustar stock";
    case "danada":
      return "Reportar dañada";
  }
}

/** El resumen antes de confirmar (va sobre el paso «Quién»): lo que va a pasar, en filas «qué · cuánto». */
export function resumenDeFlujo(
  tipo: TipoFlujo,
  d: DatosFlujo,
  c: ContextoFlujo,
  nombres: { sede?: (id: string | undefined) => string | null; tallas?: (varianteId: string) => string } = {}
): [string, string][] {
  const n = d.n ?? 0;
  const sede = (id: string | undefined) => nombres.sede?.(id) ?? "—";
  switch (tipo) {
    case "colgar":
      return [
        ["Al piso", unidades(n)],
        ["Queda en almacén", String(Math.max(0, c.almacen - n))],
      ];
    case "colgarVarias": {
      const filas: [string, string][] = Object.entries(d.cant ?? {})
        .filter(([, x]) => x > 0)
        .map(([v, x]) => [nombres.tallas?.(v) ?? "Talla", `× ${x}`]);
      return [...filas, ["Total al piso", unidades(totalVarias(d))]];
    }
    case "subir":
      return [
        ["Al almacén", unidades(n)],
        ["Destino", d.destino === "enviar" ? `Para enviar a ${sede(d.sedeId)}` : "Se queda aquí"],
      ];
    case "enviar":
      return [
        ["Sale del almacén", unidades(n)],
        ["Hacia", sede(d.sedeId)],
      ];
    case "pedir":
      return d.para === "cliente"
        ? [
            ["A", sede(d.origenId)],
            ["Para", `${(d.nombres ?? "").trim()} ${(d.apellidos ?? "").trim()} · 1 unidad`],
            ["Queda", `Apartada en ${sede(d.origenId)}`],
          ]
        : [
            ["A", sede(d.origenId)],
            ["Cuántas", unidades(n)],
          ];
    case "ajustar": {
      const m = motivosDeAjuste(d.signo, d.lugar, c.separa).find((x) => x.clave === d.motivo);
      const donde = !c.separa ? "En la sede" : d.lugar === "almacen" ? "En almacén" : "En piso";
      return [
        [donde, `${d.signo === "sumar" ? "+" : "−"}${n}`],
        ["Motivo", m?.texto ?? "—"],
      ];
    }
    case "danada":
      return [
        ["Dañadas", unidades(n)],
        ["Qué tiene", (d.nota ?? "").trim() || "—"],
      ];
  }
}

/** Lo que queda en el lugar tras el ajuste: «Queda en 4 en piso». */
export function quedaTrasAjuste(d: DatosFlujo, c: Pick<ContextoFlujo, "piso" | "almacen" | "separa">): number {
  const antes = libreEn(c, d.lugar);
  if (!d.signo) return antes;
  return d.signo === "sumar" ? antes + (d.n ?? 0) : antes - (d.n ?? 0);
}

/** El texto del aviso de éxito de cada acción, como en la maqueta («Reposición hecha · 3 unidades al piso»). */
export function textoHecho(tipo: TipoFlujo, d: DatosFlujo, sede?: string | null): string {
  const n = d.n ?? 0;
  switch (tipo) {
    case "colgar":
      return `Colgado · ${unidades(n)} al piso`;
    case "colgarVarias":
      return `Colgado · ${unidades(totalVarias(d))} al piso en una sola operación`;
    case "subir":
      return d.destino === "enviar" ? `Subida al almacén · queda por enviar a ${sede ?? "la otra sede"}` : `Subida al almacén · ${unidades(n)}`;
    case "enviar":
      return `Traslado a ${sede ?? "la otra sede"} listo para armar`;
    case "pedir":
      return d.para === "cliente" ? `Pedido a ${sede ?? "la otra sede"} · queda apartada allá para ${(d.nombres ?? "").trim()}` : `Pedido a ${sede ?? "la otra sede"} · lo verán en Traslados`;
    case "ajustar":
      return `Stock ajustado · ${d.signo === "sumar" ? "+" : "−"}${n}${!d.lugar ? "" : d.lugar === "almacen" ? " en almacén" : " en piso"}`;
    case "danada":
      return `Dañada reportada · ${unidades(n)} a revisión`;
  }
}

/** La tienda a la que conviene pedir una talla: entre las que se le puede pedir (`sedesParaPedir`, cruzadas por id de sede),
 *  la que más tiene. `null`: ninguna la tiene (el Taller no cuenta: no se le pide). Lo usan el «Pedir» de la tarjeta y el de las
 *  filas «agotada: en otras sedes» del panel. */
export function mejorOrigen(
  enRed: readonly SedeConStockId[] | undefined,
  sedes: readonly { id: string; nombre: string }[]
): SedeConCantidad | null {
  return (
    sedes
      .map((s) => ({ ...s, cantidad: cantidadEnSede(enRed, s.id) }))
      .filter((s) => s.cantidad > 0)
      .sort((a, b) => b.cantidad - a.cantidad)[0] ?? null
  );
}
