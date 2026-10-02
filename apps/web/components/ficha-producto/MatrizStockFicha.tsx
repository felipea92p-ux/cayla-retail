"use client";

import { useEffect, useRef, useState } from "react";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Desplegable } from "@/components/ui/campos";
import type { CampoBloque, FilaFicha } from "@/lib/variantes-ficha-reglas";
import { armarMatriz, totalesMatriz } from "@/lib/matriz-ficha-reglas";
import type { MotivoAjuste } from "@/lib/ajuste-reglas";
import type { ContextoFicha } from "./piezas";
import type { StockFicha } from "./useStockFicha";

// La matriz color × talla de Editar producto (maqueta B, Felipe 2026-10-02): en cada celda el stepper −/N/+ —el mismo gesto que
// la tabla de cantidades del alta (MatrizCantidades)— con el stock de HOY, nunca un 0 que confunde; debajo, chico, su precio (o su
// costo, si «Cambiar en bloque» está en Costo), que se toca para corregirlo. Totales por color, por talla y general.
//
// La cantidad NO se guarda con «Revisar y guardar»: cada toque es un ajuste de inventario con el motivo de la visita (ver
// `useStockFicha`). El precio y el costo SÍ esperan a «Revisar y guardar», como siempre (ADR-0257): se marcan en ámbar.

