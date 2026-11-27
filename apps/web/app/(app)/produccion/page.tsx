import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { ProduccionSoloLider } from "@/components/ProduccionSoloLider";
import { getTaller, getOrdenesProduccion, getModelosProducibles } from "@/lib/produccion";
import { getInsumosDelTaller } from "@/lib/insumos";
import { nombreDeInsumoParaLeer } from "@/lib/insumos-vista";
import { getLineasPorRecibir } from "@/lib/recibir-produccion";
import { getComprobantesProduccion } from "@/lib/comprobantes-produccion";
import { getDecisionProduccion } from "@/lib/decision-produccion";
import { getCatalogo } from "@/lib/catalogo-v2";
import { opcional } from "@/lib/resultado";
import { coloresDeModelos, presentacionesDeModelos } from "@/lib/produccion-presentacion";
import { hojaDelModelo, materialesDelModelo, ordenesDelModelo, prendasPorFabricar } from "@/lib/produccion-hoja-modelo";
import { getFichasDeModelos } from "@/lib/produccion-ficha-modelo";
import { hoyLima } from "@/lib/fechas-lima";
import { pagosDelTaller, resumenDeDecisiones, demandaDelTaller, filasDeTela, filasPorModelo, type InsumoParaDecidir, type OrdenParaDecidir } from "@/lib/produccion-decisiones";
import { getTelaDelTaller } from "@/lib/tela-del-taller";
import { getListaDeOrdenes } from "@/lib/ordenes-lista";
import { ResumenProduccionPanel } from "@/components/ResumenProduccionPanel";
import { notaDeHistoria } from "@/lib/produccion-cifras-textos";

