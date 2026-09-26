import { Suspense } from "react";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getCajaAbierta } from "@/lib/caja";
import { getDisponibleEnSede, leerStockDeLasSedes } from "@/lib/inventario-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { agruparStockPorSede } from "@/lib/stock-por-sede";
import { getApartadosDeTienda } from "@/lib/separaciones";
import { hoyLima } from "@/lib/fechas-lima";
import { createClient } from "@/lib/supabase/server";
import { ApartadosPanel } from "@/components/apartados/ApartadosPanel";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import { leerPrendasDeUrl } from "@/lib/apartar-desde-ticket";

/**
 * Apartados (ADR-0166): la clienta aparta prendas con un adelanto, las recoge pagando el saldo, o vencen y se le
 * devuelve el adelanto. Vive en Ventas junto al Punto de venta y usa su misma forma (hoja, panel de cobro, modales).
 * Solo tiendas: el adelanto entra a una caja y la prenda se guarda en el piso de una tienda.
 */
export default async function ApartadosPage({ searchParams }: { searchParams: Promise<{ prendas?: string }> }) {
  // «Apartar» desde el ticket del Punto de venta: las prendas ya elegidas llegan en la dirección (`lib/apartar-desde-ticket.ts`).
  const { prendas } = await searchParams;
  return (
    <Suspense fallback={null}>
      <Apartados desdeTicket={prendas ?? null} />
    </Suspense>
  );
}

async function Apartados({ desdeTicket }: { desdeTicket: string | null }) {
  const persona = await requirePersonaActualV2();
  if (persona.ubicacionTipo !== "tienda") {
    return (
      <p className="card-cayla mx-auto mt-10 max-w-md px-6 py-8 text-center text-sm text-tinta/70">
        Los apartados se hacen en una tienda. Cambia a una tienda desde el selector de arriba.
      </p>
    );
  }

  const supabase = await createClient();
  const [datos, variantes, caja, stockAqui, resCampanas, resStockSedes, ubicaciones] = await Promise.all([
    getApartadosDeTienda(persona.ubicacionId),
    getCatalogo(),
    getCajaAbierta(persona.ubicacionId),
    getDisponibleEnSede(persona.ubicacionId),
    supabase.rpc("campanas_vigentes"),
    // «¿Dónde más hay?» para lo que aquí no tiene disponible (misma lectura que el Punto de venta). Es secundario:
    // si falla, el buscador sigue funcionando sin esa línea.
    leerStockDeLasSedes(),
    getUbicaciones(),
  ]);

  if (!datos.instalado) {
    return (
      <div className="card-cayla mx-auto mt-10 max-w-lg px-6 py-8 text-center">
        <p className="font-display text-2xl text-tinta">Apartados todavía no está activado</p>
        <p className="mt-2 text-sm text-tinta/70">
          Falta aplicar su migración en esta base de datos (ADR-0166). Mientras tanto no se puede apartar desde aquí.
        </p>
      </div>
    );
  }

  // Lo que se puede apartar es lo DISPONIBLE en el piso (ADR-0141): lo ya apartado para otra clienta no se ofrece.
  const piso = new Map([...stockAqui].map(([id, c]) => [id, c.pisoDisponible ?? c.disponible]));
  const almacen = new Map([...stockAqui].map(([id, c]) => [id, c.almacenDisponible ?? 0]));
  const otrasSedes = resStockSedes.error ? new Map() : agruparStockPorSede(resStockSedes.data ?? [], ubicaciones, persona.ubicacionId);
  const campana = new Map((resCampanas.data ?? []).map((c) => [c.variante_id, { etiquetaId: c.etiqueta_id, nombre: c.etiqueta_nombre, pct: Number(c.descuento_pct) }]));
  const prendas: PrendaApartable[] = variantes
    .filter((v) => v.activo)
    .map((v) => ({
      varianteId: v.varianteId,
      sku: v.sku,
      codigo: v.codigo,
      referencia: v.referencia,
      talla: v.talla,
      color: v.color,
      categoria: v.categoria,
      marca: v.marca,
      precio: v.precio,
      campana: campana.get(v.varianteId) ?? null,
      fotoUrl: v.fotoUrl,
      codigosBarras: v.codigosBarras,
      stockAqui: piso.get(v.varianteId) ?? 0,
      almacenAqui: almacen.get(v.varianteId) ?? 0,
      stockOtrasSedes: otrasSedes.get(v.varianteId)?.otrasSedes ?? [],
    }));

  return (
    <ApartadosPanel
      ubicacionId={persona.ubicacionId}
      ubicacionEtiqueta={persona.ubicacionEtiqueta}
      hoy={hoyLima()}
      cajaAbierta={caja !== null}
      puedeGestionar={puede(persona, "gestionarCaja")}
      prendas={prendas}
      apartados={datos.apartados}
      resumen={datos.resumen}
      liberadosAhora={datos.liberadosAhora}
      hayMas={datos.hayMas}
      avisos={datos.avisos}
      lineasDesdeTicket={leerPrendasDeUrl(desdeTicket)}
    />
  );
}
