import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller, getOrdenesProduccion, getModelosProducibles, getVocabularioModeloNuevo } from "@/lib/produccion";
import { OrdenesTablero } from "@/components/OrdenesTablero";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { hoyLima } from "@/lib/fechas-lima";
import { getInsumosDelTaller } from "@/lib/insumos";
import { getDecisionProduccion } from "@/lib/decision-produccion";
import { getLineasPorRecibir } from "@/lib/recibir-produccion";
import { Factory } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { tipoDeParametro } from "@/lib/modelo-nuevo-orden-reglas";

// Órdenes de producción del Taller (restaurada 2026-09-15 sobre V2). Una sola
// forma de producir: la orden. Se abre con costo estimado y cantidades por
// talla-color, avanza por etapas y al cerrar confirma cuántas salieron buenas y
// el costo real, que entra al stock del Taller (`cerrar_produccion` →
// `movimientos`). Ver supabase/migrations/20260915130000_produccion_del_taller.sql.
//
// Vive en `/produccion/ordenes` desde ADR-0133 (F1): `/produccion` pasó a ser el
// módulo padre y hoy redirige acá. Quién entra (`puedeVerProduccion`, decisión
// de Felipe 2026-09-20, vuelve a la regla del 2026-09-17): solo parado en el
// Taller, líder incluido. Un líder que llega desde otra ubicación ve un aviso
// que le dice qué cambiar; el resto vuelve al inicio. Es visibilidad: el
// candado real sigue siendo el de cada RPC.
//
// `?nueva=<modelo>&tipo=muestra|produccion` abre «Nueva orden» con ese modelo y ese tipo ya elegidos: es por donde vuelve la persona
// que creó un modelo nuevo desde la propia orden (ADR-0361, `lib/modelo-nuevo-orden-reglas.ts`).
export default async function OrdenesProduccionPage({ searchParams }: { searchParams: Promise<{ orden?: string; nueva?: string; tipo?: string }> }) {
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
        <h1 className="font-display text-2xl text-tinta">Producción</h1>
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
  const [ordenes, modelos, datosInsumos, vocabulario] = await Promise.all([
    getOrdenesProduccion(taller.id, { conCostos: esLider }),
    getModelosProducibles(),
    getInsumosDelTaller(taller.id, { conCostos: esLider, hoy }),
    // Dato secundario (tallas y colores de «Modelo nuevo»): si falla, la orden de siempre se abre igual.
    getVocabularioModeloNuevo(),
  ]);

  // F5: solo el líder recibe el consejo de la red (ventas y stock de todas las tiendas, costos de insumos). Es secundario: si falla, la orden se abre igual.
  const decision = esLider
    ? await getDecisionProduccion({ modelos, ordenes, insumos: datosInsumos.insumos, consumosPorOrden: datosInsumos.consumosPorOrden, lineasPorRecibir: await getLineasPorRecibir(taller.id) })
    : null;

  return (
    <div className="space-y-6">
      <OrdenesTablero tallerId={taller.id} ordenes={ordenes} modelos={modelos} esLider={esLider} hoy={hoy} insumos={datosInsumos.insumos} consumosPorOrden={datosInsumos.consumosPorOrden} decision={decision} ordenInicialId={sp.orden ?? null} nuevaInicial={sp.nueva ?? null} tipoInicial={tipoDeParametro(sp.tipo)} puedeEditarCatalogo={puedeEditarCatalogo} vocabulario={vocabulario} />
    </div>
  );
}
