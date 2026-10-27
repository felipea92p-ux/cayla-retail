"use client";

import type { ReactNode, RefObject } from "react";
import Link from "next/link";
import { Plus, ScanLine, X } from "lucide-react";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import { Desplegable } from "@/components/ui/campos";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { Aviso, type TonoAvisoLinea } from "@/components/ui/Aviso";
import { ComparacionPrendas } from "@/components/CambioResumen";
import { CambioSalidas } from "@/components/CambioSalidas";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { SedeConId } from "@/lib/cambios-atajos-reglas";
import { OPCION, OPCION_ACTIVA, OPCION_INACTIVA } from "@/components/FlujoGuiado";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { unidadesDisponibles, metodosDiferencia, MOTIVOS_CAMBIO, type MetodoDiferencia } from "@/lib/cambios-reglas";
import { MAX_PRENDAS_EXTRA, extrasDe, textoPagoConDescuento, type PrendaExtra, type Reemplazo, type Seleccion, type TotalesDelCambio } from "@/lib/cambio-reemplazo-reglas";

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
 * Las tallas y los colores de la prenda elegida, con cuántas hay en el piso de cada una. Lo usan la primera prenda que se lleva y cada
 * prenda EXTRA (ADR-0470): el mismo marcado, para que elegir la segunda se sienta igual que la primera.
 */
