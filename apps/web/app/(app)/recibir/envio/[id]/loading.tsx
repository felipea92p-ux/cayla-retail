// Esqueleto de carga de «Recibir ENV-…»: la silueta de la pantalla (la cabecera y dos tarjetas de línea con su matriz) en gris mientras la
// base responde. Sin texto: la forma ya dice qué viene. El loader de toda la app lo pone `<EsperaPantalla />` (ADR-0149).
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingRecibirEnvio() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando el envío">
        <div className="space-y-2">
          <div className="h-3 w-40 rounded bg-sand" />
          <div className="h-9 w-72 max-w-full rounded bg-sand" />
          <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="card-cayla space-y-4 p-5">
            <div className="h-5 w-56 rounded bg-sand" />
            <div className="h-3 w-40 rounded bg-sand/70" />
            <div className="h-32 rounded-xl bg-sand/50" />
          </div>
        ))}
      </div>
    </>
  );
}
