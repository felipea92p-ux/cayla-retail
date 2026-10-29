"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import type { Apariencia } from "@/lib/ingresos";
import {
  costoDelModelo,
  cuentaNovedad,
  filtrarPorNovedad,
  modelosTexto,
  precioDelModelo,
  prendasTexto,
  type FiltroNovedad,
  type ModeloIngresado,
} from "@/lib/ingresos-reglas";

// La lista de modelos de «Ingresos»: una línea por modelo con su foto, si es Nuevo o un Reingreso, cuántas prendas entraron, su
// precio en esta sede y —solo para quien ve el dinero— su costo. Vive en el cliente porque se filtra y (en las siguientes
// pasadas) se ordena y se abre sin volver al servidor: el rango ya trajo todo lo que se muestra.

export function IngresosTabla({
  modelos,
  apariencia,
  veCosto,
  rangoTexto,
}: {
  modelos: ModeloIngresado[];
  apariencia: Record<string, Apariencia>;
  veCosto: boolean;
  rangoTexto: string;
}) {
  const [filtro, setFiltro] = useState<FiltroNovedad>("todos");
  const cuenta = cuentaNovedad(modelos);
  // Con una sola clase de modelos el filtro no filtra nada: no se ofrece, y si estaba puesto se vuelve a «todos».
  const activo: FiltroNovedad = cuenta.hayDeLasDos ? filtro : "todos";
  const visibles = filtrarPorNovedad(modelos, activo);
  const prendas = visibles.reduce((suma, m) => suma + m.unidades, 0);

  // Una plantilla para el encabezado y las filas (Tabla). El costo solo existe para quien lo ve: su columna no se dibuja vacía.
  const plantilla = veCosto ? "sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem_8rem]" : "sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem]";
  const columnas: Columna[] = [
    { titulo: "Modelo" },
    { titulo: "Prendas", alinear: "der" },
    { titulo: "Precio", alinear: "der", ayuda: "Lo que se cobra en esta sede por lo que entró" },
    ...(veCosto ? [{ titulo: "Costo", alinear: "der" as const, ayuda: "Lo que costó. Solo lo ve quien tiene permiso de dinero." }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p data-guia="movimientos.ingresos-total" className="text-sm text-taupe">
          <b className="font-semibold text-tinta">{prendasTexto(prendas)}</b> en {modelosTexto(visibles.length)}, {rangoTexto}.
        </p>
        {cuenta.hayDeLasDos && (
          <div role="group" aria-label="Nuevos o reingresos" data-guia="movimientos.ingresos-novedad" className="flex flex-wrap items-center gap-1.5">
            <Pastilla activa={activo === "todos"} onClick={() => setFiltro("todos")} cuenta={modelos.length}>
              Todos
            </Pastilla>
            <Pastilla activa={activo === "nuevo"} onClick={() => setFiltro("nuevo")} cuenta={cuenta.nuevos}>
              Nuevos
            </Pastilla>
            <Pastilla activa={activo === "reingreso"} onClick={() => setFiltro("reingreso")} cuenta={cuenta.reingresos}>
              Reingresos
            </Pastilla>
          </div>
        )}
      </div>
      <Tabla guia="movimientos.ingresos-tabla">
        <Encabezado columnas={columnas} plantilla={plantilla} />
        {visibles.map((m, i) => {
          const a = apariencia[m.productoId];
          const detalle = [m.codigo, m.categoria].filter(Boolean).join(" · ");
          return (
            <div key={m.productoId} role="row" className={fila(plantilla, "items-center")}>
              <div className={celda("izq", "flex items-center gap-3")}>
                <MiniaturaPrenda tamano="lg" fotoUrl={a?.fotoUrl ?? null} prefijo={a?.prefijo} familia={a?.familia} categoria={a?.categoria} />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-tinta">{m.referencia}</span>
                    <span data-guia={i === 0 ? "movimientos.ingresos-etiqueta" : undefined} className="shrink-0">
                      <Chip tono={m.esNuevo ? "verde" : "pizarra"} versalitas={false} title={m.esNuevo ? "Es la primera vez que entra este modelo" : "Este modelo ya había entrado antes"}>
                        {m.esNuevo ? "Nuevo" : "Reingreso"}
                      </Chip>
                    </span>
                  </span>
                  {detalle && <span className="block truncate text-xs text-taupe">{detalle}</span>}
                </span>
              </div>
              <span
                className={celda("der", "text-sm font-semibold text-tinta")}
                title={`${m.deStockInicial.toLocaleString("es-PE")} de stock inicial · ${m.deRecepcion.toLocaleString("es-PE")} de mercadería recibida`}
              >
                {m.unidades.toLocaleString("es-PE")}
              </span>
              <span data-guia={i === 0 ? "movimientos.ingresos-precio" : undefined} className={celda("der", "text-sm text-tinta")}>
                <Etiqueta>Precio </Etiqueta>
                {precioDelModelo(m)}
              </span>
              {veCosto && (
                <span className={celda("der", "text-sm text-tinta/75")}>
                  <Etiqueta>Costo </Etiqueta>
                  {costoDelModelo(m)}
                </span>
              )}
            </div>
          );
        })}
      </Tabla>
    </>
  );
}

/** En el celular el encabezado de la tabla se esconde y cada fila apila sus datos: cada cifra dice qué es. */
function Etiqueta({ children }: { children: string }) {
  return <span className="text-xs text-taupe sm:hidden">{children}</span>;
}

/** La píldora de filtro del sistema (ADR-0358) con cuántos modelos tiene. */
function Pastilla({ activa, onClick, cuenta, children }: { activa: boolean; onClick: () => void; cuenta: number; children: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className="pildora-cayla shrink-0">
      {children}
      <span className="pildora-cayla__n">{cuenta.toLocaleString("es-PE")}</span>
    </button>
  );
}
