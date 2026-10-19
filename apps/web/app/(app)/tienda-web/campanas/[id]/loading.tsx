// Mientras se lee la campaña: el loader general (ADR-0149) y la silueta —cabecera, pestañas, el formulario y la columna de la derecha.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingCampana() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando la campaña">
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-72 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[22rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="h-10 w-56 rounded-full bg-sand/60" />
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <div className="card-cayla h-[34rem]" />
          <div className="space-y-5">
            <div className="card-cayla h-40" />
            <div className="card-cayla h-56" />
          </div>
        </div>
      </div>
    </>
  );
}
