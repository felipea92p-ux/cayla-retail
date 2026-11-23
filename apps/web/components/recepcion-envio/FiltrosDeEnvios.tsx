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
//
// Lo decide el ancho de la BARRA, no el de la ventana (Felipe 2026-11-17): quien la dibuja declara el contenedor `@container/barra-filtros`
// (`EnviosParaRecibir`); sin él, la barra se queda en su forma angosta. Dos cortes:
//   · bajo 768 px (un celular, una tableta o un laptop de 1024 px con el menú abierto) son dos filas: el buscador entero, con su marcador
//     sin cortar, y debajo las píldoras con «Sin aviso» a su derecha (a ese ancho ya no cabe junto al título);
//   · bajo 640 px, además, una píldora sin nada puesto es solo su ícono; con algo puesto vuelve a decir su valor y lleva su ✕, para que
//     se vea qué filtra.

export function FiltrosDeEnvios({
  busqueda,
  onBusqueda,
  filtros,
  onFiltros,
  proveedores,
  hoy,
  conteo,
  accionCelular,
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
  /** Bajo 768 px de barra, al final de la fila de píldoras: «Sin aviso» (con la barra ancha va junto al título de la tabla). */
  accionCelular?: ReactNode;
}) {
  const hayAlgo = contarFiltros(filtros) > 0 || busqueda.trim() !== "";
  return (
    <div role="search" aria-label="Filtrar los envíos por recibir" data-guia="recibir.envios-filtros" className="flex flex-wrap items-center gap-x-2 gap-y-2.5 @min-[640px]:gap-x-3.5">
      <Buscador
        valor={busqueda}
        onCambio={onBusqueda}
        placeholder="Envío, guía, proveedor, marca u orden" // sugerir-fijo: dice en qué busca, no depende de nada elegido antes
        etiqueta="Buscar un envío por recibir"
        conteo={conteo}
        className="w-full min-w-0 @min-[768px]:w-auto @min-[768px]:min-w-[16rem] @min-[768px]:flex-1"
      />

      {/* Varios estados a la vez («Abierto» y «En camino»): la lista queda abierta y cada opción se marca o se desmarca. */}
      <DesplegablePildora
        icono={CircleDot}
        etiqueta="Estado"
        soloIconoEnCelular={filtros.estados.length === 0}
        varias={{ valores: filtros.estados, onValores: (v) => onFiltros({ ...filtros, estados: v as EstadoDeFila[] }) }}
        opciones={ESTADOS_DE_FILA.map((e) => ({ valor: e.valor, texto: e.texto }))}
      />
      <DesplegablePildora
        icono={Truck}
        etiqueta="Proveedor"
        soloIconoEnCelular={filtros.proveedor === null}
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

      {accionCelular && <div className="ml-auto @min-[768px]:hidden">{accionCelular}</div>}
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
        // Sin fechas puestas, bajo 640 px de barra es solo el calendario (como «Estado» y «Proveedor»); con fechas, dice cuáles.
        <div className={`pildora-filtro shrink-0 ${activa ? "" : "pildora-filtro-icono-celular"}`} data-puesta={activa || undefined} data-abierta={abierta || undefined}>
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
            <p className="label-cayla text-xs text-tinta/55">Otro período · día de envío</p>
            <CampoFecha etiqueta="Desde" valor={desde} onValor={(v) => cambiarExtremo("desde", v)} />
            <CampoFecha etiqueta="Hasta" valor={hasta} onValor={(v) => cambiarExtremo("hasta", v)} />
            {activa && (
              <button
                type="button"
                onClick={() => {
                  onCambiar("", "");
                  cerrar();
                }}
                className="label-cayla text-xs text-tinta/65 transition-colors hover:text-rojo"
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
