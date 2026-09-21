"use client";

import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { SerieComprobante } from "@/lib/comprobantes-reglas";
import type { ConteosPestanas } from "@/lib/facturacion-reglas";
import { AccionesFacturacionContext } from "@/lib/useFacturacionAcciones";
import { BusquedaFacturacionContext } from "@/lib/useFacturacionBusqueda";
import { avisar } from "@/components/ui/Avisos";
import { EmitirComprobanteModal } from "@/components/EmitirComprobanteModal";
import { NuevaProformaModal } from "@/components/NuevaProformaModal";
import { FacturacionCabecera } from "@/components/FacturacionCabecera";
import { FacturacionPestanas } from "@/components/FacturacionPestanas";

type Tienda = { id: string; nombre: string };

// El marco de /vender/facturacion (ADR-0124): cabecera, pestañas y los dos modales que se
// abren desde cualquier vista. Es el padre con estado (molde de ADR-0043): guarda cuál
// modal está abierto y les da a las vistas, por contexto, la forma de abrirlos. Los
// modales se dibujan UNA vez acá — y siempre montados (ver `EmitirComprobanteModal`),
// fuera de `.tema-vidrio`, para que su overlay cubra la ventana y no un contenedor.
//
// `series` y `tiendas` llegan `null` cuando el layout no pudo leerlas (son datos del marco,
// `tolerar`: si fallan, el marco sigue vivo). Sin ellas no hay número que reservar ni tienda
// que elegir, así que el modal no se abre y se avisa en vez de dejar un formulario roto.
//
// También guarda el texto de la caja de búsqueda de la cabecera (cada lista lo lee con
// `useFacturacionBusqueda` y filtra sus filas). El texto es de UNA vista: se guarda junto a la ruta
// en que se escribió y, si la ruta cambia, ya no cuenta — así se borra solo al cambiar de vista, sin
// un efecto que lo reponga.
export function FacturacionShell({
  conteos,
  series,
  tiendas,
  ubicacionActualId,
  children,
}: {
  conteos: ConteosPestanas;
  series: SerieComprobante[] | null;
  tiendas: Tienda[] | null;
  ubicacionActualId: string;
  children: ReactNode;
}) {
  const [modal, setModal] = useState<"emitir" | "proforma" | null>(null);
  const cerrar = useCallback(() => setModal(null), []);

  const abrirEmitir = useCallback(() => {
    if (!series || !tiendas) {
      avisar.error("No se pudieron cargar las series de comprobantes", { detalle: "Recarga la página: sin ellas no se puede emitir." });
      return;
    }
    setModal("emitir");
  }, [series, tiendas]);

  const abrirProforma = useCallback(() => {
    if (!tiendas) {
      avisar.error("No se pudieron cargar las tiendas", { detalle: "Recarga la página para crear una proforma." });
      return;
    }
    setModal("proforma");
  }, [tiendas]);

  const acciones = useMemo(() => ({ abrirEmitir, abrirProforma }), [abrirEmitir, abrirProforma]);

  const ruta = usePathname();
  const [busqueda, setBusqueda] = useState({ ruta, texto: "" });
  const texto = busqueda.ruta === ruta ? busqueda.texto : "";
  const setTexto = useCallback((nuevo: string) => setBusqueda({ ruta, texto: nuevo }), [ruta]);
  const buscar = useMemo(() => ({ texto, setTexto }), [texto, setTexto]);

  return (
    <AccionesFacturacionContext.Provider value={acciones}>
      <BusquedaFacturacionContext.Provider value={buscar}>
        <div className="tema-vidrio space-y-6">
          <FacturacionCabecera />
          {/* `useSearchParams` (en las pestañas) exige un <Suspense>. Como el layout es
              dinámico nunca llega a mostrarse el respaldo; `null` basta. */}
          <Suspense fallback={null}>
            <FacturacionPestanas conteos={conteos} />
          </Suspense>
          {children}
        </div>
      </BusquedaFacturacionContext.Provider>

      {series && tiendas && (
        <EmitirComprobanteModal abierto={modal === "emitir"} onCerrar={cerrar} series={series} ubicaciones={tiendas} ubicacionActualId={ubicacionActualId} />
      )}
      {tiendas && <NuevaProformaModal abierto={modal === "proforma"} onCerrar={cerrar} ubicaciones={tiendas} ubicacionActualId={ubicacionActualId} />}
    </AccionesFacturacionContext.Provider>
  );
}
