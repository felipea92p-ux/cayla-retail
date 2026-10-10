// Mientras se leen las tiendas (una lectura por tienda, la vara de CAYLA y el registro al colgar, en paralelo): el loader general
// (ADR-0149) y la silueta de la pantalla —cabecera con sus dos cifras, la tarjeta con el tablero, los filtros y las filas—, para que
// no salte de «vacía» a «todo de golpe». La silueta sigue la forma real (Formidable 2026-10-09: la vieja no tenía tablero y dibujaba
// miniaturas de 34×42, y la pantalla saltaba ≈350 px al cargar): el tablero ocupa ≈240 px (entre su forma compacta y la completa)
// y cada fila 89 px con el cuadrado de 60 de `MiniaturaPrenda`.
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
          {/* El tablero «Cómo está el piso»: título y cuatro filas con su barra. */}
          <div className="px-4 pb-3 pt-4 sm:px-5">
            <div className="h-5 w-48 rounded bg-sand" />
            <div className="mt-3 divide-y divide-sand">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="h-3.5 w-40 rounded bg-sand" />
                  <div className="h-3 flex-1 rounded-full bg-sand/70" />
                  <div className="hidden h-3 w-24 rounded bg-sand/60 md:block" />
                </div>
              ))}
            </div>
            <div className="mt-3 h-2.5 w-72 max-w-full rounded bg-sand/60" />
          </div>
          <div className="flex flex-wrap gap-2.5 p-4">
            <div className="h-10 w-72 max-w-full rounded-md bg-sand/70" />
            <div className="h-10 w-52 rounded-md bg-sand/70" />
            <div className="h-10 w-56 rounded-md bg-sand/70" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-[60px] w-[60px] rounded-[12px] bg-sand/70" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-44 rounded bg-sand" />
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
