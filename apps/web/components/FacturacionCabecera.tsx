"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FileText, Plus, Search, X } from "lucide-react";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { FechaHoraLima } from "@/components/ui/FechaHoraLima";
import { pestanaDeRuta, SEGUNDOS_VISTA_FRESCA, textoDeFrescura, type ClavePestana } from "@/lib/facturacion-reglas";
import { useFacturacionAcciones } from "@/lib/useFacturacionAcciones";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { useUltimaCarga } from "@/lib/ultima-carga-facturacion";

// Cabecera de Facturación: el título con su línea viva (fecha y hora de Lima y desde cuándo está
// lo que se ve), la caja de búsqueda de la vista y las dos acciones globales.

const PISTA_DE_BUSQUEDA: Record<ClavePestana, string> = {
  resumen: "Buscar venta, cliente o boleta…",
  proformas: "Buscar cliente…",
  comprobantes: "Buscar número, cliente o RUC…",
  descuentos: "Buscar código o sede…",
};

// La línea viva. El punto late mientras lo que se ve es reciente; pasados diez minutos sin recargar se
// queda quieto y ámbar, y el texto lo dice: una pantalla que se deja abierta todo el día no se actualiza
// sola, y un punto verde que late sobre datos de hace tres horas mentiría. Mientras no se sepa cuándo
// llegó la vista (el primer cuadro) se asume reciente: la acaba de armar el servidor.
function LineaViva() {
  const ultima = useUltimaCarga();
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const segundos = ultima === null ? null : Math.max(0, Math.floor((ahora - ultima) / 1000));
  const fresca = segundos === null || segundos < SEGUNDOS_VISTA_FRESCA;

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-tinta/65">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${fresca ? "punto-vivo bg-verde" : "bg-ambar"}`} />
      <span className="inline-block first-letter:uppercase">
        <FechaHoraLima />
      </span>
      {segundos !== null && (
        <>
          {/* El punto separador solo cuando cabe todo en una línea: al partirse, quedaba colgado al final. */}
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span className={fresca ? "" : "font-medium text-ambar-profundo"}>{textoDeFrescura(segundos)}</span>
        </>
      )}
    </p>
  );
}

// La caja de búsqueda: filtra las filas de la vista que se mira (el texto vive en el shell y se borra
// al cambiar de vista). `type="search"` con su propia «x»: la nativa cambia de un navegador a otro.
function CajaDeBusqueda() {
  const { texto, setTexto } = useFacturacionBusqueda();
  const pista = PISTA_DE_BUSQUEDA[pestanaDeRuta(usePathname())];

  return (
    <label className="vidrio-cayla flex h-9 w-full items-center gap-2 rounded-[10px] px-3 text-[13px] text-tinta transition-shadow duration-200 focus-within:outline focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rojo/60 sm:w-64">
      <Search aria-hidden strokeWidth={1.75} className="h-[15px] w-[15px] shrink-0 text-tinta/65" />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={pista}
        aria-label="Buscar en esta vista"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-tinta/60 [&::-webkit-search-cancel-button]:hidden"
      />
      {texto && (
        <button
          type="button"
          onClick={() => setTexto("")}
          aria-label="Borrar la búsqueda"
          className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-tinta/65 outline-none transition-colors duration-200 hover:bg-tinta/10 hover:text-tinta focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-rojo/60"
        >
          <X aria-hidden strokeWidth={1.75} className="h-[14px] w-[14px]" />
        </button>
      )}
    </label>
  );
}

export function FacturacionCabecera() {
  const { abrirEmitir, abrirProforma } = useFacturacionAcciones();
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Vender</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Facturación</h1>
        <LineaViva />
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <CajaDeBusqueda />
        <BotonCompacto variante="vidrio" icono={<FileText aria-hidden strokeWidth={1.75} />} onClick={abrirEmitir}>
          Emitir comprobante
        </BotonCompacto>
        <BotonCompacto variante="primario" icono={<Plus aria-hidden strokeWidth={1.75} />} onClick={abrirProforma}>
          Nueva proforma
        </BotonCompacto>
      </div>
    </div>
  );
}
