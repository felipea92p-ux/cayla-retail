"use client";

import { useState } from "react";
import type { FilaOfertaDeMonto } from "@/lib/ofertas-de-grupo";
import { Globito } from "@/components/ui/Globito";
import { Bookmark, ClipboardList, Clock, SlidersHorizontal } from "lucide-react";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import { TOPE_SEPARACIONES, type Apartado, type AvisoApartado, type PedidoApartado } from "@/lib/separaciones-reglas";
import { cuantosPendientes, enPendientes } from "@/lib/apartados-pestanas";
import { ApartarVista } from "@/components/apartados/ApartarVista";
import { EntregarVista } from "@/components/apartados/EntregarVista";
import { HistorialVista } from "@/components/apartados/HistorialVista";
import { PendientesVista } from "@/components/apartados/PendientesVista";
import { EnCuerpo } from "@/components/apartados/piezas";
import { OpcionesApartadosModal } from "@/components/apartados/ModalesApartado";
import { Pestanas } from "@/components/ui/Pestanas";
import { claveDelApartado } from "@/lib/apartados-cambio-de-sede";
import type { CanalVenta } from "@/lib/canales-venta-reglas";
import { CanalesDeApartados } from "@/components/apartados/CanalChip";

/** Las tres pestañas (ADR-0720): «Apartar» hace uno nuevo, «Pendientes» es lo que sigue vivo (y, al abrir uno, su cobro) e
 *  «Historial», lo terminado. «Entregar» dejó de ser pestaña: es abrir un apartado de Pendientes. */
export type Vista = "apartar" | "pendientes" | "historial";

type Props = {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  cajaAbierta: boolean;
  /** Extender, liberar y registrar la devolución (D5): líder o terminal de ventas. */
  puedeGestionar: boolean;
  prendas: PrendaApartable[];
  /** «Gastar un monto y ahorrar» (ADR-0655, actividad 8): los montos de hoy en esta tienda (`ofertas_de_monto_vigentes`). */
  filasMonto?: readonly FilaOfertaDeMonto[];
  apartados: Apartado[];
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
  /** `?abrir=<id>` (ADR-0241, desde un movimiento de Movimientos): abierto → «Pendientes» con el cobro de ese apartado; cancelado
   *  con su adelanto por devolver → «Pendientes» buscándolo por su código; terminado → «Historial», igual. Un id que no está en la lista
   *  no cambia nada. */
  abrir?: string | null;
  /** La base ya recibe el redondeo del efectivo (`fn_acepta_redondeo_efectivo`, ADR-0311): la entrega cobra el saldo en monedas de S/ 0.10. */
  redondeoEfectivo?: boolean;
  /** ADR-0607: los canales de venta que opera la cuenta (la tienda, TikTok…). Solo la tienda = Apartar como siempre. */
  canales?: readonly CanalVenta[];
};

/**
 * La hoja de «Apartados»: la misma forma que «Venta en tienda» (a la izquierda las tres pestañas y lo de trabajo; a la derecha, de
 * arriba abajo, el panel de cobro). Cada pestaña es una pieza aparte; esta solo decide cuál se ve y guarda el apartado abierto en
 * «Pendientes» (su cobro) hasta volver a la lista.
 */
