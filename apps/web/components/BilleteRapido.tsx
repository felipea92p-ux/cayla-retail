"use client";

/** Un color por denominación, aproximado (no es un calco del billete): lo justo para que la
 *  cajera reconozca el de S/50 de un vistazo, como en la mano. Todos llevan texto blanco y
 *  pasan AA. */
const COLOR_BILLETE: Record<number, string> = {
  10: "#8a5a36",
  20: "#b85c12",
  50: "#b83f66",
  100: "#2f5f9e",
  200: "#8f7130",
};

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
        style={{ backgroundColor: COLOR_BILLETE[valor] ?? "#555" }}
        className="relative flex h-10 items-center justify-center rounded-[5px] border-[1.5px] border-black/25 text-[15px] font-medium text-white outline-1 -outline-offset-[5px] outline-dashed outline-white/45"
      >
        {/* El círculo del costado, como la marca de agua de un billete. */}
        <span aria-hidden className="absolute top-1/2 left-1.5 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-[1.5px] border-white/60" />
        {valor}
        <span aria-hidden className="absolute right-1 bottom-0.5 text-[8px] opacity-85">
          S/
        </span>
      </span>
    </button>
  );
}
