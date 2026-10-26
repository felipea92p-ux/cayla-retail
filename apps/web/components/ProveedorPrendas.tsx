import { Shirt } from "lucide-react";
import { agruparPorMarca, COSTO_REAL_MIN_PCT, pesoDelGasto, tieneCostoReal, totalesDePrendas, type PrendaDeProveedor } from "@/lib/proveedor-prendas-reglas";
import { fechaCorta, soles } from "@/lib/compras";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Encabezado, Tabla, fila, celda, type Columna } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";

// «Lo que le compré» de la ficha de un proveedor (2026-10-24): cuántas prendas, cuánta plata y cuánto de eso ya se vendió,
// marca por marca y prenda por prenda. Server Component sin estado: cada marca se abre y se cierra con <details>.
//
// «Comprado» tiene DOS ORÍGENES que nunca se suman a escondidas (ADR-0502, act. 2026-10-24 (b)): lo que llegó por Compras (exacto, con el costo
// de su factura o su lote) y la carga inicial (estimado, «costo por confirmar»): ver `fn_proveedor_prendas`. Las unidades (vendidas, quedan)
// valen para los dos; el dinero (margen, plata sin vender) solo con lo que tiene costo real. El margen es el de lo YA vendido, no una promesa.

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
      <span className={celda("der", "text-sm text-tinta")} title={p.unidadesCarga > 0 ? `${p.unidadesCarga.toLocaleString("es-PE")} de estas unidades vienen de la carga inicial (estimadas, costo por confirmar)${p.unidadesCompras > 0 ? `; ${p.unidadesCompras.toLocaleString("es-PE")} llegaron por Compras` : ""}` : p.unidadesSinFactura > 0 ? `${p.unidadesSinFactura.toLocaleString("es-PE")} llegaron sin factura (un envío sin guía)` : undefined}>
        {p.unidadesCompradas.toLocaleString("es-PE")}
        {p.unidadesCarga > 0 && <span className="block text-[10px] leading-none text-taupe">{p.unidadesCompras === 0 ? "carga inicial" : `${p.unidadesCarga.toLocaleString("es-PE")} de carga`}</span>}
        {p.unidadesCarga === 0 && p.unidadesSinFactura > 0 && <span className="block text-[10px] leading-none text-taupe">sin factura</span>}
      </span>
      <span className={celda("der", "text-sm text-tinta")}>{soles(p.gasto)}</span>
      <span className={celda("izq", "overflow-visible")}>
        <span className="block text-sm tabular-nums text-tinta">
          {p.unidadesVendidas.toLocaleString("es-PE")} <span className="text-xs text-taupe">· {pctTexto(t.vendidoPct)}</span>
        </span>
        <BarraAvance pct={t.vendidoPct ?? 0} alto="fina" tono="tinta" decorativa className="mt-1" />
      </span>
      <span className={celda("der", "text-sm text-tinta")} title={tieneCostoReal(p) ? undefined : "Costo por confirmar: esta prenda viene sobre todo de la carga inicial"}>{pctTexto(t.margenPct)}</span>
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

      {/* Los dos orígenes, cada uno con lo suyo y nunca sumados a escondidas: lo que llegó por Compras es exacto (costo de su factura o su
          lote); lo de la carga inicial es una estimación al costo de la carga, que se confirma cuando lleguen compras por Compras. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <TarjetaCifra
          punto={total.unidadesCompras > 0 ? "verde" : "neutro"}
          etiqueta="Llegó por Compras · exacto"
          valor={total.unidadesCompras > 0 ? <CifraQueCuenta valor={total.gastoCompras} formato="soles" alMontar /> : null}
        >
          {total.unidadesCompras > 0
            ? `${total.unidadesCompras.toLocaleString("es-PE")} unidades con el costo de su factura${total.unidadesSinFactura > 0 ? ` · ${total.unidadesSinFactura.toLocaleString("es-PE")} llegaron sin factura (costo del lote)` : ""}`
            : "Todavía no llegó nada de este proveedor por Compras. Aparecerá aquí, con su costo real, en cuanto se reciba una compra."}
        </TarjetaCifra>
        <TarjetaCifra
          punto="ambar"
          etiqueta="De la carga inicial · estimado"
          valor={total.unidadesCarga > 0 ? <CifraQueCuenta valor={total.gastoCarga} formato="soles" alMontar /> : null}
        >
          {total.unidadesCarga > 0
            ? `${total.unidadesCarga.toLocaleString("es-PE")} unidades al costo de la carga · costo por confirmar`
            : "Nada de este proveedor viene de la carga inicial."}
        </TarjetaCifra>
      </div>

      <div className="card-cayla space-y-2 px-5 py-4" data-guia="proveedor-ficha.costo-real">
        <p className="text-sm text-tinta">
          <b className="font-semibold">{pctTexto(total.costoRealPct)}</b> de lo que tienes de este proveedor ya tiene costo real
        </p>
        <BarraApilada
          alto={8}
          unidad="unidades"
          decorativa
          segmentos={[
            { clave: "compras", nombre: "Llegó por Compras", valor: total.unidadesCompras, clase: "bg-verde" },
            { clave: "carga", nombre: "De la carga inicial", valor: total.unidadesCarga, clase: "bg-tinta/25" },
          ]}
        />
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-taupe">
          <span className="inline-flex items-center gap-1.5">
            <MuestraTramo clase="bg-verde" /> Por Compras ({total.unidadesCompras.toLocaleString("es-PE")})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MuestraTramo clase="bg-tinta/25" /> Carga inicial ({total.unidadesCarga.toLocaleString("es-PE")})
          </span>
          <span>
            {total.costoPorConfirmar
              ? `El margen y la plata sin vender se muestran cuando al menos el ${COSTO_REAL_MIN_PCT} % tiene costo real.`
              : "El margen y la plata sin vender salen de lo que tiene costo real."}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaCifra punto="neutro" etiqueta="Unidades compradas" valor={<CifraQueCuenta valor={total.unidadesCompradas} alMontar />}>
          en {total.prendas.toLocaleString("es-PE")} {total.prendas === 1 ? "prenda" : "prendas"}
        </TarjetaCifra>
        <TarjetaCifra
          punto="neutro"
          etiqueta="Ya vendido"
          valor={total.vendidoPct != null ? <CifraQueCuenta valor={total.vendidoPct} formato="porcentaje" alMontar /> : null}
        >
          {total.unidadesVendidas.toLocaleString("es-PE")} de {total.unidadesCompradas.toLocaleString("es-PE")} unidades · quedan {total.unidadesEnEstantes.toLocaleString("es-PE")} en estantes
        </TarjetaCifra>
        <TarjetaCifra
          punto={total.margenPct == null ? "neutro" : total.margenPct >= 40 ? "verde" : "ambar"}
          etiqueta="Margen de lo vendido"
          valor={total.margenPct != null ? <CifraQueCuenta valor={total.margenPct} formato="porcentaje" alMontar /> : null}
        >
          {total.costoPorConfirmar
            ? "Costo por confirmar: la mayor parte viene de la carga inicial"
            : total.margenPct != null
              ? `Ganaste ${soles(total.gananciaVendida)} sobre ${soles(total.ingresoVendido)} vendidos`
              : "Aparece con la primera venta"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={total.prendasSinVenta === 0 ? "verde" : "ambar"}
          etiqueta="Sin vender"
          valor={total.costoPorConfirmar ? <CifraQueCuenta valor={total.prendasSinVenta} alMontar /> : <CifraQueCuenta valor={total.plataSinVenta} formato="soles" alMontar />}
          unidad={total.costoPorConfirmar ? (total.prendasSinVenta === 1 ? "prenda" : "prendas") : undefined}
        >
          {total.prendasSinVenta === 0
            ? "Todas sus prendas ya vendieron algo"
            : total.costoPorConfirmar
              ? `de ${total.prendas.toLocaleString("es-PE")} sin una sola venta · la plata se muestra con costo real`
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
        «Por Compras» es lo que llegó por una recepción, con el costo de su factura (o de su lote si llegó sin guía). «Carga inicial» es lo que ya estaba cuando se cargó el inventario: se estima con lo vendido más lo que queda y se valora al costo de la carga, que se confirma cuando lleguen compras.
        El margen y la plata sin vender solo se calculan con lo que tiene costo real; las unidades valen para los dos orígenes. Los cambios, devoluciones y traslados entre sedes no cuentan como compra.
      </p>
    </section>
  );
}
