// Mientras se leen las fotos del probador: el loader general (ADR-0149) y la silueta de la pantalla —cabecera, pestañas, tres cifras y la
// hoja de contactos—, para que no salte de «vacía» a «todo de golpe».
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingVitrinaProbador() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando las fotos del probador">
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-56 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[26rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="h-10 w-72 rounded-full bg-sand/60" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-[20px] bg-sand/50" />
          ))}
        </div>
        <div className="card-cayla">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-sand p-4">
            <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
            <div className="ml-auto h-10 w-44 rounded-md bg-sand/70" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 p-4 sm:p-5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="aspect-[4/5] rounded-xl bg-sand/50" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
