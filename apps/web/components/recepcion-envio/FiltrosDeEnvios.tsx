"use client";

import { useState, type ReactNode } from "react";
import { Calendar, ChevronDown, CircleDot, Truck } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CapaDeFiltro } from "@/components/ui/CapaDeFiltro";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { BotonLimpiar } from "@/components/ui/FiltrosPuestos";
import {
  ajustarRangoEnvio,
  contarFiltros,
  ESTADOS_DE_FILA,
  PERIODOS_ENVIO,
  periodoDeRangoEnvio,
  rangoDePeriodoEnvio,
  SIN_FILTROS,
  textoFechasEnvio,
  type EstadoDeFila,
  type FiltrosEnvios,
} from "@/lib/recepcion-envio-filtros";

// La barra de «Envíos por recibir en esta sede»: el buscador y, en la misma línea, las tres píldoras que más ayudan a hallar un envío entre
// muchos —Estado, Proveedor y Fechas (el día en que SALIÓ el envío)— con «Limpiar todo» cuando hay algo puesto. Es la misma barra de la
// pestaña «Recibidas recientemente» (`FiltrosRecibidas`): dos o tres filtros a la vista, sin panel. La lista es corta y ya está en el
// navegador, así que filtra ahí, sin URL ni base: lo que se pone se pierde al salir, como el buscador de arriba.

export function FiltrosDeEnvios({
  busqueda,
  onBusqueda,
  filtros,
  onFiltros,
  proveedores,
  hoy,
  conteo,
}: {
  busqueda: string;
  onBusqueda: (texto: string) => void;
  filtros: FiltrosEnvios;
  onFiltros: (filtros: FiltrosEnvios) => void;
  /** Los proveedores que hay en la tabla (`proveedoresDeLaLista`). */
  proveedores: readonly string[];
  /** `aaaa-mm-dd` de hoy en Lima. */
  hoy: string;
  /** Debajo del buscador: «3 de 8 coinciden». */
  conteo?: ReactNode;
}) {
  const hayAlgo = contarFiltros(filtros) > 0 || busqueda.trim() !== "";
  return (
    <div role="search" aria-label="Filtrar los envíos por recibir" data-guia="recibir.envios-filtros" className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
      <Buscador
        valor={busqueda}
        onCambio={onBusqueda}
        placeholder="Busca por número de envío, guía, proveedor u orden"
        etiqueta="Buscar un envío por recibir"
        conteo={conteo}
        className="w-full min-w-0 sm:w-auto sm:min-w-[16rem] sm:flex-1"
      />

      {/* Varios estados a la vez («Abierto» y «En camino»): la lista queda abierta y cada opción se marca o se desmarca. */}
      <DesplegablePildora
        icono={CircleDot}
        etiqueta="Estado"
        varias={{ valores: filtros.estados, onValores: (v) => onFiltros({ ...filtros, estados: v as EstadoDeFila[] }) }}
        opciones={ESTADOS_DE_FILA.map((e) => ({ valor: e.valor, texto: e.texto }))}
      />
      <DesplegablePildora
        icono={Truck}
        etiqueta="Proveedor"
        valor={filtros.proveedor ?? TODOS}
        onValor={(v) => onFiltros({ ...filtros, proveedor: v === TODOS ? null : v })}
        opciones={[{ valor: TODOS, texto: "Todos" }, ...proveedores.map((p) => ({ valor: p, texto: p }))]}
      />
      <PastillaFechas desde={filtros.desde} hasta={filtros.hasta} hoy={hoy} onCambiar={(desde, hasta) => onFiltros({ ...filtros, desde, hasta })} />

      {hayAlgo && (
        <BotonLimpiar
          onClick={() => {
            onBusqueda("");
            onFiltros(SIN_FILTROS);
          }}
        >
          Limpiar todo
        </BotonLimpiar>
      )}
    </div>
  );
}

/** «Fechas» — períodos de un toque (hoy, últimos 7 días, hace más de una semana…) y, debajo, un rango a mano sobre el día en que salió el envío. */
function PastillaFechas({ desde, hasta, hoy, onCambiar }: { desde: string; hasta: string; hoy: string; onCambiar: (desde: string, hasta: string) => void }) {
  const [abierta, setAbierta] = useState(false);
  const activa = Boolean(desde || hasta);
  const periodo = periodoDeRangoEnvio(desde, hasta, hoy);
  const texto = textoFechasEnvio(desde, hasta, hoy);

  function cambiarExtremo(cual: "desde" | "hasta", valor: string) {
    const r = ajustarRangoEnvio(cual === "desde" ? valor : desde, cual === "hasta" ? valor : hasta, cual);
    onCambiar(r.desde, r.hasta);
  }

  return (
    // En escritorio, el globo junto a la píldora; en el celular, la hoja del sistema (CapaDeFiltro, ADR-0479).
    <CapaDeFiltro
      abierta={abierta}
      onAbierta={setAbierta}
      titulo="Fecha de envío"
      ancho="w-[19rem]"
      alinear="end"
      envolver={(boton) => (
        <div className="pildora-filtro shrink-0" data-puesta={activa || undefined} data-abierta={abierta || undefined}>
          {boton}
        </div>
      )}
      disparador={
        <button type="button" className="pildora-filtro-boton" aria-label={activa ? `Fechas: ${texto}` : "Fechas"}>
          <Calendar aria-hidden className="pildora-filtro-icono" />
          <span className="pildora-filtro-nombre">Fechas{activa && ":"}</span>
          {activa && (
            <span className="pildora-filtro-valor">
              <span className="truncate">{texto}</span>
            </span>
          )}
          <ChevronDown aria-hidden className="pildora-filtro-flecha" />
        </button>
      }
    >
      {(cerrar) => (
        <>
          <div className="p-1">
            {PERIODOS_ENVIO.map((p) => (
              <button
                key={p.clave}
                type="button"
                aria-pressed={periodo === p.clave}
                onClick={() => {
                  const r = rangoDePeriodoEnvio(p.clave, hoy);
                  onCambiar(r.desde, r.hasta);
                  cerrar();
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
            <p className="label-cayla text-[10px] text-tinta/55">Otro período · día de envío</p>
            <CampoFecha etiqueta="Desde" valor={desde} onValor={(v) => cambiarExtremo("desde", v)} />
            <CampoFecha etiqueta="Hasta" valor={hasta} onValor={(v) => cambiarExtremo("hasta", v)} />
            {activa && (
              <button
                type="button"
                onClick={() => {
                  onCambiar("", "");
                  cerrar();
                }}
                className="label-cayla text-[11px] text-tinta/65 transition-colors hover:text-rojo"
              >
                Quitar fechas
              </button>
            )}
          </div>
        </>
      )}
    </CapaDeFiltro>
  );
}
