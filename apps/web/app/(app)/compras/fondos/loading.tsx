// Esqueleto de Fondos por rendir: la cabecera, tres cifras y dos tablas, con las mismas formas que la pantalla real para que al llegar
// los datos nada se corra. El loader global (ADR-0149) va encima; el destello `cmp-sk` es el de todo Compras.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingFondos() {
  return (
    <>
      <EsperaPantalla />
      <div className="space-y-6" aria-busy="true" aria-label="Cargando los fondos">
        <div className="space-y-2">
          <div className="cmp-sk h-3 w-16" />
          <div className="cmp-sk h-7 w-64" />
          <div className="cmp-sk h-3 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`card-cayla space-y-2 p-4 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
              <div className="cmp-sk h-3 w-20" />
              <div className="cmp-sk h-7 w-32" />
              <div className="cmp-sk h-3 w-24" />
            </div>
          ))}
        </div>
        {[4, 5].map((n, t) => (
          <div key={t} className="card-cayla divide-y divide-tinta/10">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="cmp-sk h-3 w-1/4" />
                <div className="cmp-sk h-3 flex-1" />
                <div className="cmp-sk h-3 w-20" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