function ElegirTallaYColor({ r, linea, onCambio }: { r: Reemplazo; linea: LineaVentaReciente; onCambio: (cambio: { talla?: string; color?: string }) => void }) {
  return (
    <>
  {r.tallas.length > 1 && (
    <fieldset className="mt-6">
      <legend className="text-xs font-semibold text-tinta/70">
        Talla{r.esLaMisma && linea.talla ? ` · compró ${linea.talla}` : ""}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {r.tallas.map((t) => {
          const hay = r.hayAqui(t, r.colorEfectivo);
          const subtitulo = r.esLaMisma && t === linea.talla ? "compró esta" : hay ? `${r.stockAqui(t, r.colorEfectivo)} en piso` : r.sinStockTexto(t, r.colorEfectivo);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={t === r.tallaEfectiva}
              aria-label={hay ? `Talla ${t}, ${subtitulo}` : `Talla ${t}, ${r.sinStockTexto(t, r.colorEfectivo)}`}
              className={`min-w-16 ${t === r.tallaEfectiva ? OPCION_ACTIVA : hay ? OPCION_INACTIVA : OPCION_SIN_STOCK}`}
              onClick={() => onCambio({ talla: t })}
            >
              {t}
              <span className="block text-[11.5px] font-normal opacity-70 dark:opacity-85">{subtitulo}</span>
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
          const sinStock = r.sinStockTexto(r.tallaEfectiva, nombre);
          return (
            <button
              key={nombre}
              type="button"
              title={hay ? nombre : `${nombre} · ${sinStock}`}
              aria-label={hay ? `Color ${nombre}` : `Color ${nombre}, ${sinStock}`}
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
    </>
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
  salidas,
  campoPrenda,
  onEscanear,
  lectura,
  esperandoPistola,
  aceptaQr,
  totales,
  extrasR,
  opcionesOtraPrenda,
  onExtra,
  onAgregarExtra,
  onQuitarExtra,
}: {
  linea: LineaVentaReciente;
  seleccion: Seleccion;
  r: Reemplazo;
  opcionesPrenda: OpcionCombo<string>[];
  /** Los tres ref, para llevar el foco al campo que falta cuando se aprieta "Continuar". */
  refMotivo: RefObject<HTMLFieldSetElement | null>;
  refPrenda: RefObject<HTMLDivElement | null>;
  refMetodo: RefObject<HTMLButtonElement | null>;
  onCambio: (cambio: Partial<Seleccion>) => void;
  /** Lo que necesitan las salidas cuando la talla no está aquí (`CambioSalidas`). */
  salidas: { sedes: SedeConId[]; ubicacionId: string; sede: string; esLider: boolean; responsable: ControlResponsable };
  /** El input del combo de prenda: lo que la pistola escribe ahí es una lectura, no una búsqueda. */
  campoPrenda: RefObject<HTMLInputElement | null>;
  /** «Escanear etiqueta»: la cámara en el celular, la pistola lista en el mostrador. */
  onEscanear: () => void;
  /** Lo que dijo la última lectura («Leímos …» o «No encontramos …»). */
  lectura: { tono: TonoAvisoLinea; texto: string } | null;
  /** El botón se tocó en el mostrador: el campo espera a la pistola. */
  esperandoPistola: boolean;
  /** La base ya acepta el QR como medio de la diferencia (`fn_acepta_qr_en_cambios`): sin eso, el combo no lo ofrece. */
  aceptaQr: boolean;
  /** Lo que se lleva en total y lo que cuesta (`totalesDelCambio`): la diferencia que se cobra es esta, no la de una sola prenda. */
  totales: TotalesDelCambio;
  /** Lo derivado de cada prenda EXTRA, en el mismo orden que `seleccion.extras`. */
  extrasR: readonly Reemplazo[];
  /** Qué prendas se ofrecen como otra más (`opcionesDeOtraPrenda`). */
  opcionesOtraPrenda: (elegidoId: string) => OpcionCombo<string>[];
  onExtra: (id: string, cambio: Partial<PrendaExtra>) => void;
  onAgregarExtra: () => void;
  onQuitarExtra: (id: string) => void;
}) {
  const disponible = unidadesDisponibles(linea);
  const idBase = `cambio-${linea.ventaItemId}`;
  const extras = extrasDe(s);

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
          <div className="flex w-full max-w-md items-end gap-2">
            <ComboBuscable
              id={`${idBase}-prenda`}
              campoRef={campoPrenda}
              valor={s.productoId}
              onValor={(productoId) => onCambio({ productoId, talla: null, color: null })}
              opciones={opcionesPrenda}
              etiquetaAccesible="Prenda que se lleva"
              marcador={esperandoPistola ? "Escanea la etiqueta…" : "Escanea su etiqueta o búscala…"}
              className="min-w-0 flex-1"
            />
            <button type="button" onClick={onEscanear} className="btn-cayla btn-secundario h-10 shrink-0 gap-2">
              <ScanLine className="h-4 w-4" aria-hidden />
              Escanear
            </button>
          </div>
          <Link
            href={`/devoluciones?item=${linea.ventaItemId}`}
            className="btn-enlace text-sm"
          >
            ¿Nada de su agrado? Pasar a devolución
          </Link>
        </div>
        {lectura ? (
          <Aviso key={lectura.texto} tono={lectura.tono} chico className="mt-3 max-w-md">
            {lectura.texto}
          </Aviso>
        ) : (
          esperandoPistola && (
            <p className="anim-revelar mt-2 text-xs text-tinta/70" role="status">
              Listo para escanear: apunta la pistola a la etiqueta. La prenda, la talla y el color se eligen solos.
            </p>
          )
        )}

        <ElegirTallaYColor r={r} linea={linea} onCambio={onCambio} />

        {r.avisoSinStock && r.varianteNueva && (
          <CambioSalidas
            key={r.varianteNueva.varianteId}
            aviso={r.avisoSinStock}
            referencia={r.varianteNueva.referencia}
            color={r.varianteNueva.color}
            talla={r.varianteNueva.talla}
            varianteId={r.varianteNueva.varianteId}
            otrasSedes={r.varianteNueva.stockOtrasSedes}
            ventaItemId={linea.ventaItemId}
            {...salidas}
          />
        )}

        {r.varianteNueva && !r.sinStockAqui && (
          <div data-guia="cambios.otras-prendas" className="mt-8 space-y-5">
            {extras.map((extra, i) => {
              const er = extrasR[i];
              if (!er) return null;
              const cual = `${i + 2}.ª`;
              return (
                <div key={extra.id} className="space-y-4 rounded-2xl bg-sand/45 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinta/65">Otra prenda · la {cual}</p>
                    <button
                      type="button"
                      onClick={() => onQuitarExtra(extra.id)}
                      aria-label={`Quitar la ${cual} prenda`}
                      title={`Quitar la ${cual} prenda`}
                      className="btn-cayla btn-sutil grid h-8 w-8 place-items-center p-0"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <ComboBuscable
                      id={`${idBase}-extra-${extra.id}`}
                      valor={extra.productoId}
                      onValor={(productoId) => onExtra(extra.id, { productoId, talla: null, color: null })}
                      opciones={opcionesOtraPrenda(extra.productoId)}
                      etiquetaAccesible={`Prenda ${cual} que se lleva`}
                      marcador="Busca la prenda…"
                      className="min-w-[11rem] flex-1 sm:max-w-md"
                    />
                    <PasoCantidad
                      menos={{ onClick: () => onExtra(extra.id, { cantidad: Math.max(1, extra.cantidad - 1) }), deshabilitado: extra.cantidad <= 1, etiqueta: `Una menos de la ${cual} prenda` }}
                      mas={{ onClick: () => onExtra(extra.id, { cantidad: Math.min(99, extra.cantidad + 1) }), deshabilitado: extra.cantidad >= 99, etiqueta: `Una más de la ${cual} prenda` }}
                    >
                      {extra.cantidad}
                    </PasoCantidad>
                  </div>
                  <ElegirTallaYColor r={er} linea={linea} onCambio={(cambio) => onExtra(extra.id, cambio)} />
                  {er.avisoSinStock && (
                    <Aviso tono="atencion" chico>
                      {er.avisoSinStock}
                    </Aviso>
                  )}
                </div>
              );
            })}
            {extras.length < MAX_PRENDAS_EXTRA && (
              <button type="button" onClick={onAgregarExtra} className="btn-cayla btn-secundario gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                {extras.length === 0 ? "Se lleva otra prenda más" : "Agregar otra prenda"}
              </button>
            )}
          </div>
        )}
      </div>

      <fieldset>
        <Pregunta>¿Cómo vuelve la prenda que trae?</Pregunta>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              { valor: "vendible", titulo: "Impecable", detalle: "Vuelve al piso de venta." },
              { valor: "no_vendible", titulo: "Con defecto o uso", detalle: "Va a cuarentena: ahí se decide si se repara, se dona o vuelve al proveedor." },
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
            className="caja-campo-input mt-2 w-24 text-sm"
          />
        </div>
      )}

      <div className="space-y-4 border-t border-tinta/[0.08] pt-8">
        <ComparacionPrendas
          devuelta={{ referencia: linea.referencia, talla: linea.talla, color: linea.color, colorHex: linea.colorHex, fotoUrl: linea.fotoUrl, precio: r.pagadoUnitario, detalle: textoPagoConDescuento(linea) }}
          nueva={
            r.varianteNueva && !r.sinStockAqui
              ? {
                  referencia: r.varianteNueva.referencia,
                  talla: r.varianteNueva.talla,
                  color: r.varianteNueva.color,
                  colorHex: r.varianteNueva.colorHex,
                  fotoUrl: r.varianteNueva.fotoUrl,
                  // El precio con que se calcula la diferencia (`precioParaCambio`): la misma prenda vale lo de la tienda donde se compró.
                  precio: r.precioNueva ?? r.varianteNueva.precio,
                }
              : null
          }
          cantidad={s.cantidad}
          diferencia={totales.diferencia}
          otras={totales.salidas.slice(1).map((x) => ({
            referencia: x.variante.referencia,
            talla: x.variante.talla,
            color: x.variante.color,
            colorHex: x.variante.colorHex,
            fotoUrl: x.variante.fotoUrl,
            precio: x.precio,
            cantidad: x.cantidad,
          }))}
        />

        {r.varianteNueva && !r.sinStockAqui && totales.diferencia !== 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <label htmlFor={`${idBase}-metodo`} className="text-sm text-tinta/75">
              {totales.diferencia > 0 ? "¿Cómo paga la diferencia?" : "¿Cómo se le devuelve?"}
            </label>
            {/* El combo del sistema en caja (ADR-0209); `ref` es su botón, al que Cambios lleva el foco si falta la caja. */}
            <Desplegable
              ref={refMetodo}
              id={`${idBase}-metodo`}
              forma="campo"
              className="w-56 max-w-full"
              valor={s.metodo}
              onValor={(metodo) => onCambio({ metodo })}
              opciones={metodosDiferencia(aceptaQr).map((m) => ({ valor: m.valor, texto: m.etiqueta }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