const texto = (n: string) => {
  const v = Number(n);
  if (!(v > 0)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

export function MatrizStockFicha({
  ctx,
  filas,
  stock,
  verCosto,
  colorActivo,
  onElegirColor,
  onVerColor,
  onCambioFila,
  onAbrirModal,
  deshabilitado,
}: {
  ctx: ContextoFicha;
  filas: FilaFicha[];
  stock: StockFicha;
  /** «Cambiar en bloque» está en Costo: la celda muestra el costo en vez del precio. */
  verCosto: boolean;
  colorActivo: string | null;
  onElegirColor: (c: string | null) => void;
  /** Al pasar el mouse por un color, el panel lo muestra (sin elegirlo). `undefined` = vuelve al elegido. */
  onVerColor: (c: string | null | undefined) => void;
  onCambioFila: (clave: string, cambio: Partial<Pick<FilaFicha, CampoBloque>>) => void;
  /** Una talla que faltó en un conteo cerrado: el «+» abre el ajuste de siempre, que pregunta si es esa (ADR-0291). */
  onAbrirModal: (color: string | null) => void;
  deshabilitado: boolean;
}) {
  const n = ctx.nombres;
  const m = armarMatriz(filas, n);
  const numero = (f: FilaFicha) => (f.id && f.guardada ? stock.numero(f.id) : stock.numeroNueva(f.clave));
  const totales = totalesMatriz(m, numero);
  const [tocadas, setTocadas] = useState<ReadonlySet<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const relojes = useRef(new Map<string, number>());

  useEffect(() => {
    const r = relojes.current;
    return () => r.forEach((t) => window.clearTimeout(t));
  }, []);

  function destellar(claves: string[]) {
    setTocadas((a) => new Set([...a, ...claves]));
    for (const c of claves) {
      window.clearTimeout(relojes.current.get(c));
      relojes.current.set(
        c,
        window.setTimeout(() => setTocadas((a) => new Set([...a].filter((x) => x !== c))), 480)
      );
    }
  }

  function paso(f: FilaFicha, p: 1 | -1) {
    if (f.id && f.guardada) {
      const r = stock.paso(f.id, p);
      if (r.abrirModal) return onAbrirModal(f.guardada.colorCodigo);
    } else stock.pasoNueva(f.clave, p);
    destellar([f.clave]);
  }

  const donde = stock.lugar === "piso" ? "en el piso" : stock.lugar === "almacen" ? "en el almacén" : "en esta sede";

  if (m.colores.length === 0) return <p className="text-sm text-taupe">Esta prenda no tiene variantes activas. Agrega un color.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="taller-matriz" id="matriz-variantes">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Color</span>
            </th>
            {m.tallas.map((t) => (
              <th key={t ?? "sin-talla"} scope="col">
                {n.talla(t) || "Única"}
              </th>
            ))}
            {m.tallas.length > 1 && (
              <th scope="col" className="!text-taupe">
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {m.colores.map((c) => {
            const delColor = filas.filter((f) => f.activo && f.colorCodigo === c);
            const esNuevo = delColor.every((f) => !f.guardada);
            const color = ctx.colores.find((x) => x.codigo === c);
            return (
              <tr key={c ?? "sin-color"} id={`matriz-color-${c ?? "sin-color"}`} className={esNuevo ? "taller-fila-nueva" : undefined}>
                <td className="whitespace-nowrap pr-2">
                  <button
                    type="button"
                    className="taller-fila-color"
                    aria-pressed={c === colorActivo}
                    title={`Ver ${n.color(c)} en el panel`}
                    onClick={() => onElegirColor(c)}
                    onMouseEnter={() => onVerColor(c)}
                    onMouseLeave={() => onVerColor(undefined)}
                  >
                    <span className="grid h-[13px] w-[13px] place-items-center overflow-hidden rounded-full">
                      <span className="block scale-[1.3]">{color ? <Punto hex={color.hex} familia={color.familiaColor} /> : <Punto hex={null} />}</span>
                    </span>
                    {n.color(c)}
                    {esNuevo && <span className="ml-1 text-[9.5px] font-bold uppercase tracking-wide text-ambar-profundo">nueva</span>}
                  </button>
                </td>
                {m.tallas.map((t) => {
                  const f = m.celda(c, t);
                  if (!f) {
                    return (
                      <td key={t ?? "x"}>
                        <span className="taller-celda-vacia" title="Esta combinación no existe">
                          —
                        </span>
                      </td>
                    );
                  }
                  const guardada = !!(f.id && f.guardada);
                  const u = numero(f);
                  const nombre = `${n.color(c)} · ${n.talla(t) || "Única"}`;
                  // Mientras llega el stock de la base, «…»: un 0 de relleno se lee como «no hay nada» (Felipe, 2026-10-02).
                  const esperando = guardada && stock.cargando;
                  const puedeBajar = guardada ? !esperando && stock.puedeAjustar && stock.puedeBajar(f.id!) : u > 0;
                  const puedeSubir = guardada ? !esperando && stock.puedeAjustar : true;
                  const campo: CampoBloque = verCosto && ctx.veCosto ? "costo" : "precio";
                  const valor = campo === "precio" ? f.precio : f.costo;
                  const antes = f.guardada ? (campo === "precio" ? f.guardada.precio : f.guardada.costo) : null;
                  const cambiado = antes !== null && Number(antes) !== Number(valor);
                  const fijo = campo === "costo" && f.costoFijo;
                  return (
                    <td key={f.clave}>
                      <div className="taller-celda" data-tocada={tocadas.has(f.clave) || undefined} data-nueva={!guardada || undefined}>
                        {guardada && !stock.puedeAjustar ? (
                          <span className="taller-stepper">
                            <span className="taller-val px-2" title="Tu rol no ajusta stock">
                              {esperando ? "…" : u}
                            </span>
                          </span>
                        ) : (
                          <span className="taller-stepper">
                            <button type="button" aria-label={`Una menos de ${nombre}`} disabled={deshabilitado || !puedeBajar} onClick={() => paso(f, -1)}>
                              −
                            </button>
                            <span className="taller-val" aria-live="polite">
                              {esperando ? "…" : u}
                            </span>
                            <button type="button" aria-label={`Una más de ${nombre}`} disabled={deshabilitado || !puedeSubir} onClick={() => paso(f, 1)}>
                              +
                            </button>
                          </span>
                        )}
                        {editando === f.clave && !fijo ? (
                          <input
                            autoFocus
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            id={`producto-variante-${f.clave}-${campo}`}
                            aria-label={`${campo === "precio" ? "Precio" : "Costo"} de ${nombre}`}
                            defaultValue={valor}
                            className="taller-precio-caja [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            onBlur={(e) => {
                              onCambioFila(f.clave, { [campo]: e.target.value });
                              setEditando(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                setEditando(null);
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            id={`producto-variante-${f.clave}-${campo}`}
                            className="taller-precio"
                            data-cambiado={cambiado || undefined}
                            disabled={deshabilitado || fijo}
                            title={
                              fijo
                                ? "Este costo viene de compras: no se corrige a mano"
                                : cambiado
                                  ? `Antes S/ ${texto(antes!)} · se guarda con «Revisar y guardar»`
                                  : `Tocar para cambiar el ${campo} de ${nombre}`
                            }
                            onClick={() => setEditando(f.clave)}
                          >
                            {campo === "precio" ? `S/ ${texto(valor)}` : `costo S/ ${texto(valor)}`}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
                {m.tallas.length > 1 && <td className="taller-total">{stock.cargando ? "…" : (totales.porColor.get(c) ?? 0)}</td>}
              </tr>
            );
          })}
        </tbody>
        {m.colores.length > 1 && (
          <tfoot>
            <tr className="taller-fila-total">
              <td>Total {donde}</td>
              {m.tallas.map((t) => (
                <td key={t ?? "sin-talla"}>{stock.cargando ? "…" : (totales.porTalla.get(t) ?? 0)}</td>
              ))}
              {m.tallas.length > 1 && <td>{stock.cargando ? "…" : totales.total}</td>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** «Registrar los ajustes de stock de esta visita como [Conteo físico]» — el motivo, el lugar y quién, UNA vez por visita. */
export function MotivoDeLaVisita({ stock, deshabilitado }: { stock: StockFicha; deshabilitado: boolean }) {
  if (!stock.puedeAjustar) {
    return <p className="mt-2.5 text-[12px] text-taupe">Tu rol ve el stock de cada talla; para ajustarlo hace falta el módulo «Ajustar stock».</p>;
  }
  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-taupe">
        <span>Registrar los ajustes de stock de esta visita como</span>
        <Desplegable<MotivoAjuste>
          forma="cajaBaja"
          className="w-auto min-w-[9.5rem]"
          etiquetaAccesible="Motivo de los ajustes de stock"
          valor={stock.motivo}
          onValor={stock.cambiarMotivo}
          opciones={stock.motivos}
          deshabilitado={deshabilitado}
        />
        {stock.separaPisoAlmacen && (
          <>
            <span>en</span>
            <Desplegable<"almacen" | "piso">
              forma="cajaBaja"
              className="w-auto min-w-[10rem]"
              etiquetaAccesible="Dónde se ajusta el stock"
              valor={stock.ubicado}
              onValor={stock.cambiarUbicado}
              opciones={[
                { valor: "almacen", texto: "el almacén" },
                { valor: "piso", texto: "el piso de venta" },
              ]}
              deshabilitado={deshabilitado || stock.hayPendientes}
            />
          </>
        )}
      </div>
      <div id="ficha-stock-responsable" className="max-w-sm">
        <ComboResponsable control={stock.responsable} compacto deshabilitado={deshabilitado} />
      </div>
    </div>
  );
}
