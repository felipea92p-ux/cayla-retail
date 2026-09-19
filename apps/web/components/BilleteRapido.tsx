"use client";

/** Verde olivo discreto, como un dólar: todos de la misma familia y un poco más oscuros mientras
 *  más vale el billete. Con texto crema pasan AA (el más claro da 4.6:1). */
const OLIVO_BILLETE: Record<number, string> = {
  10: "#66723f",
  20: "#5f6a3a",
  50: "#586235",
  100: "#515b30",
  200: "#4a532c",
};

/** Las líneas finas cruzadas de un billete (la «guilloche» de los dólares), casi invisibles. */
const TRAMA_BILLETE = "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.07) 0 1px, transparent 1px 4px)";

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
        style={{ backgroundColor: OLIVO_BILLETE[valor] ?? "#586235", backgroundImage: TRAMA_BILLETE }}
        className="relative flex h-10 items-center justify-center rounded-[5px] border-[1.5px] border-black/25 text-[15px] font-medium text-crema outline-1 -outline-offset-[5px] outline-crema/40"
      >
        {/* El círculo del costado, como la marca de agua de un billete. */}
        <span aria-hidden className="absolute top-1/2 left-1.5 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-[1.5px] border-crema/50" />
        {valor}
        <span aria-hidden className="absolute right-1 bottom-0.5 text-[8px] opacity-85">
          S/
        </span>
      </span>
    </button>
  );
}
