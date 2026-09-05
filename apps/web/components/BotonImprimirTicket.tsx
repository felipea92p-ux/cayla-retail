"use client";

export function BotonImprimirTicket() {
  return (
    <button
      onClick={() => window.print()}
      className="label-cayla w-full bg-tinta py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
    >
      Imprimir ticket
    </button>
  );
}
