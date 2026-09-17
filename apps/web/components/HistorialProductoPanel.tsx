"use client";

import { useMemo, useState } from "react";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";
import { PaginacionCursor } from "@/components/Paginacion";
import { MovimientoDetalle } from "@/components/MovimientoDetalle";
import {
  ETIQUETA_CATEGORIA,
  etiquetaDia,
  etiquetaProceso,
  textoDelta,
  tonoCategoria,
  type Movimiento,
} from "@/lib/movimientos-reglas";
import type { CambioProducto } from "@/lib/historial-producto";

// Historial de Producto (Sesión A3, 2026-09-15): DOS fuentes distintas en un
// solo panel — `movimientos` (stock: venta, traslado, ajuste, recepción) y
// `historial_producto_cambios` (precio/categoría, decisión de Felipe de
// incluirlos aunque no sean movimientos de stock). No se mezclan en una sola
// lista: son dos preguntas distintas ("¿por qué cambió el stock?" vs. "¿desde
// cuándo cuesta esto?") y forzarlas a una tabla común habría perdido las
// columnas propias de cada una.
//
// Sede por sede, con selector — igual que `/movimientos` (decisión de
// Felipe): reusa el modelo de permiso ya existente en vez de agregar por
// toda la red. Los cambios de precio/categoría, en cambio, no dependen de una
// sede (un producto tiene una sola categoría, cada variante un solo precio,
// sin importar dónde se mire) y se muestran completos siempre.
export function HistorialProductoPanel({
  productoId,
  ubicaciones,
  ubicacionActivaId,
  puedeCambiarUbicacion,
  movimientos,
  cambios,
  hoyLima,
  cursorSiguiente,
  hayCursor,
  pathname,
}: {
  productoId: string;
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActivaId: string;
  puedeCambiarUbicacion: boolean;
  movimientos: Movimiento[];
  cambios: CambioProducto[];
  hoyLima: string;
  cursorSiguiente: string | null;
  hayCursor: boolean;
  pathname: string;
}) {
  return (
    <div className="space-y-6" data-producto-id={productoId}>
      <SeccionCambios cambios={cambios} />
      <SeccionMovimientos
        ubicaciones={ubicaciones}
        ubicacionActivaId={ubicacionActivaId}
        puedeCambiarUbicacion={puedeCambiarUbicacion}
        movimientos={movimientos}
        hoyLima={hoyLima}
        cursorSiguiente={cursorSiguiente}
        hayCursor={hayCursor}
        pathname={pathname}
      />
    </div>
  );
}

const ETIQUETA_CAMPO: Record<CambioProducto["campo"], string> = { categoria_id: "Categoría", precio: "Precio", estado: "Estado", costo: "Costo" };
const ETIQUETA_ESTADO: Record<string, string> = { activo: "Activo", descontinuado: "Descontinuado" };

function textoValorCambio(c: CambioProducto, cual: "anterior" | "nuevo"): string {
  if (c.campo === "categoria_id") {
    return (cual === "anterior" ? c.categoriaAnteriorNombre : c.categoriaNuevaNombre) ?? "Sin categoría";
  }
  const valor = cual === "anterior" ? c.valorAnterior : c.valorNuevo;
  if (c.campo === "estado") return valor ? (ETIQUETA_ESTADO[valor] ?? valor) : "—";
  return valor ? `S/${Number(valor).toFixed(2)}` : "—";
}

