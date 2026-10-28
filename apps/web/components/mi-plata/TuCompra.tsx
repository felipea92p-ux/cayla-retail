import { ArrowRight } from "lucide-react";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Chip } from "@/components/ui/Chip";
import { soles } from "@/lib/compras-reglas";
import { soloNumero } from "./montos";
import { inicialesProveedor, type PrendaDeLaCompra } from "@/lib/compra-rapida-reglas";

// «Tu compra» (maqueta docs/maquetas/tu-compra-pc-2026-10/, «C · tarjeta oscura de resumen», Felipe 2026-10-26): en PC, a la derecha de cada
// paso de «Compré ropa», lo que lleva la compra hasta ahora: el total grande, el proveedor, cuántas prendas y modelos y a qué tiendas van,
// cada prenda con su foto y su subtotal, lo que se gana si se vende todo y qué sigue. Es de papel, como cualquier tarjeta: blanca en modo
// claro y oscura en modo oscuro (Felipe 2026-10-26: «que no se invierta»; «Tienes para comprar», la de tinta, es la única que se invierte).
// Solo se lee; los botones de seguir siguen en cada paso. En el celular no se dibuja (la barra negra de abajo ya dice lo mismo).
type Categoria = { prefijo: string | null; familia: string | null };

export function TuCompra({
  proveedor,
  paso,
  prendas,
  nombresTienda,
  fotos,
  categorias,
  total,
  unidades,
  ganancia,
  siguiente,
}: {
  proveedor: string | null;
  /** En qué tramo va: 1 el proveedor, 2 las prendas, 3 el papel. */
  paso: 1 | 2 | 3;
  prendas: PrendaDeLaCompra[];
  nombresTienda: ReadonlyMap<string, string>;
  fotos: ReadonlyMap<string, string>;
  categorias: ReadonlyMap<string, Categoria>;
  total: number;
  unidades: number;
  ganancia: { vendes: number; ganas: number } | null;
  /** Qué sigue, en palabras de tienda («Sigue: revisar las prendas»). */
  siguiente: string;
}) {
  // Cuántas van a cada tienda, de la que más recibe a la que menos.
  const porTienda = new Map<string, number>();
  for (const p of prendas) for (const t of p.tiendas) porTienda.set(t.destinoId, (porTienda.get(t.destinoId) ?? 0) + t.cantidad);
  const tiendas = [...porTienda.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <aside
      aria-label="Tu compra"
      data-guia="compra.tu-compra"
      className="card-cayla sticky top-40 hidden flex-col gap-3 rounded-[22px] px-5 pb-4 pt-[18px] lg:flex"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="label-cayla text-[11px] text-taupe">Tu compra</span>
        <span className="text-xs tabular-nums text-taupe">Paso {paso} de 3</span>
      </span>
      <p className="font-serif text-[46px] leading-none tabular-nums text-tinta">
        <span className="mr-1 align-[0.35em] text-2xl text-taupe">S/</span>
        {soloNumero(total)}
      </p>
      <p className="flex min-w-0 items-center gap-2.5 text-[13.5px] text-tinta">
        <span aria-hidden className="compra-iniciales compra-iniciales-chico">
          {proveedor ? inicialesProveedor(proveedor) : "—"}
        </span>
        <span className="min-w-0">{proveedor ?? "Aún sin proveedor"}</span>
      </p>
      {prendas.length === 0 ? (
        <p className="text-[13.5px] text-taupe">{proveedor ? "Cuando elijas las prendas, aparecen aquí." : "Elige primero a quién le compraste."}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Chip tono="neutro" versalitas={false}>
              {unidades === 1 ? "1 prenda" : `${unidades} prendas`}
            </Chip>
            <Chip tono="neutro" versalitas={false}>
              {prendas.length === 1 ? "1 modelo" : `${prendas.length} modelos`}
            </Chip>
            {tiendas.map(([id, n]) => (
              <Chip key={id} tono="neutro" versalitas={false}>
                {nombresTienda.get(id) ?? "Tienda"} {n}
              </Chip>
            ))}
          </div>
          <ul className="flex flex-col border-t border-sand">
            {prendas.map((p) => {
              const c = categorias.get(p.categoriaId);
              return (
                <li key={p.clave} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-sand py-2 text-[13.5px] text-tinta">
                  <MiniaturaPrenda fotoUrl={(p.productoId && fotos.get(p.productoId)) || null} prefijo={c?.prefijo} familia={c?.familia} categoria={p.categoria} />
                  <span className="min-w-0">
                    <span className="block truncate">{p.nombre}</span>
                    <span className="block text-xs tabular-nums text-taupe">
                      {p.cantidad} × {soles(p.costo)}
                    </span>
                  </span>
                  <b className="whitespace-nowrap font-semibold tabular-nums">{soles(p.total)}</b>
                </li>
              );
            })}
          </ul>
          {ganancia && (
            <p className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-tinta">Si se vende todo, ganas</span>
              <b className="tabular-nums text-verde">{soles(ganancia.ganas)}</b>
            </p>
          )}
        </>
      )}
      <p className="flex items-center gap-2 rounded-[10px] bg-hueso px-2.5 py-2 text-[13px] text-tinta">
        <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {siguiente}
      </p>
    </aside>
  );
}
