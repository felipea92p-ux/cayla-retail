// Carga de la guía de una caja: el loader global (ADR-0149) y la silueta del papel debajo.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingGuiaTraslado() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando la guía de la caja">
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-sand" />
          <div className="h-9 w-72 max-w-full rounded bg-sand" />
          <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
        </div>
        <div className="flex justify-center rounded-xl border border-sand bg-papel p-6">
          <div className="h-96 w-72 max-w-full rounded bg-sand/50" />
        </div>
      </div>
    </>
  );
}
