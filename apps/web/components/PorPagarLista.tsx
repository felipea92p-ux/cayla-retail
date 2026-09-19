"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, Check } from "lucide-react";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton } from "@/components/ui/campos";
import { Tabla, Encabezado } from "@/components/ui/Tabla";
import { BotonPagar } from "@/components/CompraDetallePanel";
import { ChipNotaPendiente } from "@/components/ChipNotaPendiente";
import { PagoJuntosModal, type DatosPagoProveedor } from "@/components/PagoJuntosModal";
import { soles, type CompraResumen } from "@/lib/compras-reglas";
import type { NotaPendiente, TotalesTramosPorPagar } from "@/lib/compras-indicadores";
import { diaMes } from "@/lib/fechas-lima";
import { detalleSeleccion, etiquetaVence, TITULO_TRAMO, tramoDe, type ClaveTramo } from "@/lib/por-pagar-reglas";

// Lista de Por pagar (maqueta 02 y celular de la 11). UNA tabla partida en tramos de urgencia
// —Vencidas, Vencen esta semana, Más adelante— o, si se prefiere, agrupada por proveedor (para
// preparar la transferencia del día: todo lo que se le debe a uno, junto).
//
// Selección para pagar juntos (D3): se marcan comprobantes del MISMO proveedor. Al tocar la
// casilla de otro proveedor la selección empieza de nuevo con esa fila (mismo patrón que
// Recibir mercadería: «una guía cubre facturas de un solo proveedor»), y las filas ajenas se
// atenúan mientras haya una selección.
//
// Los subtotales de cada tramo son los REALES (`por_pagar_tramos`, sobre toda la deuda que
// cumple los filtros) y no la suma de las 50 filas de la página: el «en esta página» que había
// antes obligaba a sumar de cabeza.

// [casilla] Proveedor · comprobante · Vence · Pagado · Saldo · Pagar
const PLANTILLA = "sm:grid-cols-[1.875rem_1fr_11rem_9.5rem_8.25rem_5.75rem]";

const ESTILO_BANDA = {
  vencidas: "bg-rojo/[0.05] text-rojo",
  semana: "bg-ambar/[0.08] text-ambar-profundo",
  despues: "bg-tinta/[0.03] text-tinta/65",
} as const;

type Bloque = { clave: string; titulo: string; tono: ClaveTramo; cantidad: number; saldo: number; parcial: boolean; filas: CompraResumen[] };

