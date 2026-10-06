// Esqueleto de carga de Análisis (ADR-0356): la silueta de la pantalla —cabecera, las cuatro pestañas y las tarjetas de
// «Hoy»— para que no salte de «pantalla vacía» a «todo de golpe». El loader único (ADR-0149) va encima.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingAnalisis() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Cargando Análisis">
        {/* La silueta de `EncabezadoPagina` (ADR-0220): línea de sede y fecha, título de 46 px y la frase; a la derecha, el buscador. */}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="h-3 w-64 max-w-full rounded bg-sand" />
            <div className="mt-3 h-9 w-48 max-w-full rounded bg-sand sm:h-[46px]" />
            <div className="mt-2.5 h-3 w-[22rem] max-w-full rounded bg-sand/70" />
          </div>
          <div className="h-9 w-60 max-w-full rounded-[10px] bg-sand/70" />
        </div>
        <div className="flex items-center gap-4 border-b border-sand pb-3">
          {[48, 120, 92, 80].map((w, i) => (
            <div key={i} className="h-3.5 rounded bg-sand" style={{ width: w }} />
          ))}
          <div className="ml-auto h-6 w-32 rounded-full bg-sand/70" />
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-56 rounded-[14px] border border-sand bg-papel" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 rounded-[14px] border border-sand bg-papel" />
          ))}
        </div>
      </div>
    </>
  );
}
