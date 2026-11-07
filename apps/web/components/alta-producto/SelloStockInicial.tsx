// El sello de «Stock inicial» (ADR-0494, actividad 3; maqueta `docs/maquetas/stock-solo-en-existencias-2026-10/`): al crear la prenda, las unidades
// de partida quedan selladas y desde ahora se ajustan solo en Existencias. Se estampa UNA vez (ADR-0136: sin rebote ni bucle) y con
// «reducir movimiento» solo aparece. Es el único rojo de la tarjeta. Con la carga de la sede cerrada, lo que entró es una llegada del
// proveedor (ADR-0328 act. 2026-10-28) y el sello lo dice así: «Llegada · 5 u. · recibida».

export function SelloStockInicial({ unidades, llegada = false }: { unidades: number; llegada?: boolean }) {
  return (
    <div
      role="img"
      aria-label={`${llegada ? "Llegada recibida" : "Stock inicial sellado"}: ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`}
      className="sello-stock-inicial ml-auto grid h-[96px] w-[96px] flex-none place-items-center rounded-full border-2 border-rojo text-center text-rojo"
    >
      <span aria-hidden className="block text-[8px] font-bold uppercase leading-tight tracking-[0.1em]">
        {llegada ? "Llegada" : "Stock inicial"}
        <b className="block font-serif text-[22px] font-medium normal-case leading-none tracking-normal">{unidades} u.</b>
        {llegada ? "recibida" : "sellado"}
      </span>
    </div>
  );
}
