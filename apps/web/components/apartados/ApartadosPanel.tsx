"use client";

import { useState } from "react";
import { Bookmark, Clock, ShoppingBag, SlidersHorizontal } from "lucide-react";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import type { ResumenApartados } from "@/lib/separaciones";
import { estadoVisible, TOPE_SEPARACIONES, type Apartado, type AvisoApartado, type PedidoApartado } from "@/lib/separaciones-reglas";
import { ApartarVista } from "@/components/apartados/ApartarVista";
import { EntregarVista } from "@/components/apartados/EntregarVista";
import { TodosVista } from "@/components/apartados/TodosVista";
import { ALTO_PESTANAS_MOVIL, EnCuerpo } from "@/components/apartados/piezas";
import { OpcionesApartadosModal } from "@/components/apartados/ModalesApartado";

export type Vista = "apartar" | "entregar" | "todos";

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
  /** La lista llegó al tope de `buscar_separaciones` (200): hay apartados ya cerrados que no se muestran. */
  hayMas?: boolean;
  /** Los avisos por WhatsApp de cada apartado abierto (Recordar en lote); vacío si la migración aún no está. */
  avisos?: Record<string, AvisoApartado>;
  /** Prendas que llegan del ticket del Punto de venta («Apartar», `lib/apartar-desde-ticket.ts`). */
  lineasDesdeTicket?: { varianteId: string; cantidad: number }[];
  /** Lo que la tienda apagó en «Opciones» (paso 5). Vacío = Completo, el de fábrica. */
  apagadas?: string[];
  /** El rol de la cuenta ve «Clientas»: si no, Apartar no ofrece buscar la ficha (ADR-0249, 2026-09-28). */
  veClientas: boolean;
  /** Solo el líder cambia las opciones (`guardar_opciones_apartados`). */
  esLider?: boolean;
  /** Pedidos a otras tiendas para apartar (hechos y recibidos). */
  pedidos?: PedidoApartado[];
  /** Las otras tiendas, con su nombre corto (AQP, LIM…), para pedirles una prenda. */
  tiendas?: { id: string; nombre: string }[];
  /** `?abrir=<id>` (ADR-0241, desde un movimiento de Movimientos): abierto → «Entregar» con ese apartado elegido; ya
   *  cerrado → «Todos» buscándolo por su código. Un id que no está en la lista no cambia nada. */
  abrir?: string | null;
  /** La base ya recibe el redondeo del efectivo (`fn_acepta_redondeo_efectivo`, ADR-0311): la entrega cobra el saldo en monedas de S/ 0.10. */
  redondeoEfectivo?: boolean;
};

/**
 * La hoja de «Apartados»: la misma forma que «Venta en tienda» (a la izquierda la sede, las tres pestañas y la
 * búsqueda; a la derecha, de arriba abajo, el panel de cobro). Cada pestaña es una pieza aparte; esta solo decide cuál se ve y guarda el
 * apartado elegido al pasar de «Todos» a «Entregar».
 */