// `/produccion` es el módulo padre (ADR-0133) y, desde F6, su Resumen: «¿qué necesita mi decisión hoy?». Solo líder (ventas de la red y dinero) y, como el resto
// de Producción, solo parado en el Taller. Quien trabaja en el Taller va directo a Órdenes. Todo se calcula acá, en el servidor, con reglas puras
// (`lib/produccion-decisiones.ts`).
export default async function ProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} puedeCambiarUbicacion={persona.puedeCambiarUbicacion} />;
  }
  if (persona.rol !== "lider") return <ProduccionSoloLider titulo="Resumen" />;

  const taller = await getTaller();
  if (!taller) redirect("/produccion/ordenes");

  const hoy = hoyLima();
  const [ordenes, modelos, datosInsumos, lineas, comprobantes, catalogo, telaDelTaller, dondeEstan] = await Promise.all([
    // Sin costos: el Resumen ya no muestra dinero de las órdenes ni de los insumos (las cifras de arriba salieron el 2026-11-26); lo que se debe a proveedores sale de los comprobantes.
    getOrdenesProduccion(taller.id, { conCostos: false, limite: 400 }),
    getModelosProducibles({ soloProducibles: true }),
    getInsumosDelTaller(taller.id, { conCostos: false, hoy }),
    getLineasPorRecibir(taller.id),
    getComprobantesProduccion(),
    // Las fotos son un dato SECUNDARIO (la misma copia cacheada de Catálogo, ADR-0168): si no se leen, cada modelo se dibuja con el ícono de su categoría
    // sobre su color y todo lo demás sigue en pie.
    opcional(getCatalogo(), "las fotos de los modelos"),
    // Lo que las órdenes abiertas ya reservan de cada tela y lo pedido (ADR-0400, actividad 8d): dato de apoyo; si no se lee, «¿Alcanza la tela?» cuenta con el rendimiento medido de siempre.
    getTelaDelTaller(taller.id),
    // Dónde está cada orden (la misma lectura de la lista de Órdenes): si no se lee, el recuadro de órdenes lo dice y manda a Órdenes.
    getListaDeOrdenes(taller.id, hoy),
  ]);
  const presentaciones = presentacionesDeModelos(catalogo ?? []);
  // Las fichas (marca, proveedor, material, patrón) son datos SECUNDARIOS, como las fotos: si no se leen, la hoja «Ver el modelo» lo dice y lo demás sigue en pie.
  const [decision, fichasDeModelos] = await Promise.all([
    getDecisionProduccion({ modelos, ordenes, insumos: datosInsumos.insumos, consumosPorOrden: datosInsumos.consumosPorOrden, lineasPorRecibir: lineas, conSedes: true }),
    opcional(getFichasDeModelos(modelos.map((m) => m.productoId)), "la ficha de los modelos"),
  ]);

  // El número de cada orden («OP-000031») lo trae la lista de Órdenes: con él, un asunto de «Por resolver» dice de qué orden habla. Sin la lista, nombra solo el modelo.
  const numeroDeOrden = new Map((dondeEstan.lista?.filas ?? []).map((f) => [f.id, f.numeroTexto]));
  const ordenesParaDecidir: OrdenParaDecidir[] = ordenes.map((o) => ({
    id: o.id,
    numeroTexto: numeroDeOrden.get(o.id),
    referencia: o.referencia,
    productoId: o.productoId,
    estado: o.estado,
    esMuestra: o.esMuestra,
    fechaEntrega: o.fechaEntrega,
    cantidadPlan: o.cantidadPlan,
    etapas: o.etapas,
  }));
  const insumos: InsumoParaDecidir[] = datosInsumos.insumos.map((i) => ({ id: i.id, nombre: nombreDeInsumoParaLeer(i), unidad: i.unidad, tipo: i.tipo, saldo: i.saldo, minimo: i.minimo, tono: i.estado.tono }));
  const llegadas = lineas.filter((l) => l.pendiente > 0).map((l) => ({ insumoId: l.insumoId, documento: `${l.serie}-${l.numero}`, proveedor: l.proveedor, pendiente: l.pendiente }));
  const consumoNeto: Record<string, Record<string, number>> = {};
  for (const [ordenId, cs] of Object.entries(datosInsumos.consumosPorOrden)) {
    for (const c of cs) (consumoNeto[ordenId] ??= {})[c.insumoId] = (consumoNeto[ordenId][c.insumoId] ?? 0) + c.cantidad;
  }

  const datos = decision.datos;
  // UNA cuenta de lo que piden las órdenes abiertas: la tela que declararon (la misma de «Nueva orden» y de la página de la orden) y, donde no declaran ninguna, el rendimiento medido de su modelo.
  const demandaInsumos = demandaDelTaller(telaDelTaller, ordenesParaDecidir, datos?.rendimientoPorModelo ?? {}, consumoNeto);
  // Lo que viene en camino a cada tela y avío (regla de Felipe, 2026-10-16): lo que FALTA RECIBIR de los pedidos, sin los atrasados, que se cuenta como tela que llega.
  const enCaminoPorInsumo = new Map((telaDelTaller?.telas ?? []).map((t) => [t.insumoId, { cuenta: t.enCamino, atrasado: t.atrasado, pedidos: t.pedidos }]));
  const filasModelo = datos
    ? filasPorModelo(datos.demanda, modelos.map((m) => ({ productoId: m.productoId, referencia: m.referencia, variantesIds: m.variantes.map((v) => v.varianteId), variantes: m.variantes.map((v) => ({ varianteId: v.varianteId, talla: v.talla, color: v.color, colorHex: v.colorHex })) })), datos.enProduccion)
    : [];

  // La hoja «Ver el modelo» de cada fila: se arma aquí con lo que la página ya leyó (más la ficha del catálogo, que se lee aparte) y viaja al navegador con la página.
  // La ficha de cada color viaja UNA vez, con el panel (no dentro de cada hoja: repetiría el vocabulario ~2 KB por modelo).
  const coloresPorModelo = coloresDeModelos(catalogo ?? []);
  const modeloPorId = new Map(modelos.map((m) => [m.productoId, m]));
  const saldosDeInsumos = new Map((datos?.insumos ?? []).map((i) => [i.insumoId, { insumoId: i.insumoId, saldo: i.saldo, porLlegar: i.porLlegar }]));
  const hojas = Object.fromEntries(
    filasModelo.map((f) => [
      f.productoId,
      hojaDelModelo(f, coloresPorModelo[f.productoId] ?? [], taller.id, {
        ficha: fichasDeModelos?.[f.productoId] ?? null,
        precios: modeloPorId.get(f.productoId)?.variantes.map((v) => v.precio) ?? [],
        sedes: datos?.sedes ?? [],
        ordenes: ordenesDelModelo(ordenes, f.productoId, hoy),
        materiales: materialesDelModelo(datos?.rendimientoPorModelo[f.productoId] ?? [], prendasPorFabricar(f), saldosDeInsumos),
      }),
    ]),
  );

  // Los modelos por producir tienen su propia lista («Qué fabricar primero»): «Por resolver» queda para lo demás (entregas, tela, pagos, prendas por llevar a tienda, lo que hay de sobra).
  // Dónde está cada orden, con las palabras de la lista de Órdenes: el asunto «Una orden está atrasada» dice lo mismo que esa pantalla.
  const faseDeLaOrden = Object.fromEntries((dondeEstan.lista?.filas ?? []).filter((f) => f.estado === "en_proceso").map((f) => [f.id, f.donde.fase]));
  const resumen = resumenDeDecisiones({ hoy, ordenes: ordenesParaDecidir, insumos, llegadas, demanda: demandaInsumos, comprobantes, modelos: filasModelo, tallerId: taller.id, enCamino: enCaminoPorInsumo, producirAparte: true, faseDeLaOrden });
  const telas = filasDeTela(insumos, demandaInsumos, llegadas, enCaminoPorInsumo);

  return (
    <div className="space-y-6">
      <ResumenProduccionPanel sede={persona.ubicacionEtiqueta} presentaciones={presentaciones} decisiones={resumen.decisiones} ocultas={resumen.ocultas} totalAsuntos={resumen.total} modelos={filasModelo} hojas={hojas} telas={telas} ordenesEnCurso={dondeEstan.lista?.filas ?? null} pagos={pagosDelTaller(comprobantes, hoy)} falloRed={decision.fallo} notaDeHistoria={notaDeHistoria(hoy)} />
    </div>
  );
}