export function ApartadosPanel(props: Props) {
  const paraAbrir = props.abrir ? (props.apartados.find((a) => a.id === props.abrir) ?? null) : null;
  const [vista, setVista] = useState<Vista>(paraAbrir ? (enPendientes(paraAbrir) ? "pendientes" : "historial") : "apartar");
  const [elegido, setElegido] = useState<string | null>(paraAbrir?.estado === "abierta" ? paraAbrir.id : null);
  const [opciones, setOpciones] = useState(false);
  // Con qué búsqueda arranca la lista que se abre: el código del apartado que llegó por `?abrir=` (si no se abre su cobro) o lo que se
  // buscó en la otra lista y no estaba (ADR-0720). Tocar una pestaña la borra.
  const [buscarAlEntrar, setBuscarAlEntrar] = useState(paraAbrir && paraAbrir.estado !== "abierta" ? paraAbrir.codigo : "");
  // «Apartar con adelanto» de un pedido que llegó: Apartar se vuelve a montar con esa prenda y esa clienta.
  const [pedidoParaApartar, setPedidoParaApartar] = useState<PedidoApartado | null>(null);
  // La sede cambió con el selector de la cabecera (Felipe, 2026-10-11): el apartado elegido para entregar y el pedido por apartar son
  // de la sede anterior y no están en las listas de esta. Lo que se estaba apartando lo guarda `TrabajoPorSede` (ver `ApartarVista`).
  const [sedePrevia, setSedePrevia] = useState(props.ubicacionId);
  if (props.ubicacionId !== sedePrevia) {
    setSedePrevia(props.ubicacionId);
    setElegido(null);
    setPedidoParaApartar(null);
  }
  const apagadas = props.apagadas ?? [];
  // El número de «Pendientes» es el de filas de su lista (ADR-0720): dos números que no coinciden hacen dudar de los dos.
  const pendientes = cuantosPendientes(props.apartados);

  const irA = (v: Vista) => {
    setVista(v);
    // Tocar una pestaña lleva a su lista: el cobro de un apartado se abre desde «Pendientes» y se deja con «Volver»; y la lista empieza sin
    // la búsqueda que llegó de la otra.
    setElegido(null);
    setBuscarAlEntrar("");
    // En el celular la pestaña se toca abajo: la vista nueva empieza arriba, no a media página.
    document.getElementById("hoja-apartados")?.scrollIntoView({ block: "start" });
  };
  const irAEntregar = (id: string) => {
    irA("pendientes");
    setElegido(id);
  };

  const pestañas: { id: Vista; etiqueta: string; icono: React.ReactNode; cuenta?: number }[] = [
    { id: "apartar", etiqueta: "Apartar", icono: <Bookmark className="h-5 w-5" aria-hidden /> },
    { id: "pendientes", etiqueta: "Pendientes", icono: <ClipboardList className="h-5 w-5" aria-hidden />, cuenta: pendientes },
    // «Historial» (ADR-0367, Felipe 2026-10-09: «debe haber un apartado donde se vea el historial»): lo terminado, con su papel para
    // reimprimir.
    { id: "historial", etiqueta: "Historial", icono: <Clock className="h-5 w-5" aria-hidden /> },
  ];

  // El nombre, las pestañas y «Opciones». En Apartar y en el cobro la vista los pone sobre su columna de trabajo cuando caben (con el
  // ticket de la derecha subiendo hasta el borde, Felipe 2026-09-26) y a todo el ancho cuando no (`.ap-dos-cab`, vidrio/vender.css):
  // así las pestañas no cambian de lugar al pasar de una lista al cobro (ADR-0720). En las listas van a todo el ancho.
  const cabecera = (
    <>
      <header className="ap-cab flex flex-wrap items-center gap-x-4 gap-y-2 sm:min-h-16 sm:gap-x-6">
        {/* La sede ya está arriba, en la barra del ERP: aquí, solo el nombre de la pantalla. */}
        <p className="label-cayla text-xs text-tinta/80">Apartados</p>
        <span aria-hidden className="ap-cab-sep h-[22px] w-px max-lg:hidden" />
        <div className="flex items-center gap-6">
        {/* La pestaña de vista del ERP (ADR-0358): «Apartar / Pendientes / Historial» cambia de sección. Solo en escritorio; el celular
            lleva las suyas abajo (la isla de pestañas). */}
        <Pestanas
          className="max-lg:hidden"
          etiquetaAccesible="Apartados"
          idIndicador="apartados"
          guia="apartados.pestanas"
          activa={vista}
          onCambio={(c) => irA(c as Vista)}
          items={pestañas.map((p) => ({ clave: p.id, etiqueta: p.etiqueta, conteo: p.cuenta ?? null, pide: p.cuenta != null ? "pendientes" : undefined, tono: p.cuenta != null ? ("neutro" as const) : undefined, guia: `apartados.pestana-${p.id}` }))}
        />
        {props.esLider && (
          <button
            type="button"
            onClick={() => setOpciones(true)}
            data-guia="apartados.opciones"
            title="Qué funciones usa Apartados en esta tienda"
            aria-label="Opciones"
            className="ap-opciones area-dedo label-cayla flex h-9 items-center gap-1.5 px-3 text-xs text-tinta/80"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            <span>Opciones</span>
          </button>
        )}
        </div>
      </header>

      {(!props.cajaAbierta || props.hayMas) && (
        <div className="ap-avisos space-y-1 text-sm">
          {props.hayMas && (
            <p className="text-tinta/70">
              Se muestran los {TOPE_SEPARACIONES} apartados más urgentes (por devolver y abiertos primero): los más antiguos ya terminados no entran en el Historial.
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
    // «A · Al aire» (apartados-vidrio-2026-11, Felipe 2026-11-02): sin la hoja de papel; como la mesa de Vender, la cabecera es una fila
    // plana sobre el fondo y lo de adentro son placas (`ap-mesa`, vidrio/vender.css).
    <CanalesDeApartados canales={props.canales ?? []}>
    <section id="hoja-apartados" className="ap-mesa anim-sube flex min-h-[calc(100svh-9rem)] scroll-mt-4 flex-col max-lg:mb-40">
      {(vista === "historial" || (vista === "pendientes" && !elegido)) && cabecera}

      {vista === "apartar" && (
        <ApartarVista ubicacionId={props.ubicacionId} ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} cajaAbierta={props.cajaAbierta} prendas={props.prendas} filasMonto={props.filasMonto}
          cabecera={cabecera}
          lineasIniciales={pedidoParaApartar ? undefined : props.lineasDesdeTicket}
          apagadas={apagadas}
          veClientas={props.veClientas}
          tiendas={props.tiendas ?? []}
          pedido={pedidoParaApartar}
          key={claveDelApartado(props.ubicacionId, pedidoParaApartar?.id)}
          onPedidoHecho={() => setPedidoParaApartar(null)}
          canales={props.canales ?? []}
        />
      )}
      {vista === "pendientes" && !elegido && (
        <PendientesVista
          ubicacionId={props.ubicacionId}
          ubicacionEtiqueta={props.ubicacionEtiqueta}
          hoy={props.hoy}
          puedeGestionar={props.puedeGestionar}
          cajaAbierta={props.cajaAbierta}
          apartados={props.apartados}
          prendas={props.prendas}
          avisos={props.avisos ?? {}}
          apagadas={apagadas}
          pedidos={props.pedidos ?? []}
          buscarInicial={buscarAlEntrar}
          onAbrir={setElegido}
          onBuscarEnHistorial={(texto) => {
            irA("historial");
            setBuscarAlEntrar(texto);
          }}
          onApartarPedido={(p) => {
            setPedidoParaApartar(p);
            irA("apartar");
          }}
        />
      )}
      {vista === "pendientes" && elegido && (
        <EntregarVista ubicacionId={props.ubicacionId} ubicacionEtiqueta={props.ubicacionEtiqueta} hoy={props.hoy} cajaAbierta={props.cajaAbierta} apartados={props.apartados} prendas={props.prendas} elegido={elegido} onElegir={setElegido} apagadas={apagadas} cabecera={cabecera} redondeoEfectivo={props.redondeoEfectivo} />
      )}
      {vista === "historial" && (
        <HistorialVista
          ubicacionId={props.ubicacionId}
          ubicacionEtiqueta={props.ubicacionEtiqueta}
          hoy={props.hoy}
          puedeGestionar={props.puedeGestionar}
          cajaAbierta={props.cajaAbierta}
          apartados={props.apartados}
          prendas={props.prendas}
          apagadas={apagadas}
          buscarInicial={buscarAlEntrar}
          onEntregar={irAEntregar}
          onIrAPendientes={() => irA("pendientes")}
          onBuscarEnPendientes={(texto) => {
            irA("pendientes");
            setBuscarAlEntrar(texto);
          }}
        />
      )}

      {opciones && (
        <OpcionesApartadosModal ubicacion={{ ubicacionId: props.ubicacionId, etiqueta: props.ubicacionEtiqueta }} apagadas={apagadas} onClose={() => setOpciones(false)} />
      )}

      {/* Las mismas pestañas, abajo y solo en el celular. No es un segundo menú: el ☰ sigue siendo el del ERP (ADR-0206).
          «A · Isla de pestañas» (Felipe 2026-11-02): una isla de vidrio que flota a 12 px de los bordes, con la gota clara que viaja a la
          elegida (`ap-pestanas-isla`, vidrio/vender.css). */}
      <EnCuerpo>
      <nav aria-label="Apartados" className="ap-pestanas-isla grid grid-cols-3 lg:hidden">
        <span aria-hidden className="ap-pestanas-gota" style={{ ["--k" as string]: pestañas.findIndex((p) => p.id === vista) }} />
        {pestañas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => irA(p.id)}
            // «false» (válido en ARIA) y no ausente: así la guía interactiva reconoce la pestaña también cuando no es la elegida.
            aria-current={vista === p.id ? "page" : "false"}
            data-guia={`apartados.pestana-${p.id}`}
            className={`relative flex flex-col items-center justify-center gap-1 text-sm transition-colors ${vista === p.id ? "text-tinta" : "text-tinta/50"}`}
          >
            {p.icono}
            {p.etiqueta}
            <Globito n={p.cuenta ?? 0} esquina etiqueta="pendientes" className="absolute top-2 left-[calc(50%+6px)]" />
          </button>
        ))}
      </nav>
      </EnCuerpo>
    </section>
    </CanalesDeApartados>
  );
}
