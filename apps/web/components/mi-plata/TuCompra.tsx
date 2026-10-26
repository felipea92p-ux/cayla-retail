import type { PrendaDeLaCompra } from "@/lib/compra-rapida-reglas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { soles } from "@/lib/compras-reglas";

// «Tu compra» (maqueta docs/maquetas/mis-compras-envios-pc-2026-10/, «A», Felipe 2026-10-26): en PC, a la derecha de cada paso de «Compré
// ropa», lo que lleva la compra hasta ahora: el proveedor, cada prenda con sus tiendas y el total. Solo se lee; los botones de seguir
// siguen en cada paso. En el celular no se dibuja (la barra negra de abajo ya dice lo mismo).
export function TuCompra({
  proveedor,
  prendas,
  nombresTienda,
  total,
  unidades,
}: {
  proveedor: string | null;
  prendas: PrendaDeLaCompra[];
  nombresTienda: ReadonlyMap<string, string>;
  total: number;
  unidades: number;
}) {
  return (
    <aside aria-label="Tu compra" className="card-cayla sticky top-40 hidden flex-col gap-3 p-4 lg:flex" data-guia="compra.tu-compra">
      <TituloSeccion nivel={3}>Tu compra</TituloSeccion>
      <div className="flex items-baseline justify-between gap-3 border-t border-sand pt-2.5 text-sm">
        <span className="text-taupe">Proveedor</span>
        <b className="min-w-0 truncate text-right font-medium text-tinta">{proveedor ?? "—"}</b>
      </div>
      {prendas.length === 0 ? (
        <p className="text-sm text-taupe">{proveedor ? "Cuando elijas las prendas, aparecen aquí." : "Elige primero a quién le compraste."}</p>
      ) : (
        <ul className="flex flex-col gap-2 border-t border-sand pt-2.5 text-sm">
          {prendas.map((p) => (
            <li key={p.clave} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-tinta">{p.nombre}</span>
                <span className="block truncate text-xs text-taupe">{p.tiendas.map((t) => `${nombresTienda.get(t.destinoId) ?? "Tienda"} ${t.cantidad}`).join(" · ")}</span>
              </span>
              <span className="whitespace-nowrap tabular-nums text-tinta">× {p.cantidad}</span>
            </li>
          ))}
        </ul>
      )}
      {prendas.length > 0 && (
        <div className="flex items-baseline justify-between gap-3 border-t border-sand pt-2.5">
          <span className="text-sm text-taupe">{unidades === 1 ? "1 prenda" : `${unidades} prendas`}</span>
          <span className="font-serif text-3xl tabular-nums text-tinta">{soles(total)}</span>
        </div>
      )}
    </aside>
  );
}
