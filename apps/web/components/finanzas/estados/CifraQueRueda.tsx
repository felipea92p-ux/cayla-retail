import type { CSSProperties } from "react";
import { solesCentimos } from "@/lib/flujo-caja-reglas";

const CIFRAS = "0123456789";

/**
 * La cifra grande de Estados financieros (ADR-0611): cada dígito es una columna del 0 al 9 que rueda una vez hasta su lugar, con CSS y sin JavaScript. El HTML ya trae
 * el dígito correcto: sin animación, o antes de que corra, nunca se ve un cero que no es. Lo que lee un lector de pantalla es la cifra entera.
 */
export function CifraQueRueda({ valor, mal, conSigno, className = "" }: { valor: number; mal?: boolean; conSigno?: boolean; className?: string }) {
  // Con céntimos, como el resto de Estados financieros (Felipe 2026-11-06): la coma y el punto no ruedan.
  const entero = Math.round(valor * 100) / 100;
  const texto = Math.abs(entero).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const total = [...texto].filter((c) => c !== "," && c !== ".").length;
  let n = 0;
  return (
    <p className={`estados-cifra tabular-nums ${className}`} data-mal={mal || undefined}>
      <span className="sr-only">{solesCentimos(entero)}</span>
      <span aria-hidden className="estados-cifra-marco">
        {(entero < 0 || conSigno) && <span className="estados-cifra-signo">{entero < 0 ? "−" : "+"}</span>}
        <span className="estados-cifra-moneda">S/</span>
        {[...texto].map((c, i) => {
          if (c === "," || c === ".")
            return (
              <span key={i} className="estados-cifra-coma">
                {c}
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
