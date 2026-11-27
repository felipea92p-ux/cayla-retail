import type { ReactNode } from "react";
import { Users } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { ListaCompradores } from "./ListaCompradores";
import { enLaCalle, filasDeCompradores, type CompradorSinRonda, type RondaDeCompras } from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";

// Lo que se DIBUJA de Compras ▸ Compradores (ADR-0704, act. 2026-11-26 d, «como tu banco»): arriba, UNA cifra —la plata de CAYLA que está en
// manos de la gente—; debajo, una línea por persona con lo que le queda. Felipe (2026-11-26): «solo datos necesarios que realmente aporten, con
// palabras precisas, sin tanto texto, e intuitiva». La página lee y esta vista dibuja (así se prueba con datos inventados); las cuentas viven
// en `lib/compradores-reglas.ts` y lo que se toca (filtros, buscador, «Ver más») en `ListaCompradores`.
// `rondas = null`: no se pudo leer, y lo dice. `entregar` y `porDefinir` son piezas de cliente que arma la página.

export function CompradoresVista({
  rondas,
  sinRonda,
  hoy,
  entregar,
  porDefinir,
  rendiciones,
}: {
  rondas: RondaDeCompras[] | null;
  /** Quien tiene plata en la mano y todavía no abrió su ronda. Sin el dato (no se pudo leer), la lista sale solo con las rondas. */
  sinRonda?: CompradorSinRonda[] | null;
  hoy: string;
  entregar?: ReactNode;
  porDefinir?: ReactNode;
  /** Las rendiciones de fondo por aprobar (ADR-0362), solo si hay alguna. */
  rendiciones?: ReactNode;
}) {
  const filas = filasDeCompradores(rondas ?? [], sinRonda ?? [], hoy);
  const calle = enLaCalle(filas);

  return (
    <div className="space-y-7">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Compradores"
        subtitulo="Quién tiene plata de CAYLA y cuánto le queda."
        ayuda="Cada persona recibe plata, abre su ronda en «Mis compras» y anota lo que compra. Aquí ves cuánto le queda a cada una. Toca a una persona para ver, día por día, lo que le diste y lo que compró."
        acciones={entregar}
      />

      {rondas === null ? (
        <Aviso tono="error" titulo="No se pudo leer quién está comprando">
          Vuelve a intentarlo en un momento.
        </Aviso>
      ) : (
        <>
          <div data-guia="compradores.cifras" className="px-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-secundario">En la calle</span>
            <span className="font-display mt-1 block text-5xl leading-none tabular-nums text-tinta sm:text-[3.5rem]">{soles(calle.total)}</span>
            <span className="mt-2 block text-sm text-secundario">
              {calle.personas === 0 ? "Nadie tiene plata en la mano" : `En manos de ${calle.personas} ${calle.personas === 1 ? "persona" : "personas"}`}
            </span>
          </div>

          {rendiciones}

          {filas.length === 0 ? (
            <div className="card-cayla">
              <Vacio icono={<Users />} titulo="Nadie tiene plata ni compras pendientes" acciones={entregar}>
                Entrégale plata a quien va a comprar y aparece aquí.
              </Vacio>
            </div>
          ) : (
            <ListaCompradores filas={filas} />
          )}

          {/* «Por definir» va DESPUÉS de las personas (/formidable 2026-11-26): la pantalla responde primero quién tiene plata. */}
          {porDefinir}
        </>
      )}
    </div>
  );
}
