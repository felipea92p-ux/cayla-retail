"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown, Truck } from "lucide-react";
import { Popover } from "radix-ui";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import {
  PERIODOS_RECIBIDAS,
  ajustarRango,
  hayFiltrosRecibidas,
  hrefConCambios,
  periodoDeRango,
  rangoDePeriodo,
  textoFechas,
  type FiltrosRecibidas as Filtros,
  type PeriodoRecibidas,
  type ResultadoRecibidas,
} from "@/lib/recibidas-filtros-reglas";
import { Buscador } from "@/components/ui/Buscador";
import { BotonLimpiar } from "@/components/ui/FiltrosPuestos";

// Filtros de «Recibidas recientemente» tal como los dibuja la maqueta 06: el buscador y, en la
// misma línea, dos pastillas —«Proveedor: Todos ⌄» y «Fechas»— sin el botón «Filtros» ni su
// panel. Reemplaza a `FiltrosCompras` SOLO en esta pestaña (Comprobantes y Por pagar siguen con
// el suyo): esas pantallas filtran por seis cosas y necesitan el panel; esta filtra por dos y
// la maqueta las pone a la vista.
//
// Los filtros viven en la URL (?q=&prov=&desde=&hasta=), como en el resto de Compras: la página
// es un Server Component que filtra en Postgres (`listar_recepciones_compras`), el enlace se
// comparte y «atrás» vuelve al filtro anterior. Este componente no filtra nada: lee lo que el
// servidor ya limpió (`filtros`, de `filtrosRecibidasDesdeParams`) y arma la URL siguiente. Cada
// pastilla abre su propia lista al tocarla (la maqueta es estática y no dibuja el estado abierto).
//
// Lo que cuenta la pastilla «Fechas» es el día en que LLEGÓ la guía, no el de emisión.
//
// Celular: el buscador ocupa su propia línea y las pastillas bajan debajo, apiladas si no caben —
// nunca hay scroll horizontal; el nombre de un proveedor largo se recorta con «…».

export function FiltrosRecibidas({
  proveedores,
  filtros,
  hoy,
  resultado,
}: {
  proveedores: { id: string; nombre: string }[];
  /** Lo que el servidor ya filtró (limpio, ver `filtrosRecibidasDesdeParams`). */
  filtros: Filtros;
  /** aaaa-mm-dd de hoy en Lima, resuelto en el servidor con `hoyLima()`. */
  hoy: string;
  /** `?res=` ya limpio: lo filtra `RecepcionesCompraLista` en el navegador; acá solo se elige. */
  resultado: ResultadoRecibidas;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(filtros.busqueda ?? "");
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { buscando, buscar } = useBusquedaEnUrl();

  /** `tipeado`: viene del buscador (se escribió): navega sin el loader, con «Buscando…». */
  function aplicar(cambios: Record<string, string>, { tipeado = false } = {}) {
    const href = hrefConCambios(pathname, params.toString(), cambios);
    if (tipeado) buscar(href);
    else router.push(href);
  }

  // El temporizador de la búsqueda llama a la versión más reciente de `aplicar`: si mientras se
  // tipea cambia otro filtro, la URL siguiente parte de la URL de ahora, no de la de la primera tecla.
  const aplicarActual = useRef(aplicar);
  useEffect(() => {
    aplicarActual.current = aplicar;
  });
  useEffect(() => () => clearTimeout(temporizador.current), []);

  // La búsqueda se manda sola al dejar de tipear (350 ms) — sin botón, pero sin una consulta por
  // tecla — o al instante con Enter.
  function alTipear(texto: string) {
    setBusqueda(texto);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => aplicarActual.current({ q: texto.trim() }, { tipeado: true }), 350);
  }

  function limpiarTodo() {
    clearTimeout(temporizador.current);
    setBusqueda("");
    aplicar({ q: "", prov: "", desde: "", hasta: "", res: "" });
  }

  const hayActivos = hayFiltrosRecibidas(filtros) || busqueda.trim() !== "" || resultado !== "todas";
  const periodoActivo = periodoDeRango(filtros.desde, filtros.hasta, hoy);

  return (
    <div role="search" aria-label="Filtrar las recepciones" data-guia="recibidas.filtros" className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
      <Buscador
        valor={busqueda}
        onCambio={alTipear}
        buscando={buscando}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          clearTimeout(temporizador.current);
          aplicar({ q: busqueda.trim() }, { tipeado: true });
        }}
        placeholder="Documento, proveedor o guía"
        etiqueta="Buscar por documento, proveedor o guía"
        className="w-full min-w-0 sm:w-auto sm:min-w-[16rem] sm:flex-1"
      />

      {/* La píldora de filtro del sistema (ADR-0358, ronda 6). Un proveedor que ya no está entre los activos (archivado, enlace
          viejo) sigue filtrando en el servidor: la píldora lo dice como «Otro» en vez de mentir con «Todos». */}
      <DesplegablePildora
        icono={Truck}
        etiqueta="Proveedor"
        valor={filtros.proveedorId ?? TODOS}
        onValor={(v) => aplicar({ prov: v === TODOS ? "" : v })}
        opciones={[
          { valor: TODOS, texto: "Todos" },
          ...proveedores.map((p) => ({ valor: p.id, texto: p.nombre })),
          ...(filtros.proveedorId && !proveedores.some((p) => p.id === filtros.proveedorId) ? [{ valor: filtros.proveedorId, texto: "Otro" }] : []),
        ]}
      />
      <PastillaFechas desde={filtros.desde ?? ""} hasta={filtros.hasta ?? ""} hoy={hoy} onCambiar={(desde, hasta) => aplicar({ desde, hasta })} />

      {/* Los dos filtros del spike: el periodo de un toque (tocar el activo lo quita) y cómo llegó lo recibido. Dejan menos
          recepciones en la misma lista: la píldora de filtro del sistema (ADR-0358), no el segmento. */}
      <div role="group" aria-label="Periodo de llegada" className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["este-mes", "Este mes"],
            ["30-dias", "30 días"],
            ["90-dias", "90 días"],
          ] as const
        ).map(([clave, texto]) => (
          <button
            key={clave}
            type="button"
            aria-pressed={periodoActivo === clave}
            onClick={() => {
              if (clave === periodoActivo) return aplicar({ desde: "", hasta: "" });
              const r = rangoDePeriodo(clave as PeriodoRecibidas, hoy);
              aplicar({ desde: r.desde, hasta: r.hasta });
            }}
            className="pildora-cayla"
          >
            {texto}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Filtrar por resultado" className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["todas", "Todas"],
            ["completas", "Completas"],
            ["faltante", "Con faltante"],
          ] as const
        ).map(([clave, texto]) => (
          <button key={clave} type="button" aria-pressed={resultado === clave} onClick={() => aplicar({ res: clave === "todas" ? "" : clave })} className="pildora-cayla">
            {texto}
          </button>
        ))}
      </div>

      {hayActivos && (
        <BotonLimpiar onClick={limpiarTodo}>Limpiar todo</BotonLimpiar>
      )}
    </div>
  );
}

