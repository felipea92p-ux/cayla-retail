import { TEXTO_PASO_COBRO, type PasoCobro } from "@/lib/vender-reglas";

const ORDEN: PasoCobro[] = ["medio", "recibido", "comprobante"];

/** La barra de tres tramos del cobro (medio → recibido → comprobante) y, debajo, en una línea, lo
 *  que toca ahora. Lo hecho se pone verde, lo que toca dorado y lo que falta queda en arena. Sin
 *  efectivo el tramo del recibido se da por hecho: el paso salta del medio al comprobante.
 *  Solo guía (`pasoDelCobro`); no bloquea nada. */
export function PasosCobro({ paso }: { paso: PasoCobro }) {
  const actual = ORDEN.indexOf(paso);
  return (
    <div>
      <div aria-hidden className="flex gap-1.5">
        {ORDEN.map((p, i) => (
          <span
            key={p}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              i < actual ? "bg-verde" : i === actual ? "bg-[color:var(--color-metodo-efectivo)]" : "bg-sand"
            }`}
          />
        ))}
      </div>
      <p role="status" className="mt-2 text-[13px] text-taupe-profundo">
        {TEXTO_PASO_COBRO[paso]}
      </p>
    </div>
  );
}
