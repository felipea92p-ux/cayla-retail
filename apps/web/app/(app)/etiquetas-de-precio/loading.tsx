// Carga de Etiquetas de precio: el loader global (ADR-0149) y la silueta de la tabla debajo.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingEtiquetasDePrecio() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando etiquetas de precio">
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-sand" />
          <div className="h-7 w-64 rounded bg-sand" />
          <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
        </div>
        <div className="card-cayla space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-sand/50" />
          ))}
        </div>
      </div>
    </>
  );
}
