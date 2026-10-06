import { cache } from "react";
import { getTrasladosDeLaSede, type TrasladoDetalle, type TrasladoResumen } from "@/lib/traslados";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getPedidosPorAtender } from "@/lib/pedidos-entre-sedes";
import { contarTePiden } from "@/lib/pedidos-por-atender-reglas";
import {
  anilloDelDia,
  buscableDelPase,
  codigoDeSede,
  hechasHoy,
  pasesPorPestana,
  vistaDelPase,
  type Anillo,
  type DatosPase,
  type PestanaPase,
  type VistaPase,
} from "@/lib/traslados-pases-reglas";
import type { ContextoTraslados, TrasladoBuscable } from "@/lib/traslados-reglas";

// La billetera de Traslados (ADR-0354): todo lo que la columna izquierda necesita, armado en el servidor con un solo «ahora».
// `cache()`: el layout (la billetera) y la página (el pase grande) la piden en el mismo request y se lee una sola vez.

/** Cuántas terminadas se muestran (las más recientes). La lista de antes usaba el mismo tope. */
export const LIMITE_TERMINADAS = 30;

/** Un pase de la billetera: lo que dibuja más lo que el buscador mira. */
export type PaseDeBilletera = VistaPase & { buscable: TrasladoBuscable };

export type Billetera = {
  pases: Record<PestanaPase, PaseDeBilletera[]>;
  /** Lo que le toca a quien mira en cada pestaña: el contador ámbar (suma lo mismo que el anillo y el menú). */
  porHacer: Record<PestanaPase, number>;
  anillo: Anillo;
  /** Traslados sin prendas (cabeceras vacías de la limpieza de datos): solo se le avisa a quien puede ajustar inventario. */
  vacios: number;
  terminadasAcotadas: boolean;
  ahoraIso: string;
};

export type CodigosDeSede = (u: { id: string; nombre: string }) => string;

/** Cómo se escribe cada sede en el pase (TRU, LIM, AQP; el Taller entero), con el tipo de la tabla de ubicaciones. */
export async function getCodigosDeSede(): Promise<CodigosDeSede> {
  let tipos = new Map<string, string>();
  try {
    tipos = new Map((await getUbicaciones()).map((u) => [u.id, u.tipo] as const));
  } catch (e) {
    console.error("Traslados: tipos de sede:", e);
  }
  return (u) => codigoDeSede({ nombre: u.nombre, tipo: tipos.get(u.id) ?? null });
}

export function datosDeResumen(t: TrasladoResumen): DatosPase {
  return {
    id: t.id,
    numero: t.numero,
    ubicacionOrigenId: t.ubicacionOrigenId,
    ubicacionOrigenNombre: t.ubicacionOrigenNombre,
    ubicacionDestinoId: t.ubicacionDestinoId,
    ubicacionDestinoNombre: t.ubicacionDestinoNombre,
    estado: t.estado,
    fechaEstimadaLlegada: t.fechaEstimadaLlegada,
    creadoEn: t.creadoEn,
    confirmadoEn: t.confirmadoEn,
    cerradoEn: t.cerradoEn,
    anuladoEn: t.anuladoEn,
    nota: t.nota,
    unidadesEnviadas: t.unidadesEnviadas,
    unidadesRecibidas: t.unidadesRecibidas,
    lineas: t.lineas,
    lineasContadas: t.lineasContadas,
    cerradoConDiferencia: t.cerradoConDiferencia,
    creadoPorNombre: t.creadoPorNombre,
    fotos: t.fotos,
    colores: t.colores,
    referencias: t.referencias,
    skus: t.skus,
  };
}

