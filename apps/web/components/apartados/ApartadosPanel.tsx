"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import type { ResumenApartados } from "@/lib/separaciones";
import { PLAZO_DIAS, type Apartado } from "@/lib/separaciones-reglas";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { ApartarVista } from "@/components/apartados/ApartarVista";
import { EntregarModal, type EntregaHecha } from "@/components/apartados/EntregarModal";
import { TableroApartados } from "@/components/apartados/TableroApartados";
import { ApartadoEntregadoModal } from "@/components/apartados/ModalesApartado";

type Props = {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  cajaAbierta: boolean;
  /** Extender, liberar y registrar la devolución (D5): líder o terminal de ventas. */
  puedeGestionar: boolean;
  prendas: PrendaApartable[];
  apartados: Apartado[];
  resumen: ResumenApartados;
  liberadosAhora: number;
};

/**
 * Apartados con la guía oficial (rediseño 2026-09-22, ADR-0173 sobre ADR-0169; decidido por Felipe sobre la demo
 * `docs/maquetas/apartados-rediseno-2026-09/demo.html`): «tablero + flujo».
 *
 * - La portada es el TABLERO: cabecera oficial con «+ Nuevo apartado» como acción principal → franjas (caja cerrada,
 *   apartados que se liberaron solos) → 4 cifras → una tarjeta con filtros, buscador y la lista agrupada por urgencia
 *   → nota en hueso. Lo que pide acción hoy se ve antes de tocar nada.
 * - «+ Nuevo apartado» abre la hoja de APARTAR: la misma de antes (ticket → formulario), con su diseño y sus animaciones
 *   intactos, a pedido de Felipe.
 * - ENTREGAR sale de cada fila y abre un `<Modal>` (ADR-0136) con la misma hoja de cobro del saldo de antes.
 *
 * Antes eran tres pestañas (Apartar / Entregar / Todos): en una tienda sin movimiento dos de ellas abrían en un estado
 * vacío, y Entregar y Todos tenían cada una su buscador de clientas.
 */
export function ApartadosPanel(props: Props) {
  const [vista, setVista] = useState<"tablero" | "apartar">("tablero");
  const [entregar, setEntregar] = useState<Apartado | null>(null);
  const [entregado, setEntregado] = useState<EntregaHecha | null>(null);

  const franjaCaja = !props.cajaAbierta && (
    <div className="anim-sube flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-2xl border border-ambar/30 bg-ambar/[0.08] px-5 py-3.5">
      <div>
        <p className="font-display text-[17px] text-tinta">No hay caja abierta en {props.ubicacionEtiqueta}</p>
        <p className="mt-0.5 text-[12.5px] text-ambar">Para apartar o entregar, primero abre la caja. La lista se puede consultar igual.</p>
      </div>
      <Link href="/caja" className="btn-cayla btn-secundario">
        Ir a Caja
      </Link>
    </div>
  );

  if (vista === "apartar") {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setVista("tablero")} className="anim-sube inline-flex items-center gap-1.5 text-[13px] text-taupe transition-colors hover:text-tinta">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a Apartados
        </button>
        <CabeceraPantalla
          sobretitulo="Ventas · Apartados"
          titulo="Nuevo apartado"
          bajada={`Escanea las prendas, toma los datos de la clienta y cobra el adelanto. El precio queda congelado ${PLAZO_DIAS} días.`}
          acciones={
            <button type="button" onClick={() => setVista("tablero")} className="btn-cayla btn-secundario">
              Cancelar
            </button>
          }
        />
        {franjaCaja}
        {/* La hoja de siempre (Felipe, 2026-09-22: «mantener ese diseño y animación»): solo cambió dónde vive. */}
        <section className="anim-sube flex min-h-[calc(100vh-15rem)] flex-col overflow-hidden rounded-2xl border border-sand bg-papel">
          <ApartarVista ubicacionId={props.ubicacionId} ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} cajaAbierta={props.cajaAbierta} prendas={props.prendas} />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <CabeceraPantalla
        sobretitulo="Ventas"
        titulo={`Apartados · ${props.ubicacionEtiqueta}`}
        bajada={`La clienta deja un adelanto y la prenda la espera ${PLAZO_DIAS} días. Aquí se aparta, se entrega y se devuelve.`}
        acciones={
          <button
            type="button"
            onClick={() => setVista("apartar")}
            disabled={!props.cajaAbierta}
            title={props.cajaAbierta ? undefined : "Abre la caja para poder apartar"}
            className="btn-cayla btn-primario"
          >
            <Plus className="h-4 w-4" aria-hidden /> Nuevo apartado
          </button>
        }
      />

      {franjaCaja}
      {props.liberadosAhora > 0 && (
        <div className="anim-sube rounded-2xl border border-rojo/25 bg-rojo/[0.06] px-5 py-3.5">
          <p className="font-display text-[17px] text-tinta">
            {props.liberadosAhora === 1 ? "Un apartado venció hace más de 2 días y se liberó solo" : `${props.liberadosAhora} apartados vencieron hace más de 2 días y se liberaron solos`}
          </p>
          <p className="mt-0.5 text-[12.5px] text-rojo-profundo">La prenda volvió al stock y falta devolver el adelanto: está en «Hoy, sin falta».</p>
        </div>
      )}

      <TableroApartados
        ubicacionId={props.ubicacionId}
        ubicacionEtiqueta={props.ubicacionEtiqueta}
        hoy={props.hoy}
        puedeGestionar={props.puedeGestionar}
        cajaAbierta={props.cajaAbierta}
        apartados={props.apartados}
        resumen={props.resumen}
        prendas={props.prendas}
        onEntregar={setEntregar}
      />

      {entregar && (
        <EntregarModal
          apartado={entregar}
          ubicacionId={props.ubicacionId}
          ubicacionEtiqueta={props.ubicacionEtiqueta}
          hoy={props.hoy}
          cajaAbierta={props.cajaAbierta}
          prendas={props.prendas}
          onEntregado={(hecha) => {
            setEntregar(null);
            setEntregado(hecha);
          }}
          onClose={() => setEntregar(null)}
        />
      )}
      {entregado && (
        <ApartadoEntregadoModal apartado={entregado.apartado} pagadoHoy={entregado.pagadoHoy} vuelto={entregado.vuelto} sede={props.ubicacionEtiqueta} onClose={() => setEntregado(null)} />
      )}
    </div>
  );
}
