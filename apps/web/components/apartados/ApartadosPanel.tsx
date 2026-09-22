"use client";

import { useState } from "react";
import type { VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { ResumenApartados } from "@/lib/separaciones";
import { estadoVisible, type Apartado } from "@/lib/separaciones-reglas";
import { ApartarVista } from "@/components/apartados/ApartarVista";
import { EntregarVista } from "@/components/apartados/EntregarVista";
import { TodosVista } from "@/components/apartados/TodosVista";

export type Vista = "apartar" | "entregar" | "todos";

type Props = {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  cajaAbierta: boolean;
  /** Extender, liberar y registrar la devolución (D5): líder o terminal de ventas. */
  puedeGestionar: boolean;
  prendas: VarianteBusqueda[];
  apartados: Apartado[];
  resumen: ResumenApartados;
  liberadosAhora: number;
};

/**
 * La hoja de «Apartados»: la misma forma que «Venta en tienda» (cabecera con la sede y tres pestañas, izquierda para
 * buscar, derecha para el panel de cobro). Cada pestaña es una pieza aparte; esta solo decide cuál se ve y guarda el
 * apartado elegido al pasar de «Todos» a «Entregar».
 */
export function ApartadosPanel(props: Props) {
  const [vista, setVista] = useState<Vista>("apartar");
  const [elegido, setElegido] = useState<string | null>(null);
  const necesitanAlgo = props.apartados.filter((a) => ["porvencer", "vencida", "devolver"].includes(estadoVisible(a, props.hoy).clave)).length;

  const irAEntregar = (id: string) => {
    setElegido(id);
    setVista("entregar");
  };

  const pestañas: { id: Vista; etiqueta: string; insignia?: number }[] = [
    { id: "apartar", etiqueta: "Apartar" },
    { id: "entregar", etiqueta: "Entregar" },
    { id: "todos", etiqueta: "Todos", insignia: necesitanAlgo },
  ];

  return (
    <section className="anim-sube flex min-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-[22px] border border-sand bg-papel">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-sand px-6 py-3 sm:h-16 sm:py-0">
        <p className="label-cayla text-[11px] text-tinta/80">Apartados · {props.ubicacionEtiqueta}</p>
        <nav aria-label="Apartados" className="flex items-center gap-6">
          {pestañas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setVista(p.id)}
              aria-current={vista === p.id ? "page" : undefined}
              className={`label-cayla relative h-11 text-[11px] transition-colors sm:h-16 ${vista === p.id ? "text-tinta after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-tinta" : "text-tinta/55 hover:text-tinta"}`}
            >
              {p.etiqueta}
              {!!p.insignia && (
                <span className="ml-1.5 inline-grid h-[17px] min-w-[17px] place-items-center rounded-full bg-rojo px-1 text-[10px] tracking-normal text-papel">{p.insignia}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {(props.liberadosAhora > 0 || !props.cajaAbierta) && (
        <div className="space-y-1 border-b border-sand bg-crema px-6 py-2.5 text-[12.5px]">
          {props.liberadosAhora > 0 && (
            <p className="text-rojo-profundo">
              {props.liberadosAhora === 1 ? "Un apartado venció hace más de 2 días y se liberó solo" : `${props.liberadosAhora} apartados vencieron hace más de 2 días y se liberaron solos`}:
              la prenda volvió al stock y falta devolver el adelanto (ver «Todos»).
            </p>
          )}
          {!props.cajaAbierta && <p className="text-ambar-profundo">No hay caja abierta en {props.ubicacionEtiqueta}: para apartar o entregar, primero abre la caja.</p>}
        </div>
      )}

      {vista === "apartar" && (
        <ApartarVista ubicacionId={props.ubicacionId} ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} cajaAbierta={props.cajaAbierta} prendas={props.prendas} irAEntregar={() => setVista("entregar")} />
      )}
      {vista === "entregar" && (
        <EntregarVista ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} cajaAbierta={props.cajaAbierta} apartados={props.apartados} prendas={props.prendas} elegido={elegido} onElegir={setElegido} />
      )}
      {vista === "todos" && (
        <TodosVista ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} puedeGestionar={props.puedeGestionar} cajaAbierta={props.cajaAbierta} apartados={props.apartados} resumen={props.resumen} prendas={props.prendas} irAEntregar={irAEntregar} />
      )}
    </section>
  );
}
