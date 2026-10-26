// Mientras se lee el Resumen de Tienda web (ADR-0430): el loader general (ADR-0149) y la silueta de la pantalla en el orden de la propuesta A
// —cabecera, lo que pide hoy, el camino de los pedidos y la ventana de la vitrina—, para que no salte de «vacía» a «todo de golpe» (ADR-0445).
// Las pantallas de este grupo que tienen su propio loading.tsx (Pedidos, Vitrina, Campañas, Datos y plazos, Recomendaciones) no usan este.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingResumenTiendaWeb() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-8" aria-busy="true" aria-label="Cargando el resumen de la tienda web">
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-48 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[30rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="space-y-3">
          <div className="h-5 w-44 rounded bg-sand" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[68px] rounded-2xl bg-sand/50" />
          ))}
        </div>
        <div className="h-12 rounded-2xl bg-sand/50" />
        <div className="card-cayla max-w-3xl overflow-hidden">
          <div className="h-11 border-b border-sand bg-sand/40" />
          <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-6 sm:gap-2.5 sm:p-4">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className={`aspect-[3/4] rounded-xl bg-sand/60 ${i >= 6 ? "hidden sm:block" : ""}`} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
