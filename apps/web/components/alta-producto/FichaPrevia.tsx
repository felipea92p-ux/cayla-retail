"use client";

import { useState } from "react";

// La prenda que se va a crear, tal como va a quedar (spike Nuevo producto, 2026-09-24; más corta desde el spike v2 del
// 2026-09-28). La tarjeta dice solo lo que identifica a la prenda —foto, código, nombre, «categoría · marca · tejido»,
// dos cifras (Variantes y Hoy en tienda) y «Precio · margen»—; tallas, etiquetas y códigos de variante ya se leen en su
// paso. Debajo va la lista «Avance»: las 4 preguntas con ✓ o su número, y su resumen o lo que falta. Reemplaza a la caja
// «Siguiente paso» y a la barra de 5 segmentos que había arriba del formulario: eran tres marcadores de avance a la vez.
// Cada pregunta se toca para volver a ella.
//
// El combo «Quién lo registra» ya NO vive aquí: está al final del paso 4, donde la persona termina (una sola vez en la
// pantalla). El botón «Crear» de la ficha se conserva y dice qué falta.
//
// En escritorio va fija a la derecha; en celular baja a una barra pegada abajo con «Crear» (PL-105), y «Ver» despliega
// la ficha encima. Todos los «Crear» son el mismo `submit` del formulario.

export type PasoAvance = {
  numero: 1 | 2 | 3 | 4;
  titulo: string;
  estado: "abierto" | "hecho" | "pendiente";
  /** El resumen del paso contestado, o lo que le falta al abierto; «—» si todavía no se llega. */
  texto: string;
  /** Se puede abrir desde aquí (los anteriores están contestados). */
  abrible: boolean;
};

export type DatosFicha = {
  nombre: string;
  codigo: string | null;
  /** «Indumentaria › Camisas y Blusas». */
  categoria: string | null;
  marca: string | null;
  tejido: string | null;
  variantes: number | null;
  /** Unidades de la carga inicial (ADR-0212); 0 = «todavía no tengo»; null = aún no se decidió. */
  hoy: number | null;
  precio: number | null;
  margen: number | null;
  colores: { codigo: string; hex: string | null }[];
  /** Vista previa local de la foto que quedaría de principal. */
  foto: string | null;
  fotos: number;
  avance: PasoAvance[];
  /** Lo siguiente que falta para crear (responsable incluido), o null si ya se puede. */
  siguiente: string | null;
};

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const Vacio = ({ children = "—" }: { children?: string }) => <span className="text-tinta/25">{children}</span>;
/** A la vista, hasta 8 puntos de color; el resto se cuenta («+N»). Con 12 colores la fila no cabía en la foto. */
const MAX_PUNTOS = 8;

