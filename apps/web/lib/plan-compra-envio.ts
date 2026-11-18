// Plan de campaña ▸ Enviar a Compras (ADR-0530, spike ⑦ de docs/maquetas/plan-campana-vision-2026-10/): el paso 2 guardado de una categoría se envía a Compras como pedidos PENDIENTES, uno por
// proveedor, con la fecha en que la persona piensa pedirlos; la orden de compra solo nace cuando alguien la confirma en Compras ▸ Órdenes. Lógica pura, sin React ni red.
//
// CONTRATO
//   PROMETE: leer lo que mandan `fn_plan_compra_envio` y `fn_plan_compra_envios` sin confiar en su forma (lo que no se entiende se descarta o devuelve null, nunca revienta la pantalla); armar los
//            argumentos de «enviar» con exactamente lo que la base pide (la versión del paso 2 que la persona VIO y, por proveedor, «ya» o una fecha); decir de cada grupo en qué estado está (sin enviar,
//            pendiente, pedido) y por qué un grupo no se puede enviar todavía; y decir si una fecha llega tarde para la campaña.
//   ASUME: las fechas son `aaaa-mm-dd` en hora de Lima. El «hoy» y el límite para pedir los trae la pantalla (`plazoDePedido`); aquí no se calcula ninguno.
//   NO HACE: no valida lo que la base valida (la base vuelve a comprobar todo: una fecha pasada, un proveedor inactivo, una versión vieja del paso 2) ni decide cuándo conviene pedir.

import { sumarDias } from "./fechas-lima";
import { fechaCortaES } from "./plan-compra-reglas";

export const RPC_ENVIO = "fn_plan_compra_envio";
export const RPC_ENVIOS = "fn_plan_compra_envios";
export const RPC_ENVIAR = "enviar_plan_compra_a_compras";
export const RPC_RECTIFICAR_PEDIDO = "rectificar_pedido_campana";

/** Hasta cuándo se puede decir que se piensa pedir (la base lo vuelve a comprobar). */
const MAX_DIAS_PARA_PEDIR = 365;

export type EstadoDelPedido = "pendiente" | "pedido" | "rectificado";
export type Cuando = "ya" | "fecha";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const entero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);

// ---------------------------------------------------------------------------------------------------------------------
// Lo que lee la base (`fn_plan_compra_envio`: una categoría; `fn_plan_compra_envios`: el resumen por categoría)
// ---------------------------------------------------------------------------------------------------------------------

/** Una prenda del grupo: modelo, color y talla (null si la categoría no tiene tallas) con sus nombres, y cuántas. */
export type LineaDeEnvio = { productoId: string; modelo: string; marca: string | null; color: string; colorNombre: string; tallaId: string | null; talla: string | null; n: number };

/** Lo que un proveedor surte de esta categoría según el paso 2 guardado. */
export type GrupoDeEnvio = {
  proveedorId: string;
  proveedor: string;
  /** Es el propio taller (CAYLA SAC): su pedido es una orden de producción, no de compra. */
  esTaller: boolean;
  proveedorActivo: boolean;
  marcas: string[];
  /** Marcas del grupo que están inactivas: la orden de compra no las acepta. */
  marcasInactivas: string[];
  modelos: number;
  unidades: number;
  lineas: LineaDeEnvio[];
};

export type BaseDeEnvio = {
  /** La versión del paso 2 que se envía: la que la persona ve. */
  version: number;
  /** El total del paso 1 con que se guardó ese paso 2. */
  total: number;
  /** Las prendas que YA son orden de compra desde que se guardó ese paso 2 (de pedidos de campaña): «Comprar» del Plan baja con cada orden, y esto explica esa baja. */
  confirmadas: number;
  /** Lo repartido en modelos que ya existen. */
  unidades: number;
  por: string | null;
  en: string | null;
  /** Lo que cuesta cada prenda en el plan (sin IGV); null si el plan ya no tiene la categoría. */
  costo: number | null;
  grupos: GrupoDeEnvio[];
  /** Prendas de modelos sin proveedor / sin marca: no se pueden enviar. */
  sinProveedor: number;
  sinMarca: number;
  /** Lo que el paso 2 dejó «por elegir»: no hay un producto que pedir todavía. */
  modelosNuevos: number;
};

export type PedidoEnviado = {
  id: string;
  proveedorId: string;
  estado: EstadoDelPedido;
  cuando: Cuando;
  fechaPrevista: string | null;
  version: number;
  unidades: number;
  enviadoPor: string | null;
  enviadoEn: string | null;
  /** El número de la orden de compra, si ya se confirmó, y cómo se lee («OC-000129»). */
  ordenNumero: number | null;
  ordenTexto: string | null;
  motivo: string | null;
  rectificadoEn: string | null;
};