/** El mismo pase, armado desde el detalle (para abrir uno que no está en la billetera: viejo, o entre otras sedes). */
export function datosDeDetalle(t: TrasladoDetalle): DatosPase {
  const enviadas = t.lineas.filter((l) => l.cantidadEnviada !== null);
  const contadas = t.lineas.filter((l) => l.cantidadRecibida !== null);
  const fotos = Array.from(new Map(t.lineas.filter((l) => l.fotoUrl).map((l) => [l.fotoUrl!, { url: l.fotoUrl!, referencia: l.referencia }])).values()).slice(0, 3);
  return {
    id: t.id,
    numero: t.numero,
    ubicacionOrigenId: t.ubicacionOrigenId,
    ubicacionOrigenNombre: t.ubicacionOrigenNombre,
    ubicacionDestinoId: t.ubicacionDestinoId,
    ubicacionDestinoNombre: t.ubicacionDestinoNombre,
    estado: t.estado,
    fechaEstimadaLlegada: t.fechaEstimadaLlegada,
    creadoEn: t.creadoEn,
    confirmadoEn: t.confirmadoEn,
    cerradoEn: t.cerradoEn,
    anuladoEn: t.anuladoEn,
    nota: t.nota,
    unidadesEnviadas: enviadas.reduce((a, l) => a + (l.cantidadEnviada ?? 0), 0),
    unidadesRecibidas: contadas.reduce((a, l) => a + (l.cantidadRecibida ?? 0), 0),
    lineas: enviadas.length,
    lineasContadas: contadas.filter((l) => l.cantidadEnviada !== null).length,
    cerradoConDiferencia: t.estado === "cerrada" && t.lineas.some((l) => l.cantidadRecibida !== null && l.cantidadRecibida !== (l.cantidadEnviada ?? 0)),
    creadoPorNombre: t.creadoPorNombre === "—" ? null : t.creadoPorNombre,
    fotos,
    colores: Array.from(new Set(t.lineas.map((l) => l.colorHex).filter((c): c is string => !!c))).slice(0, 3),
    referencias: Array.from(new Set(t.lineas.map((l) => l.referencia))),
    skus: Array.from(new Set(t.lineas.map((l) => l.sku))),
  };
}

export function vistaConCodigos(t: DatosPase, ctx: ContextoTraslados, codigo: CodigosDeSede): VistaPase {
  return vistaDelPase(t, ctx, {
    origen: codigo({ id: t.ubicacionOrigenId, nombre: t.ubicacionOrigenNombre }),
    destino: codigo({ id: t.ubicacionDestinoId, nombre: t.ubicacionDestinoNombre }),
  });
}

export const getBilleteraDeLaSede = cache(async (ubicacionId: string, puedeCerrarDiferencia: boolean): Promise<Billetera> => {
  const ahoraIso = new Date().toISOString();
  const ctx: ContextoTraslados = { miUbicacionId: ubicacionId, puedeCerrarDiferencia, ahoraIso };
  const [{ enCurso, cerrados, vacios, cerradosLeidos }, pedidos, codigo] = await Promise.all([
    getTrasladosDeLaSede(ubicacionId, LIMITE_TERMINADAS),
    getPedidosPorAtender(ubicacionId),
    getCodigosDeSede(),
  ]);
  // Las dos lecturas son dos fotos de la base: un traslado que se cerró entre ellas sale en ambas. Gana la más nueva (cerrados).
  const porId = new Map<string, TrasladoResumen>();
  for (const t of [...enCurso, ...cerrados]) porId.set(t.id, t);
  const datos = Array.from(porId.values()).map(datosDeResumen);
  const enPestanas = pasesPorPestana(datos, ctx);
  const aPase = (t: DatosPase): PaseDeBilletera => {
    const vista = vistaConCodigos(t, ctx, codigo);
    return { ...vista, buscable: buscableDelPase(t, { origen: vista.codigoOrigen, destino: vista.codigoDestino }) };
  };
  const pases = { llegan: enPestanas.llegan.map(aPase), envias: enPestanas.envias.map(aPase), terminadas: enPestanas.terminadas.map(aPase) };
  const porRecibir = pases.llegan.filter((p) => p.porHacer).length;
  const tePiden = pedidos ? contarTePiden(pedidos) : 0;
  return {
    pases,
    porHacer: { llegan: porRecibir, envias: tePiden, terminadas: 0 },
    anillo: anilloDelDia({ porRecibir, tePiden, hechas: hechasHoy(datos, ctx) }),
    vacios,
    terminadasAcotadas: cerradosLeidos >= LIMITE_TERMINADAS,
    ahoraIso,
  };
});
