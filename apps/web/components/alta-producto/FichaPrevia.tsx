"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { AlertaParecidas } from "@/components/alta-producto/AlertaParecidas";
import { HojaParecidas } from "@/components/alta-producto/HojaParecidas";
import { TiraParecidas } from "@/components/alta-producto/TiraParecidas";
import { fechaCorta } from "@/lib/etiqueta-vigencia";
import type { AlertaVista } from "@/lib/parecidas-alta-vista";

// «Prendas parecidas» (Fase 1, 2026-09-30): si el formulario pasa `parecidas`, la alerta va bajo la ficha (escritorio), la tira
// «2 prendas parecidas · Ver» sobre la barra de abajo (celular y tablet) y la hoja «Ver y comparar» se monta aquí (es un portal: se ve igual con el
// resumen oculto). Quien no la pase ve la ficha de siempre.
//
// La prenda que se va a crear, tal como va a quedar (spike Nuevo producto, 2026-09-24; más corta desde el spike v2 del
// 2026-09-28). La tarjeta dice solo lo que identifica a la prenda —foto, código, nombre, «categoría · marca · tejido»,
// dos cifras (Variantes y Hoy en tienda) y «Precio · margen»—; tallas, etiquetas y códigos de variante ya se leen en su
// paso. Hasta el 2026-10-06 iba debajo la lista «Avance» (las 4 preguntas con ✓ o su número): la reemplazaron los puntos de avance
// de arriba del formulario (`PuntosAvance`, ADR-0260 act. 2026-10-06), que dicen lo mismo y se tocan igual para volver a un paso.
//
// El combo «Quién lo registra» ya NO vive aquí: está al final del paso 4, donde la persona termina (una sola vez en la
// pantalla). El botón «Crear» de la ficha se conserva y dice qué falta.
//
// En escritorio va fija a la derecha; en celular baja a una barra pegada abajo con «Crear» (PL-105), y «Ver» despliega
// la ficha encima. Todos los «Crear» son el mismo `submit` del formulario.

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
  /** La campaña con descuento que rige hoy sobre la prenda (la misma que saldrá en la etiqueta impresa), o null. */
  campana: { nombre: string; pct: number; hasta: string | null; precioFinal: number; otras: { nombre: string; pct: number }[] } | null;
  colores: { codigo: string; hex: string | null }[];
  /** Vista previa local de la foto que quedaría de principal. */
  foto: string | null;
  fotos: number;
  /** Lo siguiente que falta para crear (responsable incluido), o null si ya se puede. Decide si «Crear» está apagado. */
  siguiente: string | null;
  /** «El hilo» (ADR-0284): lo que sigue en el camino —puede ser una sugerencia, como los colores—, tocable para ir a su campo.
   *  `bloquea` false = crear ya se puede. null = no queda nada. */
  guia: { texto: string; nombre: string; bloquea: boolean; onIr: () => void } | null;
};

