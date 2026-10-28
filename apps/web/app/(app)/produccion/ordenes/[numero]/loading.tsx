// Carga de la página de una orden: el loader global (ADR-0149) y la silueta de la cabecera, las fases y los bloques debajo.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingOrdenProduccion() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando la orden">
        <div className="space-y-2">
          <div className="h-3 w-40 rounded bg-sand" />
          <div className="h-10 w-56 rounded bg-sand" />
          <div className="h-3 w-80 max-w-full rounded bg-sand/70" />
        </div>
        <div className="h-24 rounded-2xl bg-sand/50" />
        <div className="grid gap-6 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-sand/50" />
          ))}
        </div>
      </div>
    </>
  );
}