export function ApartadosPanel(props: Props) {
  const paraAbrir = props.abrir ? (props.apartados.find((a) => a.id === props.abrir) ?? null) : null;
  const [vista, setVista] = useState<Vista>(paraAbrir ? (paraAbrir.estado === "abierta" ? "entregar" : "todos") : "apartar");
  const [elegido, setElegido] = useState<string | null>(paraAbrir?.estado === "abierta" ? paraAbrir.id : null);
  const [opciones, setOpciones] = useState(false);
  // «Apartar con adelanto» de un pedido que llegó: Apartar se vuelve a montar con esa prenda y esa clienta.
  const [pedidoParaApartar, setPedidoParaApartar] = useState<PedidoApartado | null>(null);
  const apagadas = props.apagadas ?? [];
  const necesitanAlgo = props.apartados.filter((a) => ["porvencer", "vencida", "devolver"].includes(estadoVisible(a, props.hoy).clave)).length;

  const irA = (v: Vista) => {
    setVista(v);
    // En el celular la pestaña se toca abajo: la vista nueva empieza arriba, no a media página.
    document.getElementById("hoja-apartados")?.scrollIntoView({ block: "start" });
  };
  const irAEntregar = (id: string) => {
    setElegido(id);
    irA("entregar");
  };

  const pestañas: { id: Vista; etiqueta: string; icono: React.ReactNode; insignia?: number }[] = [
    { id: "apartar", etiqueta: "Apartar", icono: <Bookmark className="h-5 w-5" aria-hidden /> },
    { id: "entregar", etiqueta: "Entregar", icono: <ShoppingBag className="h-5 w-5" aria-hidden /> },
    { id: "todos", etiqueta: "Todos", icono: <Clock className="h-5 w-5" aria-hidden />, insignia: necesitanAlgo },
  ];

  // Pestañas, «Opciones» y avisos, pegados a la izquierda (Felipe, 2026-09-26, spike
  // `docs/maquetas/apartados-ticket-alto-2026-09/`): en Apartar y Entregar la vista los pinta al tope de su columna de
  // trabajo, y el ticket de la derecha sube hasta el borde de la hoja. En Todos, sin ticket, van a todo el ancho.
  const cabecera = (
    <>
      {/* Entre 1024 y 1280 px la columna de trabajo mide ~290 px (el ticket, 380): la etiqueta se oculta (la sede ya está en la barra de
          arriba y Apartados, en el menú) y «Opciones» queda en su ícono. En Todos, a todo el ancho, siempre caben. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-sand px-5 py-3 sm:min-h-16 sm:gap-x-6 sm:px-6 sm:py-0 lg:max-xl:gap-x-4 lg:max-xl:px-4">
        <p className={`label-cayla text-[11px] text-tinta/80 ${vista === "todos" ? "" : "lg:max-xl:hidden"}`}>Apartados · {props.ubicacionEtiqueta}</p>
        <span aria-hidden className={`h-[22px] w-px bg-sand max-lg:hidden ${vista === "todos" ? "" : "lg:max-xl:hidden"}`} />
        <div className="flex items-center gap-6 lg:max-xl:gap-4">
        <nav aria-label="Apartados" className="flex items-center gap-6 max-lg:hidden lg:max-xl:gap-4">
          {pestañas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => irA(p.id)}
              aria-current={vista === p.id ? "page" : undefined}
              // La letra de la pestaña de vista del ERP (ADR-0358): 13,5 px, inactiva en taupe, elegida en tinta y 500, con su
              // ancho reservado. Los 64 px y el subrayado en tinta son de esta pantalla (alinean con el ticket, ADR-0223).
              className={`relative h-11 text-[13.5px] transition-colors sm:h-16 ${vista === p.id ? "font-medium text-tinta after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-tinta" : "text-taupe hover:text-tinta"}`} // unificar-fijo: 64 px y subrayado alineados al ticket, ADR-0223
            >
              <span className="pestana-cayla__texto" data-texto={p.etiqueta}>{p.etiqueta}</span>
              {!!p.insignia && (
                <span className="ml-1.5 inline-grid h-[17px] min-w-[17px] place-items-center rounded-full bg-rojo px-1 text-[10px] text-papel">{p.insignia}</span>
              )}
            </button>
          ))}
        </nav>
        {props.esLider && (
          <button
            type="button"
            onClick={() => setOpciones(true)}
            title="Qué funciones usa Apartados en esta tienda"
            aria-label="Opciones"
            className="label-cayla flex h-9 items-center gap-1.5 rounded-lg border border-sand bg-papel px-3 text-[10.5px] text-tinta/80 hover:border-taupe"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            <span className={vista === "todos" ? "" : "lg:max-xl:hidden"}>Opciones</span>
          </button>
        )}
        </div>
      </header>

      {(props.liberadosAhora > 0 || !props.cajaAbierta || props.hayMas) && (
        <div className="space-y-1 border-b border-sand bg-crema px-6 py-2.5 text-[12.5px]">
          {props.liberadosAhora > 0 && (
            <p className="text-rojo-profundo">
              {props.liberadosAhora === 1 ? "Un apartado venció hace más de 2 días y se liberó solo" : `${props.liberadosAhora} apartados vencieron hace más de 2 días y se liberaron solos`}:
              la prenda volvió al stock y falta devolver el adelanto (ver «Todos»).
            </p>
          )}
          {props.hayMas && (
            <p className="text-tinta/70">
              Se muestran los {TOPE_SEPARACIONES} apartados más urgentes (liberados y abiertos primero). Los más antiguos ya cerrados no entran en esta lista; las cifras de «Todos» sí los cuentan.
            </p>
          )}
          {!props.cajaAbierta && <p className="text-ambar-profundo">No hay caja abierta en {props.ubicacionEtiqueta}: para apartar o entregar, primero abre la caja.</p>}
        </div>
      )}
    </>
  );

  return (
    // Celular (Felipe, 2026-09-26, spike `docs/maquetas/apartados-v2-2026-09/`): las pestañas bajan a la altura del
    // pulgar y la barra de cada paso se apoya encima; el margen de abajo deja ver lo último que queda bajo las dos.
    <section id="hoja-apartados" className="anim-sube flex min-h-[calc(100vh-9rem)] scroll-mt-20 flex-col overflow-hidden rounded-[22px] border border-sand bg-papel max-lg:mb-40">
      {vista === "todos" && cabecera}

      {vista === "apartar" && (
        <ApartarVista ubicacionId={props.ubicacionId} ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} cajaAbierta={props.cajaAbierta} prendas={props.prendas}
          cabecera={cabecera}
          lineasIniciales={pedidoParaApartar ? undefined : props.lineasDesdeTicket}
          apagadas={apagadas}
          veClientas={props.veClientas}
          tiendas={props.tiendas ?? []}
          pedido={pedidoParaApartar}
          key={pedidoParaApartar?.id ?? "apartar"}
          onPedidoHecho={() => setPedidoParaApartar(null)}
        />
      )}
      {vista === "entregar" && (
        <EntregarVista ubicacionId={props.ubicacionId} ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} cajaAbierta={props.cajaAbierta} apartados={props.apartados} prendas={props.prendas} elegido={elegido} onElegir={setElegido} apagadas={apagadas} cabecera={cabecera} redondeoEfectivo={props.redondeoEfectivo} />
      )}
      {vista === "todos" && (
        <TodosVista ubicacionId={props.ubicacionId} ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} puedeGestionar={props.puedeGestionar} cajaAbierta={props.cajaAbierta} apartados={props.apartados} resumen={props.resumen} prendas={props.prendas} avisos={props.avisos ?? {}}
          irAEntregar={irAEntregar}
          buscarInicial={paraAbrir && paraAbrir.estado !== "abierta" ? paraAbrir.codigo : ""}
          apagadas={apagadas}
          pedidos={props.pedidos ?? []}
          onApartarPedido={(p) => {
            setPedidoParaApartar(p);
            irA("apartar");
          }}
        />
      )}

      {opciones && (
        <OpcionesApartadosModal ubicacion={{ ubicacionId: props.ubicacionId, etiqueta: props.ubicacionEtiqueta }} apagadas={apagadas} onClose={() => setOpciones(false)} />
      )}

      {/* Las mismas pestañas, abajo y solo en el celular. No es un segundo menú: el ☰ sigue siendo el del ERP (ADR-0206). */}
      <EnCuerpo>
      <nav
        aria-label="Apartados"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-sand bg-papel pb-[env(safe-area-inset-bottom)] sm:left-lateral sm:transition-[left] sm:duration-300 lg:hidden"
      >
        {pestañas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => irA(p.id)}
            aria-current={vista === p.id ? "page" : undefined}
            style={{ height: ALTO_PESTANAS_MOVIL }}
            className={`relative flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${vista === p.id ? "text-tinta" : "text-tinta/50"}`}
          >
            {p.icono}
            {p.etiqueta}
            {!!p.insignia && (
              <span className="absolute top-2 left-[calc(50%+6px)] grid h-[17px] min-w-[17px] place-items-center rounded-full bg-rojo px-1 text-[10px] text-papel">{p.insignia}</span>
            )}
          </button>
        ))}
      </nav>
      </EnCuerpo>
    </section>
  );
}