function fechaHoraLima(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SeccionCambios({ cambios }: { cambios: CambioProducto[] }) {
  return (
    <div className="card-cayla p-5">
      <p className="label-cayla text-[11px] text-tinta/65">Precio, costo, categoría y estado</p>
      {cambios.length === 0 ? (
        <p className="mt-2 text-sm text-tinta/65">Sin cambios registrados desde que existe este historial.</p>
      ) : (
        <ul className="mt-3 divide-y divide-tinta/10">
          {cambios.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="text-tinta">{ETIQUETA_CAMPO[c.campo]}</span>
                {c.entidad === "variante" && (
                  <span className="ml-2 font-mono text-xs text-tinta/65">
                    {c.varianteSku}
                    {(c.varianteTalla || c.varianteColor) && ` · ${[c.varianteTalla, c.varianteColor].filter(Boolean).join(" · ")}`}
                  </span>
                )}
                <span className="ml-2 text-tinta/75">
                  {textoValorCambio(c, "anterior")} <span className="text-tinta/40">→</span> {textoValorCambio(c, "nuevo")}
                </span>
              </span>
              <span className="shrink-0 text-xs text-tinta/55">
                {fechaHoraLima(c.creadoEn)} · {c.usuarioNombre ?? "Persona no identificada"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Vista = "fecha" | "variante";
const PLANTILLA = "sm:grid-cols-[3rem_6.75rem_1.1fr_1fr_3.5rem] lg:grid-cols-[3rem_6.75rem_1.1fr_1fr_3.5rem_7rem]";

function SeccionMovimientos({
  ubicaciones,
  ubicacionActivaId,
  puedeCambiarUbicacion,
  movimientos,
  hoyLima,
  cursorSiguiente,
  hayCursor,
  pathname,
}: {
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActivaId: string;
  puedeCambiarUbicacion: boolean;
  movimientos: Movimiento[];
  hoyLima: string;
  cursorSiguiente: string | null;
  hayCursor: boolean;
  pathname: string;
}) {
  const [vista, setVista] = useState<Vista>("fecha");
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierto = abiertoId ? (movimientos.find((m) => m.id === abiertoId) ?? null) : null;

  // Por fecha: mismo agrupado que `/movimientos` (la lista ya llega ordenada
  // por `created_at desc`, los grupos salen en orden solos). Por variante:
  // una variante por grupo, en el orden en que aparece su primer movimiento
  // — no alfabético, para que la más reciente encabece.
  const grupos = useMemo(() => {
    if (vista === "fecha") {
      const dias: { titulo: string; clave: string; filas: Movimiento[] }[] = [];
      for (const m of movimientos) {
        const ultimo = dias[dias.length - 1];
        if (ultimo && ultimo.clave === m.fecha) ultimo.filas.push(m);
        else dias.push({ titulo: etiquetaDia(m.fecha, hoyLima), clave: m.fecha, filas: [m] });
      }
      return dias;
    }
    const porVariante = new Map<string, { titulo: string; clave: string; filas: Movimiento[] }>();
    for (const m of movimientos) {
      const detalle = [m.talla, m.color].filter(Boolean).join(" · ");
      const existente = porVariante.get(m.varianteId);
      if (existente) existente.filas.push(m);
      else porVariante.set(m.varianteId, { titulo: `${m.sku}${detalle ? ` · ${detalle}` : ""}`, clave: m.varianteId, filas: [m] });
    }
    return [...porVariante.values()];
  }, [vista, movimientos, hoyLima]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-tinta/15 p-0.5">
          {(["fecha", "variante"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={`label-cayla rounded-full px-3 py-1 text-[11px] transition-colors ${
                vista === v ? "bg-tinta text-crema" : "text-tinta/65 hover:text-tinta"
              }`}
            >
              {v === "fecha" ? "Por fecha" : "Por variante"}
            </button>
          ))}
        </div>
        {puedeCambiarUbicacion && <SelectorUbicacion ubicaciones={ubicaciones} ubicacionActualId={ubicacionActivaId} />}
      </div>

      {movimientos.length === 0 && !hayCursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay movimientos de este producto en esta ubicación.</p>
      ) : (
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Hora" },
              { titulo: "Tipo" },
              { titulo: vista === "variante" ? "Sede" : "Prenda" },
              { titulo: "Proceso · Referencia" },
              { titulo: "Cant.", alinear: "der" },
              { titulo: "Persona", desdeLg: true },
            ]}
          />
          {grupos.map((g) => (
            <div key={g.clave} className="divide-y divide-tinta/10">
              <div className="flex items-baseline justify-between bg-tinta/[0.03] px-5 py-1.5">
                <span className="label-cayla text-[11px] text-tinta">{g.titulo}</span>
                <span className="text-xs text-tinta/55">
                  {g.filas.length} {g.filas.length === 1 ? "movimiento" : "movimientos"}
                </span>
              </div>
              {g.filas.map((m) => {
                const detallePrenda = [m.talla, m.color].filter(Boolean).join(" · ");
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAbiertoId(m.id)}
                    className={fila(PLANTILLA, "w-full text-left transition-colors hover:bg-tinta/[0.03] focus-visible:bg-tinta/[0.03] focus-visible:outline-none")}
                  >
                    <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{m.hora}</span>
                    <span className={celda("izq", "overflow-visible")}>
                      <Chip tono={tonoCategoria(m.categoria, m.delta)}>{ETIQUETA_CATEGORIA[m.categoria]}</Chip>
                    </span>
                    <span className="min-w-0">
                      {vista === "variante" ? (
                        <span className="block truncate text-sm text-tinta">{m.ubicacion}</span>
                      ) : (
                        <>
                          <span className="block truncate text-sm text-tinta" title={m.referencia}>{m.referencia}</span>
                          <span className="block truncate text-xs text-tinta/65" title={`${m.sku}${detallePrenda ? ` · ${detallePrenda}` : ""}`}>
                            <span className="font-mono">{m.sku}</span>
                            {detallePrenda && ` · ${detallePrenda}`}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="min-w-0 text-xs">
                      <span className="block truncate text-sm text-tinta">
                        {etiquetaProceso(m.motivo)}
                        {m.esSistema && <span className="label-cayla ml-1.5 text-[10px] text-tinta/50">Sistema</span>}
                      </span>
                    </span>
                    <span
                      className={celda(
                        "der",
                        `text-sm font-semibold ${m.delta > 0 ? "text-verde-profundo" : m.delta < 0 ? "text-tinta" : "text-tinta/65"}`
                      )}
                    >
                      {textoDelta(m)}
                    </span>
                    <span className={celda("izq", "hidden text-xs text-tinta/65 lg:block")} title={m.usuario ?? undefined}>
                      {m.esSistema ? "—" : (m.usuario ?? "—")}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </Tabla>
      )}

      <div className="mt-3">
        <PaginacionCursor
          mostradas={movimientos.length}
          cursorSiguiente={cursorSiguiente}
          hayCursor={hayCursor}
          params={{ ubicacion: ubicacionActivaId }}
          pathname={pathname}
          sustantivo={["movimiento", "movimientos"]}
        />
      </div>

      {abierto && <MovimientoDetalle movimiento={abierto} onClose={() => setAbiertoId(null)} />}
    </div>
  );
}