function contar(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "comprobante" : "comprobantes"}`;
}

export function PorPagarLista({
  compras,
  totales,
  agrupar,
  hayMasPaginas,
  datosProveedores,
  notas,
}: {
  compras: CompraResumen[];
  totales: TotalesTramosPorPagar;
  agrupar: "urgencia" | "proveedor";
  hayMasPaginas: boolean;
  datosProveedores: Record<string, DatosPagoProveedor>;
  /** Por id de comprobante: el faltante cerrado que todavía espera su nota de crédito (solo líder; vacío si ninguno). */
  notas: Record<string, NotaPendiente>;
}) {
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [pagando, setPagando] = useState(false);
  const ahora = useMemo(() => new Date(), []);

  const seleccionadas = compras.filter((c) => seleccion.includes(c.id));
  const proveedorActivo = seleccionadas[0]?.proveedorId ?? null;
  const totalSeleccion = Math.round(seleccionadas.reduce((a, c) => a + c.saldo, 0) * 100) / 100;

  function alternar(c: CompraResumen) {
    setSeleccion((s) => {
      const previas = compras.filter((x) => s.includes(x.id));
      if (previas.length === 0 || previas[0].proveedorId !== c.proveedorId) return [c.id];
      return s.includes(c.id) ? s.filter((id) => id !== c.id) : [...s, c.id];
    });
  }

  const bloques = useMemo<Bloque[]>(() => {
    if (agrupar === "proveedor") {
      const porProveedor = new Map<string, CompraResumen[]>();
      for (const c of compras) porProveedor.set(c.proveedorId, [...(porProveedor.get(c.proveedorId) ?? []), c]);
      return [...porProveedor.entries()].map(([id, filas]) => {
        const urgente = filas.map((f) => tramoDe(f, ahora));
        return {
          clave: id,
          titulo: filas[0].proveedorNombre,
          tono: urgente.includes("vencidas") ? "vencidas" : urgente.includes("semana") ? "semana" : "despues",
          cantidad: filas.length,
          saldo: filas.reduce((a, f) => a + f.saldo, 0),
          // Sin el total real por proveedor: si hay más páginas, lo dicho es «lo de esta página».
          parcial: hayMasPaginas,
          filas,
        };
      });
    }
    const orden: ClaveTramo[] = ["vencidas", "semana", "despues"];
    return orden
      .map((k) => {
        const filas = compras.filter((c) => tramoDe(c, ahora) === k);
        return { clave: k, titulo: TITULO_TRAMO[k], tono: k, cantidad: totales[k].comprobantes || filas.length, saldo: totales[k].comprobantes ? totales[k].saldo : filas.reduce((a, f) => a + f.saldo, 0), parcial: false, filas };
      })
      .filter((b) => b.filas.length > 0);
  }, [agrupar, compras, totales, hayMasPaginas, ahora]);

  return (
    <div className={seleccion.length > 0 ? "pb-24 sm:pb-20" : ""}>
      <Tabla>
        <Encabezado
          plantilla={PLANTILLA}
          columnas={[{ titulo: "" }, { titulo: "Proveedor · Comprobante" }, { titulo: "Vence" }, { titulo: "Pagado", alinear: "der" }, { titulo: "Saldo", alinear: "der" }, { titulo: "" }]}
        />
        {bloques.map((b) => (
          <Fragment key={b.clave}>
            {/* El id es el destino de la tarjeta «Vence esta semana»; `scroll-mt-24` compensa la cabecera fija. */}
            <div id={`tramo-${b.clave}`} role="row" className={`scroll-mt-24 flex items-baseline justify-between gap-4 px-5 py-2 ${ESTILO_BANDA[b.tono]}`}>
              <p className="label-cayla text-[11px]">
                {b.titulo} <span className="opacity-70">· {contar(b.cantidad)}</span>
              </p>
              <p className="text-sm tabular-nums">
                {soles(b.saldo)}
                {b.parcial && <span className="ml-1 text-xs opacity-70">en esta página</span>}
              </p>
            </div>
            {b.filas.map((c) => (
              <FilaPorPagar
                key={c.id}
                c={c}
                marcada={seleccion.includes(c.id)}
                atenuada={proveedorActivo !== null && c.proveedorId !== proveedorActivo}
                onAlternar={() => alternar(c)}
                ahora={ahora}
                saldoFavor={datosProveedores[c.proveedorId]?.saldoFavor ?? 0}
                datos={datosProveedores[c.proveedorId]}
                notaPendiente={notas[c.id]}
              />
            ))}
          </Fragment>
        ))}
      </Tabla>

      {seleccionadas.length > 0 && (
        <BarraFija
          resumen={
            <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-sm text-tinta/75">
                {contar(seleccionadas.length)} · <b className="font-semibold text-tinta">{seleccionadas[0].proveedorNombre}</b>
              </span>
              <span className="font-display text-2xl tabular-nums text-tinta">{soles(totalSeleccion)}</span>
              <span className="text-xs text-tinta/65">{detalleSeleccion(seleccionadas, soles, ahora)}</span>
            </span>
          }
          acciones={
            <>
              <button type="button" onClick={() => setSeleccion([])} className="label-cayla text-[11px] text-tinta/65 transition-colors hover:text-rojo">
                Limpiar
              </button>
              <Boton type="button" peso="primario" onClick={() => setPagando(true)}>
                <span className="flex items-center gap-2">
                  <Banknote aria-hidden className="h-3.5 w-3.5" /> Pagar juntos
                </span>
              </Boton>
            </>
          }
        />
      )}

      {pagando && seleccionadas.length > 0 && (
        <PagoJuntosModal
          proveedorId={seleccionadas[0].proveedorId}
          proveedorNombre={seleccionadas[0].proveedorNombre}
          comprobantes={seleccionadas}
          datos={datosProveedores[seleccionadas[0].proveedorId]}
          onClose={() => setPagando(false)}
          onPagado={() => {
            setPagando(false);
            setSeleccion([]);
          }}
        />
      )}
    </div>
  );
}

function FilaPorPagar({ c, marcada, atenuada, onAlternar, ahora, saldoFavor, datos, notaPendiente }: { c: CompraResumen; marcada: boolean; atenuada: boolean; onAlternar: () => void; ahora: Date; saldoFavor: number; datos?: DatosPagoProveedor; notaPendiente?: NotaPendiente }) {
  const tramo = tramoDe(c, ahora);
  const colorVence = tramo === "vencidas" ? "text-rojo" : tramo === "semana" ? "text-ambar-profundo" : "text-tinta";
  const vence = c.fechaVencimiento ? etiquetaVence(c.fechaVencimiento, ahora) : "Sin fecha";
  return (
    // La fila entera abre el detalle (el enlace del proveedor se estira con `after:`); la casilla y
    // el botón quedan por encima (`z-10`) para no disparar ese enlace. Así no hay un <button>
    // dentro de un <a>, que el navegador no permite. En celular es una tarjeta (flex); desde `sm`,
    // una fila de la tabla.
    <div
      className={`relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-tinta/[0.03] sm:grid sm:items-center sm:gap-x-4 sm:px-5 ${PLANTILLA} ${marcada ? "bg-rojo/[0.045]" : ""} ${atenuada ? "opacity-40" : ""}`}
    >
      <span className="relative z-10 pt-0.5 sm:pt-0">
        <Casilla marcada={marcada} onAlternar={onAlternar} etiqueta={`Elegir ${c.documento} de ${c.proveedorNombre} para pagar`} />
      </span>
      <div className="min-w-0 flex-1 sm:flex-none">
        <Link href={`/compras/factura/${c.id}`} className="block after:absolute after:inset-0 after:content-['']">
          <span className="block truncate text-sm text-tinta">
            {c.proveedorNombre} <span className="ml-1 text-xs tabular-nums text-tinta/65">{c.documento}</span>
          </span>
          <span className="block text-xs text-tinta/55">Emitida {diaMes(c.fechaEmision)}</span>
        </Link>
        <span className={`mt-1 block text-xs sm:hidden ${colorVence}`}>{vence}</span>
        {/* Lo que el proveedor todavía debe acreditar por un faltante cerrado: parte de este saldo que no
            hay que pagar. Va bajo el proveedor (la columna con sitio). Es su propio enlace al comprobante,
            por encima (`z-10`) del enlace estirado de la fila, para que el tooltip con la explicación
            funcione sin quitarle el clic: el detalle es donde se registra la nota. */}
        {notaPendiente && (
          <Link href={`/compras/factura/${c.id}`} className="relative z-10 mt-1.5 block">
            <ChipNotaPendiente nota={notaPendiente} saldo={c.saldo} conAyuda />
          </Link>
        )}
      </div>
      <div className="hidden sm:block">
        <span className={`block text-sm ${colorVence}`}>{vence}</span>
        {c.fechaVencimiento && <span className="block text-xs tabular-nums text-tinta/55">{diaMes(c.fechaVencimiento)}</span>}
      </div>
      <div className="hidden text-right tabular-nums sm:block">
        <span className={`block text-sm ${c.pagado > 0 ? "text-tinta" : "text-tinta/55"}`}>{c.pagado > 0 ? soles(c.pagado) : "Sin pagos"}</span>
        <span className="block text-xs text-tinta/55">de {soles(c.total)}</span>
      </div>
      <div className="shrink-0 text-right">
        <span className="font-display block text-[18px] tabular-nums text-tinta">{soles(c.saldo)}</span>
        <span className="relative z-10 mt-1.5 inline-block sm:hidden">
          <BotonPagar compra={c} compacto saldoFavor={saldoFavor} datos={datos} />
        </span>
      </div>
      <div className="relative z-10 hidden text-right sm:block">
        <BotonPagar compra={c} compacto saldoFavor={saldoFavor} datos={datos} />
      </div>
    </div>
  );
}

// Casilla de 17 px como la de las maquetas: la marcada en tinta con el check en crema. Un input
// nativo (invisible) sostiene el foco, el teclado y el lector de pantalla.
function Casilla({ marcada, onAlternar, etiqueta }: { marcada: boolean; onAlternar: () => void; etiqueta: string }) {
  return (
    <label className="inline-flex cursor-pointer">
      <input type="checkbox" checked={marcada} onChange={onAlternar} aria-label={etiqueta} className="peer sr-only" />
      <span
        aria-hidden
        className={`grid h-[17px] w-[17px] place-items-center rounded-[4px] border-[1.5px] transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rojo/60 ${
          marcada ? "border-tinta bg-tinta text-crema" : "border-tinta/45 bg-papel"
        }`}
      >
        {marcada && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </label>
  );
}
