// Carga de Rótulos de anaquel: el loader global (ADR-0149) y la silueta de la vista previa debajo.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingRotulos() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando rótulos de anaquel">
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-sand" />
          <div className="h-7 w-64 rounded bg-sand" />
          <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
        </div>
        <div className="flex flex-wrap gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="h-[62mm] w-[100mm] max-w-full rounded bg-sand/50" />
          ))}
        </div>
      </div>
    </>
  );
}
