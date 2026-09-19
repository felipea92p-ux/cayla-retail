"use client";

import type { ReactNode, RefObject } from "react";
import Link from "next/link";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import { ComparacionPrendas } from "@/components/CambioResumen";
import { OPCION, OPCION_ACTIVA, OPCION_INACTIVA } from "@/components/FlujoGuiado";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import {
  condicionForzada,
  unidadesDisponibles,
  varianteLegible,
  METODOS_DIFERENCIA,
  MOTIVOS_CAMBIO,
  type CondicionCambio,
  type MetodoDiferencia,
  type MotivoCambio,
} from "@/lib/cambios-reglas";
import { compararTallas } from "@/lib/tallas";
import { textoOtrasSedes, type SedeConStock } from "@/lib/stock-por-sede";

export type VarianteCatalogo = {
  varianteId: string;
  productoId: string;
  sku: string;
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  precio: number;
  /** Piso de ESTA sede: lo único que `registrar_cambio` deja entregar. */
  stockAqui: number;
  /** Dónde más hay — «no queda L aquí, pero hay 2 en Trujillo». */
  stockOtrasSedes: SedeConStock[];
};

/** Lo que la colaboradora va eligiendo en el paso "Reemplazo". Nada viene elegido a
 *  ciegas (ADR-0044): solo la PRENDA arranca en la que compró — la mayoría de cambios
 *  son "la misma, otra talla o color". El método arranca en efectivo como siempre: si
 *  debe arrancar vacío es parte de la decisión de dinero pendiente (no se tocó). */
export type Seleccion = {
  motivo: MotivoCambio | null;
  productoId: string;
  talla: string | null;
  color: string | null;
  condicionElegida: CondicionCambio;
  cantidad: number;
  metodo: MetodoDiferencia;
};

export function seleccionInicial(linea: LineaVentaReciente): Seleccion {
  return {
    motivo: null,
    productoId: linea.productoId,
    talla: null,
    color: null,
    condicionElegida: "vendible",
    cantidad: Math.min(1, unidadesDisponibles(linea)),
    metodo: "efectivo",
  };
}

export function agruparCatalogo(catalogo: readonly VarianteCatalogo[]): Map<string, VarianteCatalogo[]> {
  const mapa = new Map<string, VarianteCatalogo[]>();
  for (const v of catalogo) {
    const lista = mapa.get(v.productoId) ?? [];
    lista.push(v);
    mapa.set(v.productoId, lista);
  }
  return mapa;
}

/** La que compró va primero y siempre (aunque hoy no quede ninguna aquí: así se ve
 *  dónde más hay); de las demás, solo las que tienen algo que entregar en esta sede. */
