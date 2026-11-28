import type { ReactNode } from "react";
import { cuentaEnFrase, fraseDeCuenta, type QueSeCuenta } from "../../lib/cuenta-en-frase";
import { TituloSeccion } from "./TituloSeccion";

/* ====================================================================
   CabeceraConCuenta: el nombre de un grupo y su cuenta dicha como frase (ADR-0716, Felipe 2026-11-27)

   Caso 3 de la regla «Separar sin punto». El nombre y la cuenta son datos de distinta clase: el nombre va a la izquierda como título
   y la cuenta a la derecha, dicha como se habla («7 casos, todos de prioridad alta»), con lo urgente en su color. Felipe eligió la
   frase y no un contador en pastilla. Así no quedan «AQP 7 casos 7 altas» pegados ni «Tienda Arequipa · 7 casos».

   No es otro título: es `<TituloSeccion>` (la serif de 21 px, decidida en la ronda 7 de /unificar) con la frase en su lado derecho
   (`dato`, «lo que resume el bloque»). El globito pegado al nombre (`cuenta`) sigue siendo la forma de un conteo pelado, cuando el
   nombre ya dice qué se cuenta («Pendientes 3»). La frase va cuando la cuenta necesita palabras: lo que cuenta no es lo que dice el
   título, o trae su parte urgente.

   `<CuentaEnFrase>` es la frase sola, para ponerla donde otra pieza ya tiene su lado derecho (el `total` de `<SeparadorDia>`).
   El texto sale de `lib/cuenta-en-frase.ts`, puro y con su prueba. Viaja a CAYLA Dynamic (docs/familia/README.md).
   ==================================================================== */

export interface CuentaDeGrupo {
  total: number;
  /** Cuántos son urgentes: se dicen aparte y en rojo profundo. 0 u omitido: ninguno. */
  urgentes?: number;
  /** Qué se cuenta: `{ singular: "caso", plural: "casos", genero: "m" }`. */
  que: QueSeCuenta;
  /** Cómo se dice lo urgente: «de prioridad alta», «vencidas». */
  comoEsUrgente?: string;
}

/** «7 casos, todos de prioridad alta», con lo urgente en rojo profundo. */
export function CuentaEnFrase({ total, urgentes = 0, que, comoEsUrgente = "" }: CuentaDeGrupo) {
  const dicha = cuentaEnFrase(total, comoEsUrgente ? urgentes : 0, que, comoEsUrgente);
  return (
    <span className="tabular-nums" title={fraseDeCuenta(dicha)}>
      {dicha.cuenta}
      {dicha.urgente && (
        <>
          {", "}
          <span className="font-semibold text-rojo-profundo">{dicha.urgente}</span>
        </>
      )}
    </span>
  );
}

export function CabeceraConCuenta({
  children,
  codigo,
  cuenta,
  nivel = 3,
  id,
  className = "",
}: {
  /** El nombre del grupo: «Tienda Arequipa». */
  children: ReactNode;
  /** Un código corto que acompaña al nombre («AQP»): chico y en el tono secundario, pegado a él. */
  codigo?: string;
  cuenta: CuentaDeGrupo;
  nivel?: 2 | 3 | 4;
  id?: string;
  className?: string;
}) {
  return (
    <TituloSeccion nivel={nivel} id={id} className={className} dato={<CuentaEnFrase {...cuenta} />}>
      {children}
      {codigo && <span className="ml-2 font-sans text-xs font-medium tracking-[0.06em] text-secundario">{codigo}</span>}
    </TituloSeccion>
  );
}
