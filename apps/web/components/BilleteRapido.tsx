"use client";

/** Un billete de verde salvia muy suave, el mismo para toda denominación: la sección tiene que
 *  verse sobria junto al resto del sistema (crema, tinta y un solo acento), no un puñado de
 *  billetes de colores. Lo único que cambia es el número. El texto (#4a5732) sobre el fondo
 *  (#e6ebdb) da 6:1. */
const SALVIA = "#e6ebdb";
const OLIVO = "#4a5732";
const HILO_OLIVO = "#aebb95";

/** Las líneas finas cruzadas de un billete (la «guilloche»), casi invisibles. */
const TRAMA_BILLETE = "repeating-linear-gradient(135deg, rgb(74 87 50 / 0.05) 0 1px, transparent 1px 4px)";

/** Un billete que SUMA su valor a lo recibido al tocarlo (S/100 + S/50 = 150). Se levanta un
 *  poco al pasar el cursor y se aplasta al tocarlo, como un billete de verdad. */
export function BilleteRapido({ valor, onSumar, disabled }: { valor: number; onSumar: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onSumar}
      disabled={disabled}
      aria-label={`Sumar S/${valor}`}
      className="transition-transform hover:-translate-y-0.5 hover:-rotate-1 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:rotate-0"
    >
      <span
        style={{ backgroundColor: SALVIA, backgroundImage: TRAMA_BILLETE, borderColor: HILO_OLIVO, color: OLIVO, outlineColor: `${HILO_OLIVO}99` }}
        className="font-display relative flex h-10 items-center justify-center rounded-[5px] border pl-2.5 text-[18px] leading-none outline-1 -outline-offset-[4px]"
      >
        {/* El óvalo del costado, como el retrato de un billete. */}
        <span aria-hidden style={{ borderColor: HILO_OLIVO }} className="absolute top-1/2 left-1.5 h-2.5 w-1.5 -translate-y-1/2 rounded-full border" />
        {valor}
        <span aria-hidden className="absolute right-1.5 bottom-1 font-sans text-[8px] opacity-70">
          S/
        </span>
      </span>
    </button>
  );
}
