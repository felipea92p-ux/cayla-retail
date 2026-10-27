import { Flag } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";

// La ronda recién abierta, en PC (Felipe 2026-10-26: «cuando no hay nada se ve feo»). Sin compras, gastos, plata ni envíos, las dos columnas de
// la derecha eran dos renglones sueltos con mucho vacío entre ellos. Aquí es UN solo bloque, que dice cómo sigue la ronda en tres pasos (los
// mismos del camino de arriba). Solo desde `lg`: en el celular cada lista conserva su frase de siempre. Se lee, no se toca: las acciones están
// a la izquierda.
const PASOS = [
  { n: 1, titulo: "Anota la plata", texto: "Lo que te dieron para comprar: «Me dieron plata»." },
  { n: 2, titulo: "Registra lo que compras", texto: "«Compré ropa» y, si no es ropa, «Gasté en otra cosa»." },
  { n: 3, titulo: "Manda a la tienda", texto: "Cada envío sale con su código para avisar a la tienda." },
] as const;

/** Sin ninguna ronda en su historia (una compradora nueva), en PC: dice qué es una ronda y por dónde empezar, en vez de dejar la columna en
 *  blanco (Felipe 2026-10-27). El camino de la izquierda ya cuenta los pasos: aquí no se repiten. */
export function PrimeraRonda() {
  return (
    <div className="card-cayla hidden p-6 lg:block">
      <Vacio icono={<Flag aria-hidden />} titulo="Aquí van a vivir tus rondas de compras">
        Cada salida a comprar es una ronda con su número. Ábrela al salir, anota lo que compras y gastas, y ciérrala al volver: aquí queda la cuenta de cada una.
      </Vacio>
    </div>
  );
}

export function RondaVacia({ texto }: { texto: string }) {
  return (
    <div className="card-cayla hidden p-6 lg:block">
      <Vacio
        icono={<Flag aria-hidden />}
        titulo={`Tu ronda ${texto} recién empieza`}
        detalle={
          <ol className="mt-1 grid w-full max-w-3xl grid-cols-1 gap-4 xl:grid-cols-3 text-left">
            {PASOS.map((p) => (
              <li key={p.n} className="flex flex-col gap-1.5">
                <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-hueso text-xs font-semibold text-taupe">
                  {p.n}
                </span>
                <b className="text-sm font-medium text-tinta">{p.titulo}</b>
                <span className="text-[13px] text-taupe">{p.texto}</span>
              </li>
            ))}
          </ol>
        }
      >
        Aquí van a aparecer tus compras, tus gastos y tus envíos con su código.
      </Vacio>
    </div>
  );
}
