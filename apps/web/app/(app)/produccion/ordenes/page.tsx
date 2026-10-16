import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller, getOrdenesProduccion, getModelosProducibles, getVocabularioModeloNuevo, getOpcionesNuevaOrden } from "@/lib/produccion";
import { getListaDeOrdenes } from "@/lib/ordenes-lista";
import { OrdenesLista } from "@/components/ordenes-lista/OrdenesLista";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { hoyLima } from "@/lib/fechas-lima";
import { getInsumosDelTaller } from "@/lib/insumos";
import { getDecisionProduccion } from "@/lib/decision-produccion";
import { getLineasPorRecibir } from "@/lib/recibir-produccion";
import { Factory } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { tipoDeParametro } from "@/lib/modelo-nuevo-orden-reglas";
import { getPreciosDeLasTiendas } from "@/lib/precios-sede-datos";
import { conPreciosMasBajos, conPreciosMasBajosDeModelos } from "@/lib/produccion-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Órdenes de producción del Taller (restaurada 2026-09-15 sobre V2). Una sola
// forma de producir: la orden. Se abre con sus fases (quién hace cada una) y su tela, avanza fase por fase y al cerrar
// confirma cuántas salieron buenas y el costo real, que entra al stock del Taller (`cerrar_produccion` → `movimientos`).
// Ver supabase/migrations/20260915130000_produccion_del_taller.sql.
//
// Desde la actividad 5 de ADR-0400 (2026-10-15) la pantalla es una LISTA («A · Lista», elegida por Felipe): cada fila lleva a la página de su orden
// (`/produccion/ordenes/OP-000012`) y «Hoy en el Taller» cuenta por fase. Las filas salen de `fn_ordenes_produccion_lista` (lib/ordenes-lista.ts), que trae de cada
// orden lo mismo que su página; las órdenes con el formato de siempre (`getOrdenesProduccion`) siguen alimentando el cajón (`?orden=`, pasar al stock y anular hasta
// la actividad 6), «Nueva orden» y el consejo de la red.
//
// Vive en `/produccion/ordenes` desde ADR-0133 (F1): `/produccion` pasó a ser el
// módulo padre y hoy redirige acá. Quién entra (`puedeVerProduccion`, decisión
// de Felipe 2026-09-20, vuelve a la regla del 2026-09-17): solo parado en el
// Taller, líder incluido. Un líder que llega desde otra ubicación ve un aviso
// que le dice qué cambiar; el resto vuelve al inicio. Es visibilidad: el
// candado real sigue siendo el de cada RPC.
//
// `?nueva=<modelo>&tipo=muestra|produccion` abre «Nueva orden» con ese modelo y ese tipo ya elegidos: es por donde vuelve la persona
// que creó un modelo nuevo desde la propia orden (ADR-0361, `lib/modelo-nuevo-orden-reglas.ts`). `&sugerida=1` (solo lo manda el Resumen de Producción, «Abrir orden sugerida») además llena la
// matriz con la cantidad sugerida por la red; sin él, `?nueva=` abre la orden vacía, como siempre (también lo usan Análisis y Nuevo producto).
export default async function OrdenesProduccionPage({ searchParams }: { searchParams: Promise<{ orden?: string; nueva?: string; tipo?: string; sugerida?: string }> }) {
  const sp = await searchParams;
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }

  const taller = await getTaller();
  if (!taller) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Órdenes" />
        <div className="card-cayla">
          <Vacio icono={<Factory />} titulo="No hay un Taller activo">
            Producción necesita una ubicación de tipo Taller para saber dónde entra el stock. Pídele al líder que active el Taller.
          </Vacio>
        </div>
      </div>
    );
  }

  const esLider = persona.rol === "lider";
  // Quien edita el catálogo (el líder o un rol con Productos) puede crear el modelo que falta sin salir de la orden; el candado real
  // es `fn_puede_editar_catalogo()` en la base. Los demás ven a quién pedírselo.
  const puedeEditarCatalogo = puede(persona, "editarCatalogo");
  const hoy = hoyLima();
  const [ordenesBase, modelosBase, datosInsumos, vocabulario, preciosTiendas, opcionesNuevaOrden, listaDeOrdenes] = await Promise.all([
    getOrdenesProduccion(taller.id, { conCostos: esLider }),
    getModelosProducibles(),
    getInsumosDelTaller(taller.id, { conCostos: esLider, hoy }),
    // Dato secundario (tallas y colores de «Modelo nuevo»): si falla, la orden de siempre se abre igual.
    getVocabularioModeloNuevo(),
    // Solo el líder ve el margen, y el margen se mide con el precio MÁS BAJO de cualquier tienda (ADR-0370, Felipe 2026-10-11). Dato secundario: si no se lee
    // (nunca lanza), el margen se mide con el precio de la grilla, como antes.
    esLider ? getPreciosDeLasTiendas() : Promise.resolve(null),
    // Lo que «Nueva orden» ofrece elegir (ADR-0400): servicios con su lista de precios, consumo por modelo, tela comprometida. Secundario: sin esto la orden se abre igual.
    getOpcionesNuevaOrden(taller.id),
    // Las filas de la lista: si no se leen, la pantalla lo dice (nunca una lista vacía que parezca «no hay órdenes»).
    getListaDeOrdenes(taller.id, hoy),
  ]);
  // `?orden=<id>` (los enlaces del Resumen y de antes) abría el cajón de la orden. Desde ADR-0400 (actividad 6) una orden CON fases se sigue en su página: se va allá. El cajón queda solo
  // para las abiertas antes de las fases (las que la lista marca `legado`).
  const pedida = sp.orden ? listaDeOrdenes.lista?.filas.find((f) => f.id === sp.orden) : undefined;
  if (pedida && !pedida.legado) redirect(pedida.href);
  const ordenes = preciosTiendas ? conPreciosMasBajos(ordenesBase, preciosTiendas) : ordenesBase;
  const modelos = preciosTiendas ? conPreciosMasBajosDeModelos(modelosBase, preciosTiendas) : modelosBase;

  // F5: solo el líder recibe el consejo de la red (ventas y stock de todas las tiendas, costos de insumos). Es secundario: si falla, la orden se abre igual.
  const decision = esLider
    ? await getDecisionProduccion({ modelos, ordenes, insumos: datosInsumos.insumos, consumosPorOrden: datosInsumos.consumosPorOrden, lineasPorRecibir: await getLineasPorRecibir(taller.id) })
    : null;

  return (
    <div className="space-y-6">
      <OrdenesLista tallerId={taller.id} tallerNombre={taller.nombre} lista={listaDeOrdenes.lista} falla={listaDeOrdenes.falla} ordenes={ordenes} modelos={modelos} esLider={esLider} hoy={hoy} insumos={datosInsumos.insumos} consumosPorOrden={datosInsumos.consumosPorOrden} decision={decision} ordenInicialId={sp.orden ?? null} nuevaInicial={sp.nueva ?? null} sugeridaInicial={sp.sugerida === "1"} tipoInicial={tipoDeParametro(sp.tipo)} puedeEditarCatalogo={puedeEditarCatalogo} vocabulario={vocabulario} opcionesNuevaOrden={opcionesNuevaOrden} />
    </div>
  );
}
