import { Shirt } from "lucide-react";
import { agruparPorMarca, pesoDelGasto, totalesDePrendas, type PrendaDeProveedor } from "@/lib/proveedor-prendas-reglas";
import { fechaCorta, soles } from "@/lib/compras";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Encabezado, Tabla, fila, celda, type Columna } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";

// «Lo que le compré» de la ficha de un proveedor (2026-10-24): cuántas prendas, cuánta plata y cuánto de eso ya se vendió,
// marca por marca y prenda por prenda. Server Component sin estado: cada marca se abre y se cierra con <details>.
//
// «Comprado» son las entradas de inventario al costo de la prenda (la línea de factura manda cuando existe): ver
// `fn_proveedor_prendas`. El margen es el de lo YA vendido (precio cobrado menos el costo que tenía al venderse), no una promesa.

const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_9rem_5.5rem_5rem]";
const COLUMNAS: Columna[] = [
  { titulo: "Prenda" },
  { titulo: "Compradas", alinear: "der" },
  { titulo: "Gasto", alinear: "der" },
  { titulo: "Vendidas", ayuda: "Cuántas de las compradas ya se vendieron" },
  { titulo: "Margen", alinear: "der", ayuda: "Ganancia de lo ya vendido sobre su precio cobrado" },
  { titulo: "Quedan", alinear: "der", ayuda: "Unidades en tiendas y almacén hoy" },
];

const pctTexto = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })} %`);

function FilaPrenda({ p }: { p: PrendaDeProveedor }) {
  const t = totalesDePrendas([p]);
  return (
    <div className={fila(PLANTILLA)}>
      <span className={celda("izq")}>
        <span className="block truncate text-sm text-tinta">{p.referencia}</span>
        <span className="block truncate text-xs text-taupe">
          {[p.codigo, p.categoria, p.primeraEntrada ? `desde ${fechaCorta(p.primeraEntrada)}` : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className={celda("der", "text-sm text-tinta")}>{p.unidadesCompradas.toLocaleString("es-PE")}</span>
      <span className={celda("der", "text-sm text-tinta")}>{soles(p.gasto)}</span>
      <span className={celda("izq", "overflow-visible")}>
        <span className="block text-sm tabular-nums text-tinta">
          {p.unidadesVendidas.toLocaleString("es-PE")} <span className="text-xs text-taupe">· {pctTexto(t.vendidoPct)}</span>
        </span>
        <BarraAvance pct={t.vendidoPct ?? 0} alto="fina" tono="tinta" decorativa className="mt-1" />
      </span>
      <span className={celda("der", "text-sm text-tinta")}>{pctTexto(t.margenPct)}</span>
      <span className={celda("der", "text-sm text-tinta")}>{p.stockActual.toLocaleString("es-PE")}</span>
    </div>
  );
}

export function ProveedorPrendas({ prendas }: { prendas: PrendaDeProveedor[] }) {
  if (prendas.length === 0) {
    return (
      <section className="space-y-3" data-guia="proveedor-ficha.prendas">
        <TituloSeccion>Lo que le compré</TituloSeccion>
        <div className="card-cayla">
          <Vacio icono={<Shirt />} titulo="Todavía no hay prendas de este proveedor">
            Cuando entren al inventario prendas con este proveedor (o se registre una factura con sus líneas), aquí verás cuántas compraste, cuánto gastaste y cuánto ya se vendió.
          </Vacio>
        </div>
      </section>
    );
  }

  const total = totalesDePrendas(prendas);
  const marcas = agruparPorMarca(prendas);

  return (
    <section className="space-y-3" data-guia="proveedor-ficha.prendas">
      <TituloSeccion cuenta={total.prendas}>Lo que le compré · prendas</TituloSeccion>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <TarjetaCifra punto="neutro" etiqueta="Unidades compradas" valor={<CifraQueCuenta valor={total.unidadesCompradas} alMontar />}>
          en {total.prendas.toLocaleString("es-PE")} {total.prendas === 1 ? "prenda" : "prendas"}
        </TarjetaCifra>
        <TarjetaCifra punto="neutro" etiqueta="Plata gastada" valor={<CifraQueCuenta valor={total.gasto} formato="soles" alMontar />}>
          al costo de cada prenda
        </TarjetaCifra>
        <TarjetaCifra
          punto="neutro"
          etiqueta="Ya vendido"
          valor={total.vendidoPct != null ? <CifraQueCuenta valor={total.vendidoPct} formato="porcentaje" alMontar /> : null}
        >
          {total.unidadesVendidas.toLocaleString("es-PE")} de {total.unidadesCompradas.toLocaleString("es-PE")} unidades · quedan {soles(total.plataEnStock)} en estantes
        </TarjetaCifra>
        <TarjetaCifra
          punto={total.margenPct == null ? "neutro" : total.margenPct >= 40 ? "verde" : "ambar"}
          etiqueta="Margen de lo vendido"
          valor={total.margenPct != null ? <CifraQueCuenta valor={total.margenPct} formato="porcentaje" alMontar /> : null}
        >
          {total.margenPct != null ? `Ganaste ${soles(total.gananciaVendida)} sobre ${soles(total.ingresoVendido)} vendidos` : "Aparece con la primera venta"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={total.prendasSinVenta === 0 ? "verde" : "ambar"}
          etiqueta="Sin vender"
          valor={<CifraQueCuenta valor={total.plataSinVenta} formato="soles" alMontar />}
        >
          {total.prendasSinVenta === 0
            ? "Todas sus prendas ya vendieron algo"
            : `${total.prendasSinVenta.toLocaleString("es-PE")} de ${total.prendas.toLocaleString("es-PE")} prendas sin una sola venta`}
        </TarjetaCifra>
      </div>

      <div className="space-y-3">
        {marcas.map((g, i) => (
          <details key={g.marca} open={i === 0} className="group card-cayla overflow-hidden">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
              <span className="font-serif text-lg text-tinta">
                {g.marca} <span className="text-sm text-taupe">· {g.prendas} {g.prendas === 1 ? "prenda" : "prendas"}</span>
              </span>
              <span className="text-sm tabular-nums text-tinta">
                {soles(g.gasto)} <span className="text-xs text-taupe">· {pctTexto(pesoDelGasto(g.gasto, total.gasto))} de lo que gastaste · vendido {pctTexto(g.vendidoPct)}</span>
              </span>
            </summary>
            <Tabla className="@container rounded-none border-0 shadow-none">
              <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS} />
              {g.prendasLista.map((p) => (
                <FilaPrenda key={p.productoId} p={p} />
              ))}
            </Tabla>
          </details>
        ))}
      </div>

      <p className="nota-cayla">
        «Comprado» son las entradas de inventario valorizadas al costo actual de cada prenda; cuando una entrada viene de una factura, manda el costo de la factura.
        El margen es el de lo ya vendido (lo cobrado menos el costo que tenía la prenda al venderse). Los cambios, devoluciones y traslados entre sedes no cuentan como compra.
      </p>
    </section>
  );
}