export function opcionesDePrenda(linea: LineaVentaReciente, porProducto: Map<string, VarianteCatalogo[]>): OpcionCombo<string>[] {
  const otras = [...porProducto.entries()]
    .filter(([id, vs]) => id !== linea.productoId && vs.some((v) => v.stockAqui > 0))
    .map(([id, vs]) => ({ valor: id, texto: vs[0]!.referencia, detalle: `desde S/ ${Math.min(...vs.map((v) => v.precio)).toFixed(2)}` }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  return [{ valor: linea.productoId, texto: linea.referencia, detalle: "la que compró" }, ...otras];
}

/** Todo lo que se deriva de la selección, calculado UNA vez: el formulario, la
 *  comparación, las validaciones y la confirmación leen lo mismo. */
export function derivarReemplazo(linea: LineaVentaReciente, porProducto: Map<string, VarianteCatalogo[]>, s: Seleccion) {
  const variantes = porProducto.get(s.productoId) ?? [];
  const tallas = [...new Set(variantes.map((v) => v.talla).filter((t): t is string => t !== null))].sort(compararTallas);
  const colores = [...new Map(variantes.filter((v) => v.color).map((v) => [v.color!, v.colorHex])).entries()];
  // Con una sola opción no hay decisión que tomar: se completa sola.
  const tallaEfectiva = s.talla ?? (tallas.length === 1 ? tallas[0]! : null);
  const colorEfectivo = s.color ?? (colores.length === 1 ? colores[0]![0] : null);
  const eligioTodo = (tallas.length === 0 || tallaEfectiva !== null) && (colores.length === 0 || colorEfectivo !== null);
  const varianteNueva = eligioTodo
    ? (variantes.find((v) => (tallas.length === 0 || v.talla === tallaEfectiva) && (colores.length === 0 || v.color === colorEfectivo)) ?? null)
    : null;
  const condicionFija = condicionForzada(s.motivo);
  return {
    esLaMisma: s.productoId === linea.productoId,
    tallas,
    colores,
    tallaEfectiva,
    colorEfectivo,
    hayAqui: (t: string | null, c: string | null) =>
      variantes.some((v) => (t === null || v.talla === t) && (c === null || v.color === c) && v.stockAqui > 0),
    /** Cuántas hay en el piso de esta sede de esa talla y color (para decirlo bajo cada talla). */
    stockAqui: (t: string | null, c: string | null) =>
      variantes.filter((v) => (t === null || v.talla === t) && (c === null || v.color === c)).reduce((suma, v) => suma + Math.max(0, v.stockAqui), 0),
    eligioTodo,
    varianteNueva,
    sinStockAqui: varianteNueva !== null && varianteNueva.stockAqui <= 0,
    descripcionNueva: varianteLegible({ talla: tallaEfectiva, color: colorEfectivo }),
    otrasSedes: varianteNueva ? textoOtrasSedes(varianteNueva.stockOtrasSedes) : null,
    // Sin prenda nueva elegida no hay diferencia que cobrar (y la caja no se mira).
    diferencia: varianteNueva ? (varianteNueva.precio - linea.precioUnitario) * s.cantidad : 0,
    condicionFija,
    condicion: condicionFija ?? s.condicionElegida,
  };
}

export type Reemplazo = ReturnType<typeof derivarReemplazo>;

/** Talla que no queda en esta sede: se puede tocar igual — así se ve dónde más hay. */
const OPCION_SIN_STOCK = `${OPCION} border-dashed border-tinta/35 bg-transparent text-tinta/65 hover:border-tinta/55`;

function Pregunta({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <legend id={id} className="text-[15px] font-semibold text-tinta">
      {children}
    </legend>
  );
}

/**
 * Paso 3 del flujo de Cambios: "¿Por qué la cambia? ¿Qué se lleva? ¿Cómo vuelve la que
 * trae?" — controlado: el estado vive en `CambiosFlujo`, que también lo necesita para
 * validar y confirmar.
 */
export function CambioReemplazo({
  linea,
  seleccion: s,
  r,
  opcionesPrenda,
  refMotivo,
  refPrenda,
  refMetodo,
  onCambio,
}: {
  linea: LineaVentaReciente;
  seleccion: Seleccion;
  r: Reemplazo;
  opcionesPrenda: OpcionCombo<string>[];
  /** Los tres ref, para llevar el foco al campo que falta cuando se aprieta "Continuar". */
  refMotivo: RefObject<HTMLFieldSetElement | null>;
  refPrenda: RefObject<HTMLDivElement | null>;
  refMetodo: RefObject<HTMLSelectElement | null>;
  onCambio: (cambio: Partial<Seleccion>) => void;
}) {
  const disponible = unidadesDisponibles(linea);
  const idBase = `cambio-${linea.ventaItemId}`;

  return (
    <div className="space-y-9">
      <fieldset ref={refMotivo}>
        <Pregunta>¿Por qué la cambia?</Pregunta>
        <div className="mt-3 flex flex-wrap gap-2">
          {MOTIVOS_CAMBIO.map((m) => (
            <button
              key={m.valor}
              type="button"
              aria-pressed={s.motivo === m.valor}
              className={s.motivo === m.valor ? OPCION_ACTIVA : OPCION_INACTIVA}
              onClick={() => onCambio({ motivo: m.valor })}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
      </fieldset>

      <div ref={refPrenda}>
        <label htmlFor={`${idBase}-prenda`} className="text-[15px] font-semibold text-tinta">
          ¿Qué se lleva?
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <ComboBuscable
            id={`${idBase}-prenda`}
            valor={s.productoId}
            onValor={(productoId) => onCambio({ productoId, talla: null, color: null })}
            opciones={opcionesPrenda}
            etiquetaAccesible="Prenda que se lleva"
            marcador="Busca otra prenda…"
            className="w-full max-w-sm"
          />
          <Link
            href={`/devoluciones?item=${linea.ventaItemId}`}
            className="text-sm text-tinta/75 underline decoration-tinta/30 underline-offset-4 transition-colors duration-200 hover:text-tinta hover:decoration-tinta"
          >
            ¿Nada de su agrado? Pasar a devolución
          </Link>
        </div>

        {r.tallas.length > 1 && (
          <fieldset className="mt-6">
            <legend className="text-xs font-semibold text-tinta/70">
              Talla{r.esLaMisma && linea.talla ? ` · compró ${linea.talla}` : ""}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.tallas.map((t) => {
                const hay = r.hayAqui(t, r.colorEfectivo);
                const subtitulo = r.esLaMisma && t === linea.talla ? "compró esta" : hay ? `${r.stockAqui(t, r.colorEfectivo)} en piso` : "no queda aquí";
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={t === r.tallaEfectiva}
                    aria-label={hay ? `Talla ${t}, ${subtitulo}` : `Talla ${t}, no queda aquí`}
                    className={`min-w-16 ${t === r.tallaEfectiva ? OPCION_ACTIVA : hay ? OPCION_INACTIVA : OPCION_SIN_STOCK}`}
                    onClick={() => onCambio({ talla: t })}
                  >
                    {t}
                    <span className="block text-[11.5px] font-normal opacity-70">{subtitulo}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {r.colores.length > 1 && (
          <fieldset className="mt-5">
            <legend className="text-xs font-semibold text-tinta/70">
              Color{r.esLaMisma && linea.color ? ` · compró ${linea.color}` : ""}
            </legend>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              {r.colores.map(([nombre, hex]) => {
                const hay = r.hayAqui(r.tallaEfectiva, nombre);
                const elegido = nombre === r.colorEfectivo;
                return (
                  <button
                    key={nombre}
                    type="button"
                    title={hay ? nombre : `${nombre} · no queda aquí`}
                    aria-label={hay ? `Color ${nombre}` : `Color ${nombre}, no queda aquí`}
                    aria-pressed={elegido}
                    onClick={() => onCambio({ color: nombre })}
                    className={`h-10 w-10 rounded-full border-2 transition-[box-shadow,transform] duration-300 ${
                      elegido ? "border-tinta shadow-[0_0_0_2px_var(--color-papel),0_0_0_4px_var(--color-tinta)]" : "border-tinta/15 hover:border-tinta/40"
                    } ${hay ? "" : "opacity-40"}`}
                    style={{ background: hex ?? "var(--color-sand)" }}
                  />
                );
              })}
              {r.colorEfectivo && <span className="ml-1 text-sm text-tinta/75">{r.colorEfectivo}</span>}
            </div>
          </fieldset>
        )}

        {r.sinStockAqui && (
          <p className="anim-revelar mt-4 rounded-lg border border-dashed border-tinta/30 px-4 py-3 text-sm text-tinta/80" role="status">
            No queda {r.descripcionNueva || linea.referencia} aquí{r.otrasSedes ? ` — hay ${r.otrasSedes}.` : ", ni en otra sede."}
          </p>
        )}
      </div>

      <fieldset>
        <Pregunta>¿Cómo vuelve la prenda que trae?</Pregunta>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              { valor: "vendible", titulo: "Impecable", detalle: "Vuelve al piso de venta." },
              { valor: "no_vendible", titulo: "Con defecto o uso", detalle: "Va a cuarentena: un líder decide si se repara, se dona o vuelve al proveedor." },
            ] as const
          ).map((o) => {
            const activa = r.condicion === o.valor;
            return (
              <button
                key={o.valor}
                type="button"
                aria-pressed={activa}
                disabled={r.condicionFija !== null && o.valor !== r.condicionFija}
                onClick={() => onCambio({ condicionElegida: o.valor })}
                className={`rounded-2xl border px-[18px] py-4 text-left transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                  activa ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-papel text-tinta hover:border-tinta/40"
                }`}
              >
                <span className="block text-sm font-semibold">{o.titulo}</span>
                <span className={`mt-0.5 block text-xs ${activa ? "text-crema/85" : "text-tinta/70"}`}>{o.detalle}</span>
              </button>
            );
          })}
        </div>
        {r.condicionFija && <p className="mt-2 text-xs text-tinta/70">Una prenda con defecto no puede volver al piso: va a cuarentena sí o sí.</p>}
      </fieldset>

      {disponible > 1 && (
        <div>
          <label htmlFor={`${idBase}-cantidad`} className="text-[15px] font-semibold text-tinta">
            ¿Cuántas cambia?
          </label>
          <p className="text-xs text-tinta/70">Compró {linea.cantidad}; quedan {disponible} por cambiar.</p>
          <input
            id={`${idBase}-cantidad`}
            type="number"
            min={1}
            max={disponible}
            value={s.cantidad}
            onChange={(e) => onCambio({ cantidad: Math.max(1, Math.min(disponible, Number(e.target.value) || 1)) })}
            className="mt-2 h-10 w-24 rounded-lg border border-tinta/15 bg-papel px-3 text-sm text-tinta outline-none transition-colors duration-200 focus:border-tinta"
          />
        </div>
      )}

      <div className="space-y-4 border-t border-tinta/[0.08] pt-8">
        <ComparacionPrendas
          devuelta={{ referencia: linea.referencia, talla: linea.talla, color: linea.color, colorHex: linea.colorHex, fotoUrl: linea.fotoUrl, precio: linea.precioUnitario }}
          nueva={
            r.varianteNueva && !r.sinStockAqui
              ? {
                  referencia: r.varianteNueva.referencia,
                  talla: r.varianteNueva.talla,
                  color: r.varianteNueva.color,
                  colorHex: r.varianteNueva.colorHex,
                  fotoUrl: r.varianteNueva.fotoUrl,
                  precio: r.varianteNueva.precio,
                }
              : null
          }
          cantidad={s.cantidad}
          diferencia={r.diferencia}
        />

        {r.varianteNueva && !r.sinStockAqui && r.diferencia !== 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <label htmlFor={`${idBase}-metodo`} className="text-sm text-tinta/75">
              {r.diferencia > 0 ? "¿Cómo paga la diferencia?" : "¿Cómo se le devuelve?"}
            </label>
            <select
              ref={refMetodo}
              id={`${idBase}-metodo`}
              value={s.metodo}
              onChange={(e) => onCambio({ metodo: e.target.value as MetodoDiferencia })}
              className="h-10 rounded-lg border border-tinta/15 bg-papel px-3 text-sm text-tinta outline-none transition-colors duration-200 focus:border-tinta"
            >
              {METODOS_DIFERENCIA.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