/** «Fechas» — períodos de un toque (este mes, últimos 90 días…) y, debajo, un rango a mano. */
function PastillaFechas({ desde, hasta, hoy, onCambiar }: { desde: string; hasta: string; hoy: string; onCambiar: (desde: string, hasta: string) => void }) {
  const [abierta, setAbierta] = useState(false);
  const activa = Boolean(desde || hasta);
  const periodo = periodoDeRango(desde || undefined, hasta || undefined, hoy);

  function cambiarExtremo(cual: "desde" | "hasta", valor: string) {
    const r = ajustarRango(cual === "desde" ? valor : desde, cual === "hasta" ? valor : hasta, cual);
    onCambiar(r.desde, r.hasta);
  }

  return (
    <Popover.Root open={abierta} onOpenChange={setAbierta}>
      {/* La cara de la píldora de filtro del sistema (ADR-0358, ronda 6), para verse igual que su vecina «Proveedor». */}
      <div className="pildora-filtro shrink-0" data-puesta={activa || undefined} data-abierta={abierta || undefined}>
        <Popover.Trigger asChild>
          <button type="button" className="pildora-filtro-boton" aria-label={activa ? `Fechas: ${textoFechas(desde || undefined, hasta || undefined, hoy)}` : "Fechas"}>
            <Calendar aria-hidden className="pildora-filtro-icono" />
            <span className="pildora-filtro-nombre">Fechas{activa && ":"}</span>
            {activa && (
              <span className="pildora-filtro-valor">
                <span className="truncate">{textoFechas(desde || undefined, hasta || undefined, hoy)}</span>
              </span>
            )}
            <ChevronDown aria-hidden className="pildora-filtro-flecha" />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="anim-revelar z-50 w-[19rem] max-w-[calc(100vw-2rem)] rounded-lg border border-sand bg-papel shadow-md"
        >
          <div className="p-1">
            {PERIODOS_RECIBIDAS.map((p) => (
              <button
                key={p.clave}
                type="button"
                aria-pressed={periodo === p.clave}
                onClick={() => {
                  const r = rangoDePeriodo(p.clave, hoy);
                  onCambiar(r.desde, r.hasta);
                  setAbierta(false);
                }}
                className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-tinta outline-none transition-colors hover:bg-rojo/8 focus-visible:bg-rojo/8 ${
                  periodo === p.clave ? "font-semibold" : ""
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-sand p-3">
            <p className="label-cayla text-[10px] text-tinta/55">Otro período · día de llegada</p>
            <CampoFecha etiqueta="Desde" valor={desde} onValor={(v) => cambiarExtremo("desde", v)} />
            <CampoFecha etiqueta="Hasta" valor={hasta} onValor={(v) => cambiarExtremo("hasta", v)} />
            {activa && (
              <button
                type="button"
                onClick={() => {
                  onCambiar("", "");
                  setAbierta(false);
                }}
                className="label-cayla text-[11px] text-tinta/65 transition-colors hover:text-rojo"
              >
                Quitar fechas
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
