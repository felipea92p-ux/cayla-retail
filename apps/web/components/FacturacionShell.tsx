"use client";

import { Suspense, useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ConteosPestanas } from "@/lib/facturacion-reglas";
import { AccionesFacturacionContext } from "@/lib/useFacturacionAcciones";
import { BusquedaFacturacionContext } from "@/lib/useFacturacionBusqueda";
import { avisar } from "@/components/ui/Avisos";
import { NuevaProformaModal } from "@/components/NuevaProformaModal";
import { CajaDeBusqueda, FacturacionCabecera, type CifrasCabecera } from "@/components/FacturacionCabecera";
import { FacturacionPestanas } from "@/components/FacturacionPestanas";

type Tienda = { id: string; nombre: string };

// El marco de /vender/comprobantes (ADR-0124; «Facturación» hasta 2026-09-22): cabecera, pestañas y el modal de
// «Nueva proforma». Es el padre con estado (molde de ADR-0043): guarda si el modal está abierto y le da a la
// vista Proformas, por contexto, la forma de abrirlo. El modal se dibuja UNA vez acá — y siempre montado —,
// fuera de `.tema-vidrio`, para que su overlay cubra la ventana y no un contenedor. «Emitir comprobante»
// (manual) se quitó el 2026-09-22: cada venta declara su comprobante sola al cobrar (D-60).
//
// `tiendas` llega `null` cuando el layout no pudo leerlas (dato del marco, `tolerar`: si falla, el marco
// sigue vivo). Sin tiendas no hay dónde crear la proforma, así que el modal no se abre y se avisa.
//
// También guarda el texto de la caja de búsqueda de la cabecera (cada lista lo lee con
// `useFacturacionBusqueda` y filtra sus filas). El texto es de UNA vista: se guarda junto a la ruta
// en que se escribió y, si la ruta cambia, ya no cuenta — así se borra solo al cambiar de vista, sin
// un efecto que lo reponga.
export function FacturacionShell({
  conteos,
  atrasadosEnCola,
  entorno,
  cifras,
  sede,
  tiendas,
  ubicacionActualId,
  children,
}: {
  conteos: ConteosPestanas;
  /** Comprobantes que llevan más de 1 hora en la cola de SUNAT: el aviso de arriba (D-60). */
  atrasadosEnCola: number;
  /** Adónde va el envío automático a SUNAT: la cabecera avisa «pruebas» si es el sandbox. */
  entorno: "sandbox" | "produccion";
  cifras: CifrasCabecera;
  sede: string;
  tiendas: Tienda[] | null;
  ubicacionActualId: string;
  children: ReactNode;
}) {
  const [proformaAbierta, setProformaAbierta] = useState(false);
  const cerrar = useCallback(() => setProformaAbierta(false), []);

  const abrirProforma = useCallback(() => {
    if (!tiendas) {
      avisar.error("No se pudieron cargar las tiendas", { detalle: "Recarga la página para crear una proforma." });
      return;
    }
    setProformaAbierta(true);
  }, [tiendas]);

  const acciones = useMemo(() => ({ abrirProforma }), [abrirProforma]);

  const ruta = usePathname();
  const [busqueda, setBusqueda] = useState({ ruta, texto: "" });
  const texto = busqueda.ruta === ruta ? busqueda.texto : "";
  const setTexto = useCallback((nuevo: string) => setBusqueda({ ruta, texto: nuevo }), [ruta]);
  const buscar = useMemo(() => ({ texto, setTexto }), [texto, setTexto]);

  return (
    <AccionesFacturacionContext.Provider value={acciones}>
      <BusquedaFacturacionContext.Provider value={buscar}>
        {/* El mismo ritmo que Cambios, Devoluciones, Caja e Historial (`space-y-7`) y la misma entrada en
            cascada: la cabecera y su resumen (0 y 1), la fila de las pestañas con la búsqueda (2) y, debajo, la
            vista, que empieza en 2 y escalona sus tarjetas y paneles hacia abajo. */}
        <div className="tema-vidrio space-y-7">
          <FacturacionCabecera sede={sede} cifras={cifras} entorno={entorno} />
          {/* D-60: si algo pasa más de una hora sin llegar a SUNAT, el reintento solo no alcanzó — se dice
              arriba, en todas las vistas, con el camino a la cola. */}
          {atrasadosEnCola > 0 && (
            <Link
              href="/vender/comprobantes/por-reintentar"
              role="alert"
              className="anim-sube flex items-center justify-between gap-3 rounded-[12px] border border-rojo/30 bg-rojo/[0.06] px-4 py-3 text-[14px] text-rojo-profundo outline-none transition-colors duration-200 hover:bg-rojo/[0.1] focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
              style={{ "--i": 1 } as CSSProperties}
            >
              <span>
                <b className="font-semibold">
                  {atrasadosEnCola === 1 ? "1 comprobante lleva" : `${atrasadosEnCola} comprobantes llevan`} más de 1 hora sin llegar a SUNAT.
                </b>{" "}
                El reintento automático no alcanzó: revisa el error.
              </span>
              <span className="shrink-0 font-semibold">Ver la cola →</span>
            </Link>
          )}
          <div className="anim-sube flex flex-wrap items-center justify-between gap-x-4 gap-y-3" style={{ "--i": 2 } as CSSProperties}>
            {/* `useSearchParams` (en las pestañas) exige un <Suspense>. Como el layout es
                dinámico nunca llega a mostrarse el respaldo; `null` basta. */}
            <Suspense fallback={null}>
              <FacturacionPestanas conteos={conteos} />
            </Suspense>
            <CajaDeBusqueda />
          </div>
          {children}
        </div>
      </BusquedaFacturacionContext.Provider>

      {tiendas && <NuevaProformaModal abierto={proformaAbierta} onCerrar={cerrar} ubicaciones={tiendas} ubicacionActualId={ubicacionActualId} />}
    </AccionesFacturacionContext.Provider>
  );
}
