import { Check } from "lucide-react";

/* ====================================================================
   PasosConteo · dónde vas: Contar · Revisar · Confirmar
   (Inventario ▸ Conteo, rediseño 2026-09-29; plano en el kit de Conteo)

   Un conteo tiene tres pantallas propias y siempre en este orden: se cuenta, se revisa lo que no coincide y se
   confirma lo que se va a actualizar. Este indicador solo ORIENTA: dice cuál es la de hoy. No es un asistente:
   no se toca (cada pantalla trae sus botones «Volver a contar» / «Volver a revisar») y no lleva animación ni hilo.
   Los pasos hechos van rellenos de tinta con su tilde, el de hoy con borde de tinta y letra gruesa, los que faltan
   en sand. Ni verde ni rojo: verde es «correcto» en la lista y rojo es «diferencia»; un paso no es ninguna de las dos.

   El resultado («Conteo terminado») y el conteo cancelado NO llevan este indicador: ya no hay a dónde ir.

   Accesibilidad: una lista ordenada dentro de un `nav` con nombre; el paso de hoy es `aria-current="step"` y cada uno
   dice su estado con texto para el lector de pantalla («Hecho», «Paso actual», «Falta»), porque el relleno no le llega.
   «Paso 2 de 3» se ve desde 640 px de ventana y, en el celular —donde los tres nombres ya llenan la línea—, lo lee
   el lector de pantalla. Sin estado ni efectos: sirve en Server Components.
   ==================================================================== */

export type PasoConteo = "contar" | "revisar" | "confirmar";

const PASOS: readonly { clave: PasoConteo; nombre: string }[] = [
  { clave: "contar", nombre: "Contar" },
  { clave: "revisar", nombre: "Revisar" },
  { clave: "confirmar", nombre: "Confirmar" },
];

type EstadoPaso = "hecho" | "actual" | "falta";

const MARCA: Record<EstadoPaso, string> = {
  hecho: "border-tinta bg-tinta text-crema",
  actual: "border-2 border-tinta bg-papel font-semibold text-tinta",
  falta: "border-sand bg-papel text-taupe",
};

const NOMBRE: Record<EstadoPaso, string> = {
  hecho: "text-tinta/75",
  actual: "font-semibold text-tinta",
  falta: "text-taupe",
};

// Lo que un lector de pantalla dice de cada paso: el relleno y el borde no le llegan.
const LEIDO: Record<EstadoPaso, string> = { hecho: "Hecho.", actual: "Paso actual.", falta: "Falta." };

export function PasosConteo({ actual, className = "" }: { actual: PasoConteo; className?: string }) {
  const indice = PASOS.findIndex((p) => p.clave === actual);
  return (
    <nav aria-label="Pasos del conteo" className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${className}`}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {PASOS.map((p, i) => {
          const estado: EstadoPaso = i < indice ? "hecho" : i === indice ? "actual" : "falta";
          return (
            <li key={p.clave} aria-current={estado === "actual" ? "step" : undefined} className="flex items-center gap-2">
              {/* El trazo que une un paso con el anterior: relleno si ese paso ya se hizo. */}
              {i > 0 && <span aria-hidden className={`h-px w-3 sm:w-6 ${i <= indice ? "bg-tinta/40" : "bg-sand"}`} />}
              <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums ${MARCA[estado]}`}>
                {estado === "hecho" ? <Check strokeWidth={2.4} className="h-3 w-3" /> : i + 1}
              </span>
              <span className={`text-sm ${NOMBRE[estado]}`}>{p.nombre}</span>
              <span className="sr-only">{LEIDO[estado]}</span>
            </li>
          );
        })}
      </ol>
      <p className="whitespace-nowrap text-xs tabular-nums text-taupe max-sm:sr-only">
        Paso {indice + 1} de {PASOS.length}
      </p>
    </nav>
  );
}
