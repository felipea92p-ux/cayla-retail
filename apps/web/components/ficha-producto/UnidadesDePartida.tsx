"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { limpiarCantidad } from "@/lib/alta-producto";
import type { FilaFicha } from "@/lib/variantes-ficha-reglas";
import type { ContextoFicha } from "./piezas";

// Las piezas de «Agregar color» y «Agregar talla» que preguntan con cuántas unidades NACE cada variante (ADR-0494, actividad 3; maqueta
// `docs/maquetas/stock-solo-en-existencias-2026-10/`). Es la única ocasión en que se escribe stock desde Editar producto: al guardar,
// el número se sella (la celda de la tabla pasa a llevar su candado) y después solo se ajusta en Existencias.
//
//  · `PasosDeAgregar`: los dos pasos arriba («Elige el color» → «Unidades de partida»), con su ✓ y su hilo que se llena.
//  · `UnidadesDeLasNuevas`: una caja − N + por variante que nace, «+1 a todas», «En 0» y el total.
//  · `VistaPreviaDeLaTabla`: «Así quedará en la tabla»: lo que ya hay atenuado y lo que nace en ámbar, con sus unidades.
// Ninguna decide nada: cada modal les pasa sus filas, sus columnas y qué hace cada botón.

/** Los dos pasos de arriba. El 1.º se llena cuando ya se eligió lo que llegó; el 2.º dice «Unidades de partida» o «Cómo nace». */
export function PasosDeAgregar({ primero, segundo, hechoPrimero }: { primero: string; segundo: string; hechoPrimero: boolean }) {
  const paso = (n: number, texto: string, hecho: boolean, ahora: boolean) => (
    <li className={`flex items-center gap-2 text-[13px] font-medium transition-colors duration-300 ease-cayla ${ahora || hecho ? "text-tinta" : "text-tinta/50"}`}>
      <span
        aria-hidden
        className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[11px] font-semibold transition-[background-color,border-color,color] duration-300 ease-cayla ${
          hecho ? "border-verde bg-verde text-crema-fija" : ahora ? "border-tinta" : "border-borde-control"
        }`}
      >
        {hecho ? <Check className="h-3 w-3" /> : n}
      </span>
      {texto}
    </li>
  );
  return (
    <ol className="flex items-center gap-3" aria-label="Pasos">
      {paso(1, primero, hechoPrimero, !hechoPrimero)}
      <span aria-hidden className="relative h-px flex-1 bg-sand">
        <span className={`absolute inset-0 origin-left bg-verde transition-transform duration-500 ease-cayla motion-reduce:transition-none ${hechoPrimero ? "scale-x-100" : "scale-x-0"}`} />
      </span>
      {paso(2, segundo, false, hechoPrimero)}
    </ol>
  );
}

export type FilaDeUnidades = { id: string | null; nombre: string; punto?: ReactNode };
export type ColumnaDeUnidades = { id: string | null; texto: string };

/**
 * La cuadrícula de unidades de partida: una fila por color y una columna por talla (en «Agregar talla», las filas son los colores de
 * la prenda y la columna la talla nueva). Solo lleva caja la combinación que de verdad nace (`incluida`): la que se quitó en la tabla
 * de arriba no existe aquí.
 */
export function UnidadesDeLasNuevas({
  filas,
  columnas,
  incluida,
  valor,
  onFijar,
  onPaso,
  onTodas,
  onCeros,
  total,
  deshabilitado = false,
}: {
  filas: readonly FilaDeUnidades[];
  columnas: readonly ColumnaDeUnidades[];
  incluida: (fila: string | null, columna: string | null) => boolean;
  valor: (fila: string | null, columna: string | null) => number;
  onFijar: (fila: string | null, columna: string | null, n: number) => void;
  /** «−» y «+»: se suma sobre el número MÁS reciente (dos toques seguidos cuentan dos), no sobre el que se pintó. */
  onPaso: (fila: string | null, columna: string | null, paso: 1 | -1) => void;
  onTodas: () => void;
  onCeros: () => void;
  total: number;
  deshabilitado?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-sand">
        <table /* unificar-fijo: matriz color × talla, como MatrizNuevas y las matrices de la ficha (las matrices de tallas quedan aparte) */ className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-hueso">
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-tinta">
                Color
              </th>
              {columnas.map((c) => (
                <th key={c.id ?? "unica"} scope="col" className="px-2 py-2 text-xs font-semibold tabular-nums text-tinta">
                  {c.texto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id ?? "sin-color"} className="border-t border-sand">
                <th scope="row" className="whitespace-nowrap bg-papel px-2 py-2 text-left font-medium text-tinta sm:px-3">
                  <span className="inline-flex items-center gap-2">
                    {f.punto}
                    {f.nombre}
                  </span>
                </th>
                {columnas.map((c) => {
                  const etiqueta = `${f.nombre} · ${c.texto}`;
                  if (!incluida(f.id, c.id)) return <td key={c.id ?? "unica"} className="border-l border-sand px-2 py-1.5 text-center text-tinta/30">—</td>;
                  const n = valor(f.id, c.id);
                  return (
                    <td key={c.id ?? "unica"} className="border-l border-sand px-0.5 py-1.5 text-center sm:px-2">
                      <PasoCantidad
                        tamano="celda"
                        sinTab
                        className="matriz-paso mx-auto"
                        data-cambiada={n > 0 || undefined}
                        data-nueva
                        menos={{ onClick: () => onPaso(f.id, c.id, -1), deshabilitado: deshabilitado || n <= 0, etiqueta: `Restar a ${etiqueta}` }}
                        mas={{ onClick: () => onPaso(f.id, c.id, 1), deshabilitado, etiqueta: `Sumar a ${etiqueta}` }}
                        campo={{
                          type: "text",
                          inputMode: "numeric",
                          pattern: "[0-9]*",
                          maxLength: 4,
                          autoComplete: "off",
                          "aria-label": `Con cuántas unidades nace ${etiqueta}`,
                          placeholder: "0", // sugerir-fijo: una cantidad vacía es cero, sea cual sea la prenda
                          value: String(n),
                          disabled: deshabilitado,
                          onChange: (e) => onFijar(f.id, c.id, Number(limpiarCantidad(e.target.value) || 0)),
                          onFocus: (e) => e.currentTarget.select(),
                          className: `@lg:w-9 placeholder:text-tinta/25 ${n > 0 ? "text-ambar-profundo" : ""}`,
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-tinta/80">
        <span>
          Entran <b className="font-serif text-[20px] font-medium tabular-nums text-tinta">{total}</b> {total === 1 ? "unidad" : "unidades"} al <b>almacén</b>
        </span>
        <span className="flex gap-1">
          <button type="button" onClick={onTodas} disabled={deshabilitado} className="btn-cayla btn-sutil btn-chico">
            +1 a todas
          </button>
          <button type="button" onClick={onCeros} disabled={deshabilitado || total === 0} className="btn-cayla btn-sutil btn-chico">
            En 0
          </button>
        </span>
      </div>
    </div>
  );
}

export type FilaDeVistaPrevia = { nombre: string; punto?: ReactNode; nueva: boolean; celdas: { texto: string; nueva: boolean }[] };

/** «Así quedará en la tabla»: lo que ya hay, atenuado, y lo que nace, en ámbar y con sus unidades. */
export function VistaPreviaDeLaTabla({ columnas, filas }: { columnas: readonly { texto: string; nueva: boolean }[]; filas: readonly FilaDeVistaPrevia[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-sand">
      <table /* unificar-fijo: matriz color × talla, como MatrizNuevas y las matrices de la ficha (las matrices de tallas quedan aparte) */ className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-hueso">
            <th scope="col" className="px-3 py-2" />
            {columnas.map((c, i) => (
              <th key={i} scope="col" className={`px-2 py-2 text-xs font-semibold tabular-nums ${c.nueva ? "bg-ambar/15 text-ambar-profundo" : "text-tinta"}`}>
                {c.texto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className={`border-t border-sand ${f.nueva ? "anim-revelar" : ""}`}>
              <th scope="row" className={`whitespace-nowrap px-3 py-2 text-left font-medium ${f.nueva ? "text-tinta shadow-[inset_3px_0_0_var(--color-ambar)]" : "text-tinta/75"}`}>
                <span className="inline-flex items-center gap-2">
                  {f.punto}
                  {f.nombre}
                  {f.nueva && <Chip tono="ambar" versalitas={false}>Nueva</Chip>}
                </span>
              </th>
              {f.celdas.map((c, j) => (
                <td key={j} className={`px-2 py-2 text-center tabular-nums ${c.nueva ? "bg-ambar/15 font-semibold text-ambar-profundo" : "text-tinta/65"}`}>
                  {c.texto}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** «Ya están en esta prenda»: lo que ya vende, en una línea de fichas punteadas (así se ve qué hay y no se duplica). */
export function YaEstan({ titulo = "Ya están en esta prenda", items }: { titulo?: string; items: readonly { clave: string; texto: string; punto?: ReactNode }[] }) {
  if (items.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-taupe">
      <span>{titulo}</span>
      {items.map((i) => (
        <span key={i.clave} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-borde-control px-2.5 py-0.5 text-tinta/80">
          {i.punto}
          {i.texto}
        </span>
      ))}
    </p>
  );
}

/** Lo que ya hay de una variante guardada EN ESTA SEDE, como lo dice la tabla de la ficha (no la suma de todas las sedes). «·» si no se sabe. */
export function numeroDeLaSede(f: FilaFicha, ctx: ContextoFicha): string {
  const e = f.id ? ctx.estado?.[f.id] : null;
  if (!e) return "·";
  const sede = ctx.ajusteStock?.ubicacionId;
  return String(sede ? (e.sedes.find((s) => s.ubicacionId === sede)?.cantidad ?? 0) : e.stock);
}
