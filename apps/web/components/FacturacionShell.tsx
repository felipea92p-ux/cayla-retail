"use client";

import { Suspense, useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ConteosPestanas } from "@/lib/facturacion-reglas";
import { BusquedaFacturacionContext } from "@/lib/useFacturacionBusqueda";
import { CajaDeBusqueda, FacturacionCabecera, type CifrasCabecera } from "@/components/FacturacionCabecera";
import { FacturacionPestanas } from "@/components/FacturacionPestanas";
import { PestanasComprobantesMovil } from "@/components/PestanasComprobantesMovil";
import { Aviso } from "@/components/ui/Aviso";

// El marco de /vender/comprobantes (ADR-0124; «Facturación» hasta 2026-09-22): cabecera, aviso de la cola,
// pestañas y búsqueda. No dibuja modales (2026-09-22): «Emitir comprobante» se quitó (cada venta declara su
// comprobante sola al cobrar, D-60) y «Nueva proforma» vive en la pestaña Proformas, que lee el catálogo.
//
// Guarda el texto de la caja de búsqueda de la cabecera (cada lista lo lee con
// `useFacturacionBusqueda` y filtra sus filas). El texto es de UNA vista: se guarda junto a la ruta
// en que se escribió y, si la ruta cambia, ya no cuenta — así se borra solo al cambiar de vista, sin
// un efecto que lo reponga.
export function FacturacionShell({
  conteos,
  atrasadosEnCola,
  entorno,
  cifras,
  sede,
  children,
}: {
  conteos: ConteosPestanas;
  /** Comprobantes que llevan más de 1 hora en la cola de SUNAT: el aviso de arriba (D-60). */
  atrasadosEnCola: number;
  /** Adónde va el envío automático a SUNAT: la cabecera avisa «pruebas» si es el sandbox. */
  entorno: "sandbox" | "produccion";
  cifras: CifrasCabecera;
  sede: string;
  children: ReactNode;
}) {
  const ruta = usePathname();
  const [busqueda, setBusqueda] = useState({ ruta, texto: "" });
  const texto = busqueda.ruta === ruta ? busqueda.texto : "";
  const setTexto = useCallback((nuevo: string) => setBusqueda({ ruta, texto: nuevo }), [ruta]);
  const buscar = useMemo(() => ({ texto, setTexto }), [texto, setTexto]);

  return (
    <BusquedaFacturacionContext.Provider value={buscar}>
      {/* El mismo ritmo que Cambios, Devoluciones, Caja e Historial (`space-y-7`) y la misma entrada en
          cascada: la cabecera y su resumen (0 y 1), la fila de las pestañas con la búsqueda (2) y, debajo, la
          vista, que empieza en 2 y escalona sus tarjetas y paneles hacia abajo. */}
      <div className="tema-vidrio space-y-7 max-lg:pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <FacturacionCabecera sede={sede} cifras={cifras} entorno={entorno} />
        {/* D-60: si algo pasa más de una hora sin llegar a SUNAT, el reintento solo no alcanzó — se dice
            arriba, en todas las vistas, con el camino a la cola. */}
        {atrasadosEnCola > 0 && (
          <div className="anim-sube" style={{ "--i": 1 } as CSSProperties}>
            <Aviso
              tono="error"
              guia="comprobantes.aviso-sunat"
              titulo={`${atrasadosEnCola === 1 ? "1 comprobante lleva" : `${atrasadosEnCola} comprobantes llevan`} más de 1 hora sin llegar a SUNAT.`}
              accion={<Link href="/vender/comprobantes/por-reintentar">Ver Por enviar</Link>}
            >
              El reintento automático no alcanzó: revisa el error.
            </Aviso>
          </div>
        )}
        <div className="anim-sube flex flex-wrap items-center justify-between gap-x-4 gap-y-3" style={{ "--i": 2 } as CSSProperties}>
          {/* `useSearchParams` (en las pestañas) exige un <Suspense>. Como el layout es
              dinámico nunca llega a mostrarse el respaldo; `null` basta. */}
          {/* En celular y tablet las pestañas van abajo (`PestanasComprobantesMovil`); arriba queda la búsqueda. */}
          <div className="max-lg:hidden" data-guia="comprobantes.pestanas">
            <Suspense fallback={null}>
              <FacturacionPestanas conteos={conteos} />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <PestanasComprobantesMovil conteos={conteos} />
          </Suspense>
          <CajaDeBusqueda />
        </div>
        {children}
      </div>
    </BusquedaFacturacionContext.Provider>
  );
}