function Tarjeta({ d }: { d: DatosFicha }) {
  const puntos = d.colores.slice(0, MAX_PUNTOS);
  const masColores = d.colores.length - puntos.length;
  return (
    <div className="overflow-hidden rounded-xl border border-sand bg-papel">
      <div className="relative grid h-32 place-items-center bg-hueso px-6 text-center text-xs text-taupe">
        {d.foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img src={d.foto} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span>La foto aparece aquí cuando la agregues en la fila de su color</span>
        )}
        {puntos.length > 0 && (
          <div className="absolute bottom-2.5 left-3 flex items-center gap-1">
            {puntos.map((c) => (
              <span key={c.codigo} aria-hidden className="h-3.5 w-3.5 rounded-full border-[1.5px] border-papel" style={{ background: c.hex ?? "transparent" }} />
            ))}
            {masColores > 0 && <span className="ml-0.5 rounded-full bg-papel/90 px-1.5 text-[11px] tabular-nums text-tinta">+{masColores}</span>}
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
          {d.tejido && ` · ${d.tejido}`}
        </p>
        <dl className="mt-2.5 grid grid-cols-2 overflow-hidden rounded-lg border border-sand">
          <div className="px-2.5 py-2">
            <dt className="text-[11px] text-taupe">Variantes</dt>
            <dd className="text-[17px] font-medium tabular-nums text-tinta">{d.variantes ?? <Vacio />}</dd>
          </div>
          <div className="border-l border-sand px-2.5 py-2">
            <dt className="text-[11px] text-taupe">Hoy en tienda</dt>
            <dd className="text-[17px] font-medium tabular-nums text-tinta">{d.hoy ?? <Vacio />}</dd>
          </div>
        </dl>
        <div className="mt-3 flex items-baseline justify-between border-t border-sand pt-3">
          <span className="text-[13px] text-taupe">Precio{d.margen !== null && ` · margen ${Math.round(d.margen)} %`}</span>
          <span className="font-display text-[22px] tabular-nums text-tinta">{d.precio !== null ? soles(d.precio) : <Vacio>S/ —</Vacio>}</span>
        </div>
      </div>
    </div>
  );
}

/** Las 4 preguntas, cada una tocable para volver a ella. Una que todavía no se alcanza se ve atenuada y no responde. */
function Avance({ pasos, onAbrir }: { pasos: PasoAvance[]; onAbrir: (n: PasoAvance["numero"]) => void }) {
  return (
    <nav aria-label="Avance" className="rounded-xl border border-sand bg-papel p-1.5">
      {pasos.map((p) => (
        <button
          key={p.numero}
          type="button"
          onClick={() => onAbrir(p.numero)}
          disabled={!p.abrible}
          aria-current={p.estado === "abierto" ? "step" : undefined}
          className={`grid w-full grid-cols-[22px_minmax(0,1fr)] items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-default ${
            p.estado === "abierto" ? "bg-hueso" : "enabled:hover:bg-tinta/[0.04]"
          }`}
        >
          <span
            aria-hidden
            className={`grid h-[22px] w-[22px] place-items-center rounded-full border text-[10.5px] font-bold tabular-nums ${
              p.estado === "hecho"
                ? "border-verde bg-verde text-crema"
                : p.estado === "abierto"
                  ? "border-tinta bg-tinta text-crema"
                  : "border-tinta/25 text-tinta/60"
            }`}
          >
            {p.estado === "hecho" ? "✓" : p.numero}
          </span>
          <span className="min-w-0">
            <b className={`block text-[13px] ${p.estado === "pendiente" ? "font-medium text-tinta/45" : "font-semibold text-tinta"}`}>{p.titulo}</b>
            <span className="block truncate text-xs text-taupe">{p.texto}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}

export function FichaPrevia({
  datos,
  cargando,
  onCancelar,
  onAbrirPaso,
}: {
  datos: DatosFicha;
  cargando: boolean;
  onCancelar: () => void;
  onAbrirPaso: (n: PasoAvance["numero"]) => void;
}) {
  const [verMovil, setVerMovil] = useState(false);
  const textoCrear = cargando ? (datos.fotos > 0 ? "Creando y subiendo fotos…" : "Creando…") : "Crear producto";
  const deshabilitado = cargando || datos.siguiente !== null;

  return (
    <>
      {/* Escritorio: fija a la derecha */}
      <aside aria-label="La prenda que vas a crear" className="hidden space-y-3 lg:sticky lg:top-6 lg:block">
        <Tarjeta d={datos} />
        <Avance pasos={datos.avance} onAbrir={onAbrirPaso} />
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} className="btn-cayla btn-secundario">
            Cancelar
          </button>
          <button type="submit" disabled={deshabilitado} title={datos.siguiente ?? undefined} className="btn-cayla btn-primario flex-1">
            {textoCrear}
          </button>
        </div>
        <p role="status" className={`text-center text-[12.5px] ${datos.siguiente ? "text-taupe" : "text-verde"}`}>
          {datos.siguiente ? `Siguiente: ${datos.siguiente}` : "Todo listo para crear."}
        </p>
      </aside>

      {/* Celular y tablet: barra pegada abajo */}
      {/* Pegada al fondo: desde 2026-09-25 el celular no tiene barra de navegación abajo (el menú es un cajón lateral).
          El aire inferior respeta la zona segura del teléfono. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-sand bg-papel px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2.5 lg:hidden">
        {verMovil && (
          <div className="mb-3 max-h-[60vh] space-y-3 overflow-y-auto [animation:cayla-revelar_240ms_var(--ease-cayla)]">
            <Tarjeta d={datos} />
            <Avance
              pasos={datos.avance}
              onAbrir={(n) => {
                setVerMovil(false);
                onAbrirPaso(n);
              }}
            />
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1 text-[12.5px]">
            <b className="block truncate text-sm text-tinta">{datos.nombre || "Nuevo producto"}</b>
            <span className="tabular-nums text-taupe">
              {datos.codigo ?? "—"} · {datos.variantes ?? 0} var. · {datos.precio !== null ? soles(datos.precio) : "S/ —"}
              {datos.hoy !== null && datos.hoy > 0 && ` · ${datos.hoy} hoy`}
            </span>
          </div>
          <button type="button" onClick={() => setVerMovil((v) => !v)} aria-expanded={verMovil} className="btn-cayla btn-secundario px-3">
            {verMovil ? "Ocultar" : "Ver"}
          </button>
          <button type="submit" disabled={deshabilitado} title={datos.siguiente ?? undefined} className="btn-cayla btn-primario">
            {cargando ? "Creando…" : "Crear"}
          </button>
        </div>
        <p className="mt-1 text-xs text-taupe">{datos.siguiente ? `Siguiente: ${datos.siguiente}` : "Todo listo."}</p>
      </div>
    </>
  );
}