export type LecturaEnvio = { base: BaseDeEnvio | null; pedidos: PedidoEnviado[] };

const ESTADOS: readonly EstadoDelPedido[] = ["pendiente", "pedido", "rectificado"];

/** Lo que devuelve `fn_plan_compra_envio`. null si no se entiende o la base no trae la marca `soportado` (la web se publicó antes que la migración). */
export function leerEnvio(v: unknown): LecturaEnvio | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  const b = esObjeto(v.base) ? v.base : null;
  const p2 = b && esObjeto(b.paso_2) ? b.paso_2 : null;
  const base: BaseDeEnvio | null =
    b && p2 && Number.isInteger(p2.version)
      ? {
          version: p2.version as number,
          total: entero(p2.total),
          confirmadas: entero(b.confirmadas),
          unidades: entero(p2.unidades),
          por: texto(p2.por),
          en: texto(p2.en),
          costo: typeof b.costo === "number" && Number.isFinite(b.costo) ? b.costo : typeof b.costo === "string" && Number.isFinite(Number(b.costo)) ? Number(b.costo) : null,
          grupos: lista(b.grupos).flatMap((g): GrupoDeEnvio[] => {
            const proveedorId = texto(g.proveedor_id);
            const proveedor = texto(g.proveedor);
            if (!proveedorId || !proveedor) return [];
            const textos = (x: unknown): string[] => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string" && y.trim() !== "") : []);
            return [
              {
                proveedorId,
                proveedor,
                esTaller: g.es_taller === true,
                proveedorActivo: g.proveedor_activo !== false,
                marcas: textos(g.marcas),
                marcasInactivas: textos(g.marcas_inactivas),
                modelos: entero(g.modelos),
                unidades: entero(g.unidades),
                lineas: lista(g.lineas).flatMap((l): LineaDeEnvio[] => {
                  const productoId = texto(l.producto_id);
                  const color = texto(l.color);
                  const n = entero(l.n);
                  if (!productoId || !color || n <= 0) return [];
                  return [{ productoId, modelo: texto(l.modelo) ?? "Modelo", marca: texto(l.marca), color, colorNombre: texto(l.color_nombre) ?? color, tallaId: texto(l.talla_id), talla: texto(l.talla), n }];
                }),
              },
            ];
          }),
          sinProveedor: entero(b.sin_proveedor),
          sinMarca: entero(b.sin_marca),
          modelosNuevos: entero(b.modelos_nuevos),
        }
      : null;
  const pedidos = lista(v.pedidos).flatMap((p): PedidoEnviado[] => {
    const id = texto(p.id);
    const proveedorId = texto(p.proveedor_id);
    const estado = ESTADOS.find((e) => e === p.estado);
    const cuando: Cuando | null = p.cuando === "ya" ? "ya" : p.cuando === "fecha" ? "fecha" : null;
    if (!id || !proveedorId || !estado || !cuando || !Number.isInteger(p.paso_2_version)) return [];
    return [
      {
        id,
        proveedorId,
        estado,
        cuando,
        fechaPrevista: texto(p.fecha_prevista),
        version: p.paso_2_version as number,
        unidades: entero(p.unidades),
        enviadoPor: texto(p.enviado_por),
        enviadoEn: texto(p.enviado_en),
        ordenNumero: Number.isInteger(p.orden_numero) ? (p.orden_numero as number) : null,
        ordenTexto: texto(p.orden_texto),
        motivo: texto(p.motivo),
        rectificadoEn: texto(p.rectificado_en),
      },
    ];
  });
  return { base, pedidos };
}

/** El resumen de una categoría para su fila de la lista del Plan. `confirmadas`: las prendas que ya son orden desde que se guardó su último paso 2. */
export type ResumenDeEnvio = { categoriaId: string; pendientes: number; pedidos: number; rectificados: number; desactualizado: boolean; confirmadas: number };

