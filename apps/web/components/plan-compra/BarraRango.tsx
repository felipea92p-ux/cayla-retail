import { BarraApilada } from "@/components/ui/BarraApilada";
import { enteroES, escalaDeRango, posicionEnEscala, type Calculo, type LineaPlan } from "@/lib/plan-compra-reglas";

// La barra de rango de una categoría del plan de campaña (ADR-0349; maqueta docs/maquetas/plan-de-campana-2026-10/): sustituye
// «flojo · normal · bueno» en texto por algo que se lee de un vistazo, todo sobre UNA misma escala:
//   · abajo, la barra apilada del sistema (`BarraApilada`): verde = lo que YA HAY, negro = lo que HAY QUE COMPRAR;
//   · arriba, una banda clara del diciembre flojo al bueno y una marca en el normal: lo que se supone que se venderá;
//   · en la campaña y después, un rombo con lo que se vendió de verdad, sobre la misma escala.
// Debajo van los tres números, porque una barra sola no se lee: lo que dice el dibujo se dice también en texto (y para el lector de
// pantalla, en una sola frase). Entra creciendo de izquierda a derecha una vez (ADR-0136); sin JavaScript propio.
//
// Todo son `span`: vive dentro del botón de una fila, donde un `div` no es válido.

export function BarraRango({
  linea,
  calculo,
  vendido = 0,
  retraso = 0,
}: {
  linea: Pick<LineaPlan, "flojo" | "normal" | "bueno">;
  calculo: Calculo;
  /** Lo que se vendió dentro de la campaña; 0 antes de que empiece (no se dibuja el rombo). */
  vendido?: number;
  /** Cuántos pasos de 38 ms espera para entrar (la fila que entra escalonada). */
  retraso?: number;
}) {
  const escala = escalaDeRango(linea, calculo, vendido);
  const pos = (v: number) => posicionEnEscala(v, escala);
  const dice =
    `Flojo ${linea.flojo}, normal ${linea.normal}, bueno ${linea.bueno}. Ya hay ${calculo.stock}. Comprar ${calculo.comprar}.` + (vendido > 0 ? ` Se vendieron ${vendido}.` : "");
  return (
    <span role="img" aria-label={dice} className="block min-w-0">
      <span aria-hidden className="relative block h-2">
        <span
          className="anim-crece-x absolute inset-y-0.5 rounded-full bg-taupe/30"
          style={{ left: `${pos(linea.flojo)}%`, width: `${pos(linea.bueno) - pos(linea.flojo)}%`, ["--i" as string]: retraso }}
        />
        <span className="absolute -inset-y-px w-0.5 -translate-x-1/2 rounded-full bg-taupe" style={{ left: `${pos(linea.normal)}%` }} />
      </span>
      <span aria-hidden className="relative mt-1.5 block">
        <BarraApilada
          decorativa
          alto={8}
          total={escala}
          retraso={retraso}
          segmentos={[
            { clave: "hay", nombre: "Ya hay", valor: calculo.stock, clase: "bg-verde" },
            { clave: "comprar", nombre: "Comprar", valor: calculo.comprar, clase: "bg-tinta" },
          ]}
        />
        {vendido > 0 && (
          <span
            className="absolute top-1/2 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-pizarra ring-2 ring-papel"
            style={{ left: `${pos(vendido)}%` }}
          />
        )}
      </span>
      <span aria-hidden className="mt-1 block text-xs tabular-nums text-tinta/70">
        {enteroES.format(linea.flojo)} · <b className="font-semibold text-tinta">{enteroES.format(linea.normal)}</b> · {enteroES.format(linea.bueno)}
      </span>
    </span>
  );
}

/** La leyenda de la barra (una línea sobre la tabla): qué es cada color y cada marca. */
export function LeyendaRango({ conVendido }: { conVendido: boolean }) {
  const item = "inline-flex items-center gap-1.5";
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-tinta/70">
      <span className="text-taupe-profundo">Cómo leer la barra:</span>
      <span className={item}>
        <i aria-hidden className="inline-block h-2 w-4 rounded-full bg-verde" />
        Ya hay
      </span>
      <span className={item}>
        <i aria-hidden className="inline-block h-2 w-4 rounded-full bg-tinta" />
        Comprar
      </span>
      <span className={item}>
        <i aria-hidden className="inline-block h-1.5 w-4 rounded-full bg-taupe/30" />
        Del flojo al bueno
      </span>
      <span className={item}>
        <i aria-hidden className="inline-block h-3 w-0.5 rounded-full bg-taupe" />
        Normal
      </span>
      {conVendido && (
        <span className={item}>
          <i aria-hidden className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-pizarra" />
          Lo que se vendió
        </span>
      )}
    </p>
  );
}