/** Todo lo que la ficha dibuja de «Prendas parecidas». Lo arma `useParecidasAlta`; aquí no se decide nada. */
export type ParecidasFicha = {
  alerta: AlertaVista | null;
  /** El aviso rojo bajo «Nombre» ya se anuncia solo: la alerta del resumen no repite el idéntico. */
  avisoEnLinea: boolean;
  /** Abre la hoja «Ver y comparar» (con `id`, parada en esa prenda). */
  onVer: (id?: string) => void;
  onVerMarca: () => void;
  onReintentar: () => void;
  /** Las props de la hoja, o `null` si está cerrada. */
  hoja: ComponentProps<typeof HojaParecidas> | null;
};

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** «Siguiente: Elige el tejido.» —un toque que lleva al campo— o «Todo listo para crear.». Lo usan la ficha y la barra del celular. */
function Siguiente({ d, clase }: { d: DatosFicha; clase: string }) {
  const g = d.guia;
  if (!g) {
    return d.siguiente ? (
      <p role="status" className={`${clase} text-taupe`}>{`Siguiente: ${d.siguiente}`}</p>
    ) : (
      <p role="status" className={`${clase} text-verde`}>
        Todo listo para crear.
      </p>
    );
  }
  return (
    <p role="status" className={`${clase} text-taupe`}>
      <button type="button" onClick={g.onIr} className="text-left underline decoration-tinta/20 underline-offset-4 transition-colors hover:text-tinta hover:decoration-tinta/50">
        {g.bloquea ? `Siguiente: ${g.texto}` : `Ya puedes crear. Sin elegir todavía: ${g.nombre.toLocaleLowerCase("es")}.`}
      </button>
    </p>
  );
}
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
        <div className="mt-3 border-t border-sand pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-taupe">Precio{d.margen !== null && ` · margen ${Math.round(d.margen)} %`}</span>
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              {d.campana && d.precio !== null && <span className="text-sm tabular-nums text-taupe line-through">{soles(d.precio)}</span>}
              <span className="font-display text-[22px] tabular-nums text-tinta">
                {d.campana ? soles(d.campana.precioFinal) : d.precio !== null ? soles(d.precio) : <Vacio>S/ —</Vacio>}
              </span>
            </span>
          </div>
          {d.campana && (
            <p className="relative mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-taupe">
              <span className="rounded-full bg-hueso px-2 py-px text-tinta">−{d.campana.pct} %</span>
              <span>
                {d.campana.nombre}
                {d.campana.hasta && ` · hasta ${fechaCorta(d.campana.hasta)}`}
              </span>
              {d.campana.otras.length > 0 && (
                <span className="group" tabIndex={0} aria-label={`Otras campañas vigentes: ${d.campana.otras.map((o) => `${o.nombre} ${o.pct} %`).join(", ")}`}>
                  <span className="cursor-default rounded-full border border-sand px-1.5 py-px">+{d.campana.otras.length}</span>
                  <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden w-max max-w-full rounded-lg border border-sand bg-papel px-2.5 py-2 text-[12px] leading-snug text-tinta group-hover:block group-focus:block">
                    {d.campana.otras.map((o) => (
                      <span key={o.nombre} className="flex justify-between gap-4">
                        <span>{o.nombre}</span>
                        <span className="tabular-nums text-taupe">−{o.pct} %</span>
                      </span>
                    ))}
                    <span className="mt-1 block text-taupe">La caja cobra solo la mayor.</span>
                  </span>
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function FichaPrevia({
  datos,
  cargando,
  onCancelar,
  parecidas,
}: {
  datos: DatosFicha;
  cargando: boolean;
  onCancelar: () => void;
  parecidas?: ParecidasFicha;
}) {
  const [verMovil, setVerMovil] = useState(false);
  const textoCrear = cargando ? (datos.fotos > 0 ? "Creando y subiendo fotos…" : "Creando…") : "Crear producto";
  const deshabilitado = cargando || datos.siguiente !== null;

  // El alto de la barra de abajo, publicado en `--alto-barra-ficha` (2026-10-09): cambia con la tira de parecidas y la zona segura del
  // teléfono, y lo que se pega sobre ella (el nombre del color tocado en la carta) lo necesita para no quedar detrás.
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barra.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const raiz = document.documentElement;
    const publicar = () => raiz.style.setProperty("--alto-barra-ficha", `${el.offsetHeight}px`);
    publicar();
    const obs = new ResizeObserver(publicar);
    obs.observe(el);
    return () => {
      obs.disconnect();
      raiz.style.removeProperty("--alto-barra-ficha");
    };
  }, []);

  return (
    <>
      {/* Escritorio: fija a la derecha */}
      {/* Con la alerta el resumen es más alto que una pantalla de 900 px. Lo informativo (ficha y alerta) corre por su cuenta con tope de
          alto y «Cancelar / Crear producto / Siguiente» quedan FIJOS abajo del mismo aside: el botón nunca se esconde justo cuando hay algo que
          revisar. `-mx-1.5 px-1.5` deja sitio al aro del pulso de la alerta, que por fuera lo cortaría el scroll (ver `app/estilos/alta-parecidas.css`).
          Sin `parecidas` el resumen es el de siempre: una sola columna sin tope. */}
      <aside
        aria-label="La prenda que vas a crear"
        className={`hidden lg:sticky lg:top-6 ${parecidas ? "lg:flex lg:max-h-[calc(100dvh-3rem)] lg:flex-col lg:gap-3" : "space-y-3 lg:block"}`}
      >
        <div className={`space-y-3 ${parecidas ? "min-h-0 flex-1 overflow-y-auto lg:-mx-1.5 lg:px-1.5" : ""}`}>
          <Tarjeta d={datos} />
          {parecidas && (
            <AlertaParecidas
              alerta={parecidas.alerta}
              avisoEnLinea={parecidas.avisoEnLinea}
              onVer={parecidas.onVer}
              onVerMarca={parecidas.onVerMarca}
              onReintentar={parecidas.onReintentar}
            />
          )}
        </div>
        <div className={`space-y-3 ${parecidas ? "shrink-0" : ""}`}>
          <div className="flex gap-2">
            <button type="button" onClick={onCancelar} className="btn-cayla btn-secundario">
              Cancelar
            </button>
            <button type="submit" disabled={deshabilitado} title={datos.siguiente ?? undefined} className="btn-cayla btn-primario flex-1">
              {textoCrear}
            </button>
          </div>
          <Siguiente d={datos} clase="text-center text-[12.5px]" />
        </div>
      </aside>

      {/* Celular y tablet: barra pegada abajo */}
      {/* Pegada al fondo: desde 2026-09-25 el celular no tiene barra de navegación abajo (el menú es un cajón lateral).
          El aire inferior respeta la zona segura del teléfono. */}
      <div ref={barra} data-barra-ficha className="sticky bottom-0 z-20 -mx-4 border-t border-sand bg-papel px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2.5 lg:hidden">
        {/* La tira va PRIMERO en la barra (sus márgenes negativos la llevan de borde a borde): se ve sin abrir «Ver» y un toque abre la hoja. */}
        {parecidas && <TiraParecidas alerta={parecidas.alerta} avisoEnLinea={parecidas.avisoEnLinea} onVer={parecidas.onVer} onReintentar={parecidas.onReintentar} />}
        {verMovil && (
          <div className="mb-3 max-h-[60vh] space-y-3 overflow-y-auto [animation:cayla-revelar_240ms_var(--ease-cayla)]">
            <Tarjeta d={datos} />
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
        <Siguiente d={datos} clase="mt-1 text-xs" />
      </div>
      {/* La hoja es un portal: va fuera del `aside` (oculto bajo 1024 px) y de la barra. */}
      {parecidas?.hoja && <HojaParecidas {...parecidas.hoja} />}
    </>
  );
}
