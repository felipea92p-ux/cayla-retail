"use client";

import { useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { useResponsable } from "@/lib/useResponsable";

// La prenda que se va a crear, tal como va a quedar (spike Nuevo producto, 2026-09-24). Reemplaza al «Resumen» con la
// lista «Falta» completa: en vez de enumerar todo lo pendiente desde el primer segundo, dice UNA cosa, el siguiente
// paso. En escritorio va fija a la derecha; en celular baja a una barra pegada abajo con «Crear» (PL-105), y «Ver»
// despliega la ficha encima. Las dos llevan el mismo botón de enviar el formulario.

export type DatosFicha = {
  nombre: string;
  codigo: string | null;
  codigosVariantes: string[];
  categoria: string | null;
  marca: string | null;
  tallas: string;
  tejidoPatron: string;
  variantes: number | null;
  precio: number | null;
  colores: { codigo: string; hex: string | null }[];
  /** Vista previa local de la foto que quedaría de principal. */
  foto: string | null;
  fotos: number;
  siguiente: string | null;
};

type Control = ReturnType<typeof useResponsable>;

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const Vacio = ({ children = "—" }: { children?: string }) => <span className="text-tinta/25">{children}</span>;

function Tarjeta({ d }: { d: DatosFicha }) {
  return (
    <div className="overflow-hidden rounded-xl border border-sand bg-papel">
      <div className="relative grid h-32 place-items-center bg-hueso text-center text-xs text-taupe">
        {d.foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img src={d.foto} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="px-6">Agrega fotos por color en «Cómo se hace»</span>
        )}
        {d.colores.length > 0 && (
          <div className="absolute bottom-2.5 left-3 flex gap-1">
            {d.colores.map((c) => (
              <span key={c.codigo} aria-hidden className="h-3.5 w-3.5 rounded-full border-[1.5px] border-papel" style={{ background: c.hex ?? "transparent" }} />
            ))}
          </div>
        )}
        {d.fotos > 0 && <span className="absolute right-2.5 top-2.5 rounded-full bg-papel/90 px-2 py-0.5 text-[11px] tabular-nums text-tinta">{d.fotos} foto{d.fotos === 1 ? "" : "s"}</span>}
      </div>
      <div className="px-4 pb-4 pt-3.5">
        <p className="font-mono text-[12.5px] tabular-nums text-taupe">{d.codigo ?? <Vacio>— código —</Vacio>}</p>
        <p className="font-display mt-0.5 text-2xl leading-tight text-tinta">{d.nombre || <Vacio>Sin nombre</Vacio>}</p>
        <p className="text-[13px] text-taupe">
          {d.categoria ?? <Vacio>Sin categoría</Vacio>}
          {d.marca && ` · ${d.marca}`}
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-taupe">Tallas</dt>
          <dd className="text-right font-medium tabular-nums">{d.tallas || <Vacio />}</dd>
          <dt className="text-taupe">Tejido y patrón</dt>
          <dd className="text-right font-medium">{d.tejidoPatron || <Vacio />}</dd>
          <dt className="text-taupe">Variantes</dt>
          <dd className="text-right font-medium tabular-nums">{d.variantes ?? <Vacio />}</dd>
        </dl>
        {d.codigosVariantes.length > 0 && (
          <p className="mt-1.5 break-all font-mono text-[11px] tabular-nums text-tinta/45">
            {d.codigosVariantes.slice(0, 3).join(" · ")}
            {d.codigosVariantes.length > 3 && ` · +${d.codigosVariantes.length - 3}`}
          </p>
        )}
        <div className="mt-3 flex items-baseline justify-between border-t border-sand pt-3">
          <span className="text-[13px] text-taupe">Precio</span>
          <span className="font-display text-[22px] tabular-nums text-tinta">{d.precio !== null ? soles(d.precio) : <Vacio>S/ —</Vacio>}</span>
        </div>
      </div>
    </div>
  );
}

function Siguiente({ texto }: { texto: string | null }) {
  return (
    <div role="status" className={`rounded-xl px-3 py-2.5 text-[13px] ${texto ? "bg-hueso text-tinta" : "bg-verde/10 text-verde"}`}>
      <span className="label-cayla block text-[10.5px] text-taupe">{texto ? "Siguiente paso" : "Todo listo"}</span>
      {texto ?? "Revisa la ficha y crea el producto."}
    </div>
  );
}

export function FichaPrevia({
  datos,
  responsable,
  cargando,
  puedeGuardar,
  onCancelar,
}: {
  datos: DatosFicha;
  responsable: Control;
  cargando: boolean;
  puedeGuardar: boolean;
  onCancelar: () => void;
}) {
  const [verMovil, setVerMovil] = useState(false);
  const textoCrear = cargando ? (datos.fotos > 0 ? "Creando y subiendo fotos…" : "Creando…") : "Crear producto";
  const deshabilitado = !puedeGuardar || !responsable.listo;

  return (
    <>
      {/* Escritorio: fija a la derecha */}
      <aside aria-label="La prenda que vas a crear" className="hidden space-y-3 lg:sticky lg:top-6 lg:block">
        <Tarjeta d={datos} />
        <Siguiente texto={datos.siguiente} />
        <ComboResponsable control={responsable} deshabilitado={cargando} />
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} className="btn-cayla btn-secundario">
            Cancelar
          </button>
          <button type="submit" disabled={deshabilitado} title={responsable.motivo ?? undefined} className="btn-cayla btn-primario flex-1">
            {textoCrear}
          </button>
        </div>
      </aside>

      {/* Celular y tablet: barra pegada abajo */}
      {/* Pegada al fondo: desde 2026-09-25 el celular no tiene barra de navegación abajo (el menú es un cajón lateral).
          El aire inferior respeta la zona segura del teléfono. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-sand bg-papel px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2.5 lg:hidden">
        {verMovil && (
          <div className="mb-3 max-h-[60vh] space-y-3 overflow-y-auto [animation:cayla-revelar_240ms_var(--ease-cayla)]">
            <Tarjeta d={datos} />
            <ComboResponsable control={responsable} deshabilitado={cargando} />
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1 text-[12.5px]">
            <b className="block truncate text-sm text-tinta">{datos.nombre || "Nuevo producto"}</b>
            <span className="tabular-nums text-taupe">
              {datos.codigo ?? "—"} · {datos.variantes ?? 0} var. · {datos.precio !== null ? soles(datos.precio) : "S/ —"}
            </span>
          </div>
          <button type="button" onClick={() => setVerMovil((v) => !v)} aria-expanded={verMovil} className="btn-cayla btn-secundario px-3">
            {verMovil ? "Ocultar" : "Ver"}
          </button>
          <button type="submit" disabled={deshabilitado} title={responsable.motivo ?? undefined} className="btn-cayla btn-primario">
            {cargando ? "Creando…" : "Crear"}
          </button>
        </div>
        <p className="mt-1 text-xs text-taupe">{datos.siguiente ? `Siguiente: ${datos.siguiente}` : !responsable.listo && responsable.motivo ? `${responsable.motivo} Toca «Ver» para elegir el responsable.` : "Todo listo."}</p>
      </div>
    </>
  );
}