/** Lo que devuelve `fn_plan_compra_envios`: por categoría, cuántos pedidos hay en cada estado. null si la base no lo sabe. */
export function leerEnvios(v: unknown): ResumenDeEnvio[] | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  return lista(v.categorias).flatMap((c): ResumenDeEnvio[] => {
    const categoriaId = texto(c.categoria_id);
    return categoriaId
      ? [{ categoriaId, pendientes: entero(c.pendientes), pedidos: entero(c.pedidos), rectificados: entero(c.rectificados), desactualizado: c.desactualizado === true, confirmadas: entero(c.confirmadas) }]
      : [];
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Lo que la persona elige
// ---------------------------------------------------------------------------------------------------------------------

/** «Pedir ya» o «Pedir el …» (con su fecha). */
export type Elegido = { cuando: Cuando; fecha: string };

export const PEDIR_YA: Elegido = { cuando: "ya", fecha: "" };

/**
 * La fecha con que arranca «Pedir el…»: el último día para pedir (lo natural: pedir lo más tarde que se puede sin llegar tarde) y, si ya pasó o la campaña ya empezó, hoy.
 */
export function fechaSugerida(hoy: string, limite: string | null): string {
  return limite !== null && limite >= hoy ? limite : hoy;
}

/** Cambia a «Pedir el…» con una fecha que arranca sensata, o a «Pedir ya». */
export function conCuando(e: Elegido, cuando: Cuando, hoy: string, limite: string | null): Elegido {
  if (cuando === "ya") return { cuando: "ya", fecha: "" };
  return { cuando: "fecha", fecha: e.fecha !== "" ? e.fecha : fechaSugerida(hoy, limite) };
}

/** ¿Pedir en esa fecha llegaría después del límite? «Pedir ya» nunca llega tarde por la fecha (si el plazo ya pasó, el aviso del Plan lo dice aparte). */
export function llegaTarde(e: Elegido, limite: string | null): boolean {
  return e.cuando === "fecha" && limite !== null && e.fecha !== "" && e.fecha > limite;
}

/** Lo que la base rechazaría de una fecha, dicho antes de enviar. null = está bien. */
export function problemaDeLaFecha(e: Elegido, hoy: string): string | null {
  if (e.cuando === "ya") return null;
  if (e.fecha === "") return "Elige la fecha en que piensas pedir.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha)) return "La fecha no se entiende.";
  if (e.fecha < hoy) return "La fecha ya pasó: elige desde hoy.";
  if (e.fecha > sumarDias(hoy, MAX_DIAS_PARA_PEDIR)) return "La fecha pasa de un año: elige una más cercana.";
  return null;
}

/** «Pedir ya» o «Pedir el 12 nov». */
export function fraseDeCuando(cuando: Cuando, fecha: string | null): string {
  return cuando === "ya" || !fecha ? "Pedir ya" : `Pedir el ${fechaCortaES(fecha)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// En qué estado está cada grupo
// ---------------------------------------------------------------------------------------------------------------------

export type EstadoDelGrupo = {
  grupo: GrupoDeEnvio;
  /** El pedido vigente de este proveedor, si lo hay: el PENDIENTE (de cualquier versión del paso 2: se rectifica antes de enviar otro) o el ya pedido de ESTA versión del paso 2. */
  vigente: PedidoEnviado | null;
  /** El último pedido ya hecho de una versión ANTERIOR del paso 2 (la primera tanda), si lo hay: es historia, no impide enviar la segunda. */
  anterior: PedidoEnviado | null;
  /** El último pedido rectificado de este proveedor, si lo hay (es historia: no impide volver a enviar). */
  rectificado: PedidoEnviado | null;
  /** Por qué este grupo no se puede enviar ahora, si no se puede. null = se puede (o ya se envió). */
  bloqueo: string | null;
};

/** Por qué un grupo no se puede enviar: lo que la orden de compra rechazaría, dicho antes. */
export function bloqueoDelGrupo(g: GrupoDeEnvio): string | null {
  if (!g.proveedorActivo) return "El proveedor está inactivo: reactívalo para enviarle un pedido";
  if (g.marcasInactivas.length > 0) return `La marca «${g.marcasInactivas[0]}» está inactiva: reactívala para enviar este pedido`;
  return null;
}

/** Los grupos que van a Compras (no el del Taller), cada uno con su estado. */
export function estadoDeLosGrupos(base: BaseDeEnvio, pedidos: readonly PedidoEnviado[]): EstadoDelGrupo[] {
  return base.grupos
    .filter((g) => !g.esTaller)
    .map((grupo) => {
      const suyos = pedidos.filter((p) => p.proveedorId === grupo.proveedorId);
      // Una segunda tanda al mismo proveedor nace de un paso 2 nuevo: lo ya pedido de una versión anterior no impide enviarla; un pendiente sí (se rectifica primero).
      const vigente = suyos.find((p) => p.estado === "pendiente") ?? suyos.find((p) => p.estado === "pedido" && p.version === base.version) ?? null;
      const anterior = suyos.find((p) => p.estado === "pedido" && p.version !== base.version) ?? null;
      const rectificado = suyos.find((p) => p.estado === "rectificado") ?? null;
      return { grupo, vigente, anterior, rectificado, bloqueo: vigente ? null : bloqueoDelGrupo(grupo) };
    });
}

/** Los que se pueden enviar ahora: sin pedido vigente y sin bloqueo. */
export const porEnviar = (estados: readonly EstadoDelGrupo[]): EstadoDelGrupo[] => estados.filter((e) => e.vigente === null && e.bloqueo === null);

/** El Taller no se envía a Compras: es una orden de producción. */
export const delTaller = (base: BaseDeEnvio): GrupoDeEnvio | null => base.grupos.find((g) => g.esTaller) ?? null;

/**
 * Lo que NO se envía todavía y por qué, en las palabras de quien compra. Una línea por cosa; vacío = se envía todo lo que el paso 2 nombró.
 */
export function queNoSeEnvia(base: BaseDeEnvio): string[] {
  const n = (x: number) => x.toLocaleString("es-PE");
  const lineas: string[] = [];
  if (base.sinMarca > 0) lineas.push(`Sin marca: ${n(base.sinMarca)} ${base.sinMarca === 1 ? "prenda" : "prendas"}. Elige la marca de ese modelo en Catálogo ▸ Marcas y las mandas luego.`);
  if (base.sinProveedor > 0) lineas.push(`Sin proveedor: ${n(base.sinProveedor)} ${base.sinProveedor === 1 ? "prenda" : "prendas"}. Elige su proveedor en la ficha del producto y las mandas luego.`);
  const taller = delTaller(base);
  if (taller) lineas.push(`Del Taller: ${n(taller.unidades)} ${taller.unidades === 1 ? "prenda" : "prendas"}. Es una orden de producción: se pide en Producción ▸ Órdenes, no en Compras.`);
  if (base.modelosNuevos > 0) lineas.push(`Modelos nuevos por elegir: ${n(base.modelosNuevos)} ${base.modelosNuevos === 1 ? "prenda" : "prendas"}. No hay un producto que pedir; cuando elijas el modelo con su proveedor, lo mandas.`);
  return lineas;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lo que se manda a la base
// ---------------------------------------------------------------------------------------------------------------------

/** Los argumentos de `enviar_plan_compra_a_compras`: la versión del paso 2 que la persona VIO y, por proveedor, cuándo piensa pedirlo. */
export function argsEnviar(planId: string, categoriaId: string, version: number, envios: readonly { proveedorId: string; elegido: Elegido }[]) {
  return {
    p_plan_id: planId,
    p_categoria_id: categoriaId,
    p_paso_2_version: version,
    p_envios: envios.map((e) => ({ proveedor_id: e.proveedorId, cuando: e.elegido.cuando, fecha: e.elegido.cuando === "fecha" ? e.elegido.fecha : null })),
  };
}

/** Las razones para rectificar (spike ⑦). La razón queda escrita con quién y cuándo. */
export const MOTIVOS_DE_RECTIFICACION = ["Cambié de idea", "El plan cambió", "Me falta elegir el proveedor", "Otro"] as const;
export type MotivoDeRectificacion = (typeof MOTIVOS_DE_RECTIFICACION)[number];

export const argsRectificar = (pedidoId: string, motivo: MotivoDeRectificacion) => ({ p_pedido_id: pedidoId, p_motivo: motivo });

// ---------------------------------------------------------------------------------------------------------------------
// Lo que dice la lista del Plan
// ---------------------------------------------------------------------------------------------------------------------

/**
 * ¿El paso 2 guardado ya no es lo que se compra? «Comprar» del Plan es lo que FALTA pedir: baja con cada orden de compra. Un paso 2 se guardó con el total que faltaba entonces; si lo que falta hoy, más lo que ya
 * se confirmó desde entonces, no suma ese total, el plan cambió (se tocaron los escenarios, entró otra orden a mano) y conviene revisarlo. Confirmar un pedido de campaña NO lo cambia: esa baja la explica `confirmadas`.
 */
export const paso2PorRevisar = (totalGuardado: number, comprarHoy: number, confirmadas: number): boolean => totalGuardado !== comprarHoy + confirmadas;

/** El resumen de una categoría, si lo hay y tiene algo que decir (algo pendiente o ya pedido). Los rectificados son historia: no ocupan la fila. */
export function resumenParaLaFila(resumenes: readonly ResumenDeEnvio[] | null | undefined, categoriaId: string): ResumenDeEnvio | null {
  const r = resumenes?.find((x) => x.categoriaId === categoriaId);
  return r && (r.pendientes > 0 || r.pedidos > 0) ? r : null;
}

/** Las frases de la fila: «2 pendientes en Compras», «1 pedido». Vacío = nada que decir. */
export function frasesDeEnCompras(r: ResumenDeEnvio): { pendientes: string | null; pedidos: string | null; cambio: string | null } {
  return {
    pendientes: r.pendientes > 0 ? `${r.pendientes} ${r.pendientes === 1 ? "pendiente" : "pendientes"} en Compras` : null,
    pedidos: r.pedidos > 0 ? `${r.pedidos} ${r.pedidos === 1 ? "pedido" : "pedidos"}` : null,
    cambio: r.desactualizado ? "El plan cambió después de enviar" : null,
  };
}
