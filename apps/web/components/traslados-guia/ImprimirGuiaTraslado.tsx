"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { HojaGuia } from "@/components/traslados-guia/HojaGuia";
import {
  CLAVE_FORMATO_GUIA,
  FORMATOS_GUIA,
  leerFormatoGuia,
  textoImprimirGuia,
  urlDelQrDeLaGuia,
  type FormatoGuia,
  type GuiaTraslado,
} from "@/lib/traslados-guia-reglas";

const sinSuscripcion = () => () => {};
const formatoGuardado = (): FormatoGuia => {
  try {
    return leerFormatoGuia(localStorage.getItem(CLAVE_FORMATO_GUIA));
  } catch {
    return "termica";
  }
};

/**
 * Imprimir la guía de una caja (ADR-0242 D-3): eliges la hoja (térmica o A4, se recuerda por computadora), ves el papel tal cual
 * sale e imprimes. La hoja de impresión (`#guia-traslado-print`) va pegada a <body> con un portal, como las etiquetas de precio:
 * queda montada siempre, así Ctrl+P también imprime la guía y no la pantalla.
 */
export function ImprimirGuiaTraslado({ guia, sede, volver }: { guia: GuiaTraslado; sede: string; /** La flecha de vuelta al pase de la caja (la arma la página). */ volver: ReactNode }) {
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => null);
  const [elegido, setElegido] = useState<FormatoGuia | null>(null);
  const formato = elegido ?? (montado ? formatoGuardado() : "termica");
  const elegir = (f: FormatoGuia) => {
    setElegido(f);
    try {
      localStorage.setItem(CLAVE_FORMATO_GUIA, f);
    } catch {}
  };
  const urlQr = origen ? urlDelQrDeLaGuia(origen, guia.id) : null;

  if (guia.porQueNo) {
    return <EncabezadoPagina sede={sede} titulo={`Guía de la caja Nº ${guia.numero}`} subtitulo={guia.porQueNo} volver={volver} />;
  }

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo={`Guía de la caja Nº ${guia.numero}`}
        subtitulo="Pégala en la caja: quien la recibe escanea el QR y cuenta ahí mismo."
        volver={volver}
        acciones={
          <button type="button" className="btn-cayla btn-primario" onClick={() => window.print()} disabled={!urlQr}>
            <Printer aria-hidden strokeWidth={1.7} className="h-4 w-4" /> {textoImprimirGuia(formato)}
          </button>
        }
      />

      {guia.yaLlego && <p className="nota-cayla">Esta caja ya llegó a {guia.a}: la guía ya no sirve para contar. Puedes reimprimirla como copia.</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm text-taupe" role="group" aria-label="Dónde la imprimes">
        <span>¿Dónde la imprimes?</span>
        {FORMATOS_GUIA.map((f) => (
          <button key={f.id} type="button" className="pildora-cayla" aria-pressed={formato === f.id} onClick={() => elegir(f.id)} title={f.detalle}>
            {f.texto}
          </button>
        ))}
      </div>

      <section aria-label="Así sale" className="flex justify-center rounded-xl border border-sand bg-papel p-4 sm:p-6">
        <div className="max-w-full shadow-[0_12px_32px_-20px_color-mix(in_srgb,var(--color-sombra)_45%,transparent)]">
          <HojaGuia guia={guia} formato={formato} urlQr={urlQr} />
        </div>
      </section>

      <p className="nota-cayla">
        La guía no dice cuántas prendas van, a propósito: quien recibe cuenta sin saberlo, así nada se da por llegado sin verlo.
      </p>

      {montado &&
        createPortal(
          <div id="guia-traslado-print" className="papel-fijo" data-formato={formato} aria-hidden>
            <HojaGuia guia={guia} formato={formato} urlQr={urlQr} />
          </div>,
          document.body,
        )}
    </div>
  );
}
