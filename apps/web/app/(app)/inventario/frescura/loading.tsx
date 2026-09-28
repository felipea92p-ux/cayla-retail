// Mientras se leen las tiendas (una lectura por tienda y el registro al colgar, en paralelo): el loader general (ADR-0149)
// y la silueta de la pantalla —cabecera con sus cuatro cifras, la tarjeta con filtros y filas—, para que no salte de
// «vacía» a «todo de golpe».
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingFrescura() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando la frescura del piso">
        <div className="flex flex-wrap items-center justify-between gap-5">
          {/* La silueta de `EncabezadoPagina` (ADR-0220): sede y fecha, título de 46 px y la frase. */}
          <div>
            <div className="h-3 w-64 max-w-full rounded bg-sand" />
            <div className="mt-3 h-9 w-72 max-w-full rounded bg-sand sm:h-[46px]" />
            <div className="mt-2.5 h-3 w-[26rem] max-w-full rounded bg-sand/70" />
          </div>
          <div className="h-24 w-full rounded-[20px] bg-sand/50 lg:w-[34rem]" />
        </div>
        <div className="card-cayla divide-y divide-sand">
          <div className="flex flex-wrap gap-2.5 p-4">
            <div className="h-10 w-72 max-w-full rounded-md bg-sand/70" />
            <div className="h-10 w-52 rounded-md bg-sand/70" />
            <div className="h-10 w-56 rounded-md bg-sand/70" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="h-[42px] w-[34px] rounded-[7px] bg-sand/70" />
              <div className="space-y-1.5">
                <div className="h-3 w-44 rounded bg-sand" />
                <div className="h-2.5 w-28 rounded bg-sand/70" />
              </div>
              <div className="ml-auto hidden h-3 w-2/5 rounded bg-sand/70 md:block" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
