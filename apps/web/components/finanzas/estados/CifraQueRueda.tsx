import type { CSSProperties } from "react";
import { soles } from "@/lib/flujo-caja-reglas";

const CIFRAS = "0123456789";

/**
 * La cifra grande de Estados financieros (ADR-0611): cada dígito es una columna del 0 al 9 que rueda una vez hasta su lugar, con CSS y sin JavaScript. El HTML ya trae
 * el dígito correcto: sin animación, o antes de que corra, nunca se ve un cero que no es. Lo que lee un lector de pantalla es la cifra entera.
 */
export function CifraQueRueda({ valor, mal, conSigno, className = "" }: { valor: number; mal?: boolean; conSigno?: boolean; className?: string }) {
  const entero = Math.round(valor);
  const texto = Math.abs(entero).toLocaleString("en-US");
  const total = [...texto].filter((c) => c !== ",").length;
  let n = 0;
  return (
    <p className={`estados-cifra tabular-nums ${className}`} data-mal={mal || undefined}>
      <span className="sr-only">{soles(entero)}</span>
      <span aria-hidden className="estados-cifra-marco">
        {(entero < 0 || conSigno) && <span className="estados-cifra-signo">{entero < 0 ? "−" : "+"}</span>}
        <span className="estados-cifra-moneda">S/</span>
        {[...texto].map((c, i) => {
          if (c === ",")
            return (
              <span key={i} className="estados-cifra-coma">
                ,
              </span>
            );
          n += 1;
          return (
            <span key={i} className="estados-cifra-digito" style={{ "--y": `${-Number(c) * 10}%`, "--d": `${(total - n) * 16}ms` } as CSSProperties}>
              <span>
                {[...CIFRAS].map((x) => (
                  <i key={x}>{x}</i>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </p>
  );
}
