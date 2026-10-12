import { cache } from "react";
import { getTrasladosDeLaSede, type TrasladoDetalle, type TrasladoResumen } from "@/lib/traslados";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getParaEnviar, getPedidosConCliente, getPedidosEntreSedes, getPedidosPorAtender } from "@/lib/pedidos-entre-sedes";
import { contarTePiden } from "@/lib/pedidos-por-atender-reglas";
import { juntarPedidos } from "@/lib/pedidos-con-cliente-reglas";
import { agruparPorDestino, type GrupoParaEnviar } from "@/lib/para-enviar-reglas";
import type { PedidoEntreSedes } from "@/lib/pedidos-entre-sedes-reglas";
import { buscableDelPedido, buscableParaEnviar, pestanaDelPedido, vistaDelPedido, vistaParaEnviar } from "@/lib/traslados-pedidos-pases-reglas";
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

// La billetera de Traslados (ADR-0355): todo lo que la columna izquierda necesita, armado en el servidor con un solo «ahora».
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

export type CodigosDeSede = ((u: { id: string; nombre: string }) => string) & { nombreDe: (id: string) => string };

/** Cómo se escribe cada sede en el pase (TRU, LIM, AQP; el Taller entero), con el tipo de la tabla de ubicaciones; y su nombre. */
export async function getCodigosDeSede(): Promise<CodigosDeSede> {
  let sedes = new Map<string, { nombre: string; tipo: string }>();
  try {
    sedes = new Map((await getUbicaciones()).map((u) => [u.id, { nombre: u.nombre, tipo: u.tipo }] as const));
  } catch (e) {
    console.error("Traslados: tipos de sede:", e);
  }
  const codigo = (u: { id: string; nombre: string }) => codigoDeSede({ nombre: u.nombre, tipo: sedes.get(u.id)?.tipo ?? null });
  return Object.assign(codigo, { nombreDe: (id: string) => sedes.get(id)?.nombre ?? "Tu sede" });
}

/** Lo que la sede manda o pidió fuera de las cajas: los pedidos entre sedes (reposición y para un cliente) y lo que subió para
 *  enviar. `cache()`: la billetera y el pase abierto lo piden en el mismo request. Cada lectura falla sola (devuelve vacío). */
export const getEnviosDeLaSede = cache(async (ubicacionId: string): Promise<{ pedidos: PedidoEntreSedes[]; paraEnviar: GrupoParaEnviar[] }> => {
  const [reposicion, conCliente, paraEnviar] = await Promise.all([
    getPedidosEntreSedes(ubicacionId),
    getPedidosConCliente(ubicacionId),
    getParaEnviar(ubicacionId),
  ]);
  return { pedidos: juntarPedidos(reposicion, conCliente), paraEnviar: agruparPorDestino(paraEnviar) };
});

/** Los códigos que un pase de pedido necesita: el de esta sede, el de la otra y el nombre de esta. */
export function codigosParaPedido(codigo: CodigosDeSede, miUbicacionId: string, otra: { id: string; nombre: string }) {
  const miNombre = codigo.nombreDe(miUbicacionId);
  return { mio: codigo({ id: miUbicacionId, nombre: miNombre }), otra: codigo(otra), miNombre };
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
  const [{ enCurso, cerrados, vacios, cerradosLeidos }, pedidos, codigo, envios] = await Promise.all([
    getTrasladosDeLaSede(ubicacionId, LIMITE_TERMINADAS),
    getPedidosPorAtender(ubicacionId),
    getCodigosDeSede(),
    getEnviosDeLaSede(ubicacionId),
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
  const cajas = { llegan: enPestanas.llegan.map(aPase), envias: enPestanas.envias.map(aPase), terminadas: enPestanas.terminadas.map(aPase) };

  // Los pedidos y «Para enviar» como pases (ADR-0355, actividad 4). Lo que te piden va primero en Envías (es lo que te toca,
  // lo que espera hace más arriba); lo que pediste, después de lo que te toca recibir.
  const deMiSede = (otra: { id: string; nombre: string }) => codigosParaPedido(codigo, ubicacionId, otra);
  const pedidosEn: Record<PestanaPase, PaseDeBilletera[]> = { llegan: [], envias: [], terminadas: [] };
  const porAntiguedad = [...envios.pedidos].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  for (const p of porAntiguedad) {
    const pestana = pestanaDelPedido(p, ahoraIso);
    if (!pestana) continue;
    const cods = deMiSede({ id: p.otraSedeId, nombre: p.otraSede });
    pedidosEn[pestana].push({ ...vistaDelPedido(p, { miUbicacionId: ubicacionId, ahoraIso }, cods), buscable: buscableDelPedido(p, cods) });
  }
  const paraEnviar = envios.paraEnviar.map((g) => {
    const cods = deMiSede({ id: g.destinoId, nombre: g.destino });
    return { ...vistaParaEnviar(g, { ahoraIso }, cods), buscable: buscableParaEnviar(g, cods) };
  });
  const primero = (xs: PaseDeBilletera[]) => xs.filter((x) => x.porHacer);
  const despues = (xs: PaseDeBilletera[]) => xs.filter((x) => !x.porHacer);
  const pases = {
    llegan: [...primero(cajas.llegan), ...pedidosEn.llegan, ...despues(cajas.llegan)],
    envias: [...pedidosEn.envias, ...paraEnviar, ...cajas.envias],
    terminadas: [...cajas.terminadas, ...pedidosEn.terminadas],
  };
  const porRecibir = cajas.llegan.filter((p) => p.porHacer).length;
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
