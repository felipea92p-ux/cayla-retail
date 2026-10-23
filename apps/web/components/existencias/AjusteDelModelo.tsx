"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as KeyboardEventReact } from "react";
import { Check, PencilLine } from "lucide-react";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { Boton, CampoTexto, Segmentado } from "@/components/ui/campos";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Globito } from "@/components/ui/Globito";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Vacio } from "@/components/ui/Vacio";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { Punto } from "@/components/alta-producto/Punto";
import { TiraDeLoQueEntro, VistoQueSeDibuja } from "@/components/ficha-producto/ImprimirLoQueEntro";
import { hrefEtiquetasDeSubidas } from "@/lib/matriz-ficha-reglas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { apartadoEn, type VarianteAjuste } from "@/lib/ajuste-reglas";
import { anchoDeLaPlanilla, claveCelda, motivoCerrado, motivoPlanilla, MOTIVOS_PLANILLA, PLANILLA } from "@/lib/existencias-ajuste-modelo";
import { nombreDeCelda, type AjusteGuardado, type ControlAjuste, type LineaDelLote } from "./useAjusteDelModelo";

/* ====================================================================
   «Ajustar stock» dentro del modal de la prenda (ADR-0494, Felipe 2026-10-23, ronda 3 de
   `docs/maquetas/existencias-ajustar-stock-2026-10/`)

   Cuatro piezas que `PanelTalla` reparte en su modal:
     · `BandaAjustar` — bajo «Dónde está»: «¿No es lo que ves en la tienda?» con su botón. Reemplaza la fila «Ajustar stock» de «Qué
       hago» (la sexta de siete), que nadie encontraba; la tecla 6 sigue abriéndola.
     · `PlanillaDelAjuste` — la columna derecha al ajustar: qué pasó, dónde se contó y la planilla del modelo entero (colores × tallas),
       con la talla de la que se viene EN FOCO (el resto baja de tono hasta que se toca otra celda o «Ver todo el modelo»).
     · `TalonDelAjuste` — la columna izquierda, bajo la foto que se achica: lo que se va a guardar, talla por talla, y cuánto entra y sale.
     · `PieDelAjuste` — quién firma, el resumen o lo que falta, y Descartar / Guardar.
     · `ListoDelAjuste` — al guardar, si entraron prendas: «Etiquetas de lo que entró», la misma tira de Editar producto (una etiqueta por
       cada prenda nueva, no por todo el stock).
   El estado y las llamadas a la base viven en `useAjusteDelModelo`; las reglas, en `lib/existencias-ajuste-modelo.ts`.
   ==================================================================== */

/** La banda que abre la planilla (Felipe eligió «1 · Banda bajo los números» en la ronda 2). */
export function BandaAjustar({ que, conResto, onAjustar }: { que: string; conResto: boolean; onAjustar: () => void }) {
  return (
    <button type="button" data-guia="existencias.cajon-ajustar" aria-keyshortcuts="6" onClick={onAjustar} className="banda-ajustar">
      <span aria-hidden className="banda-ajustar-icono">
        <PencilLine className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <b className="block text-[14px] font-semibold text-tinta">¿No es lo que ves en la tienda?</b>
        <small className="block text-[13px] text-taupe">
          Corrige {que}
          {conResto ? " y, si quieres, el resto del modelo de una vez" : ""}.
        </small>
      </span>
      <span className="btn-cayla btn-primario mov-boton banda-ajustar-boton">
        Ajustar stock
        <kbd className="hidden rounded border border-crema/40 px-1.5 text-[10.5px] text-crema/80 sm:inline">6</kbd>
      </span>
    </button>
  );
}

/** Lo que dice cada lugar en una frase. */
const DONDE = { piso: "en piso", almacen: "en almacén", sede: "en la sede" } as const;

export function PlanillaDelAjuste({
  control,
  foco,
  onApagarFoco,
  onVolver,
  onAbrirConteo,
  sedeNombre,
  sellados,
}: {
  control: ControlAjuste;
  /** La celda de la que se viene (su variante), en foco; `null` = todo el modelo encendido. */
  foco: string | null;
  onApagarFoco: () => void;
  onVolver: () => void;
  /** Esa talla faltó en un conteo cerrado: se suma en la ventana completa de Ajustar, que la enlaza (ADR-0291). */
  onAbrirConteo: (varianteId: string) => void;
  sedeNombre: string;
  /** Lo recién guardado, por variante y en orden: cada talla se sella en verde, una tras otra, antes de «listo». */
  sellados?: readonly string[];
}) {
  const { modelo, guia } = control;
  // El último «por qué no» de un toque: bajo la planilla, hasta el siguiente toque que sí se pudo.
  const [razon, setRazon] = useState<string | null>(null);
  const m = motivoPlanilla(control.motivo);
  const varianteFoco = modelo && foco ? [...modelo.celdas.values()].find((v) => v.varianteId === foco) : undefined;
  const raiz = useRef<HTMLDivElement>(null);

  // En la compu, el cursor queda en la talla de la que se viene, con su número elegido para escribir encima (en el celular no: abriría el
  // teclado sin pedirlo). Espera a que la planilla llegue (la ola de ADR-0136).
  const enfocada = Boolean(varianteFoco);
  useEffect(() => {
    if (!enfocada || !foco || !window.matchMedia?.("(pointer: fine)").matches) return;
    const t = window.setTimeout(() => {
      const caja = raiz.current?.querySelector<HTMLInputElement>(`[data-variante="${foco}"] input`);
      caja?.focus({ preventScroll: true });
      caja?.select();
    }, 420);
    return () => window.clearTimeout(t);
  }, [enfocada, foco]);

  function soltarFocoSiEsOtra(destino: EventTarget) {
    if (!foco) return;
    const celda = (destino as HTMLElement).closest?.("[data-variante]");
    if (celda && celda.getAttribute("data-variante") !== foco) onApagarFoco();
  }

  function alTeclear(e: KeyboardEventReact<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    // El primer Escape enciende todo el modelo; el siguiente vuelve a la talla. Los dos los usa la planilla: no cierran el modal
    // (`useEscapeLibre`, ADR-0136 act. 2026-09-26).
    e.stopPropagation();
    if (foco) onApagarFoco();
    else onVolver();
  }

  const nTallas = modelo?.tallas.length ?? 0;
  const conTotal = nTallas > 1;
  const titulo = foco && varianteFoco ? nombreDeCelda(varianteFoco, modelo) : null;

  return (
    <div ref={raiz} onKeyDown={alTeclear} className="grid min-w-0 content-start gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Volver onClick={onVolver} a="la talla" />
          <div className="min-w-0">
            <TituloSeccion>Ajustar stock</TituloSeccion>
            <p className="mt-0.5 text-[12.5px] text-taupe">
              {titulo ? (
                <>
                  Empiezas por <b className="font-semibold text-tinta">{titulo}</b> ·{" "}
                  <button type="button" onClick={onApagarFoco} className="btn-enlace">
                    Ver todo el modelo
                  </button>
                </>
              ) : (
                <>
                  Todo el modelo · {modelo ? `${modelo.colores.length} ${modelo.colores.length === 1 ? "color" : "colores"}${nTallas > 1 ? ` · ${nTallas} tallas` : ""} · ` : ""}
                  {sedeNombre}
                </>
              )}
            </p>
          </div>
        </div>
        {control.separa && (
          <div>
            <Segmentado
              etiqueta="Dónde contaste"
              valor={control.ubicado}
              onValor={(u) => setRazon(control.cambiarLugar(u))}
              opciones={[
                { valor: "almacen", texto: "En almacén" },
                { valor: "piso", texto: "En piso" },
              ]}
            />
          </div>
        )}
      </div>

      <CampoGuiado id="motivo" guia={guia} retiene="fila" titulo="Qué pasó">
        <div role="group" aria-label="Qué pasó" className="flex flex-wrap gap-1.5">
          {MOTIVOS_PLANILLA.map((x) => {
            const cerrado = motivoCerrado(x.clave, control.ubicado, control.separa);
            return (
              <button
                key={x.clave}
                type="button"
                aria-pressed={control.motivo === x.clave}
                aria-disabled={cerrado ? true : undefined}
                title={cerrado ?? undefined}
                onClick={() => setRazon(control.cambiarMotivo(x.clave))}
                className={`pildora-cayla ${cerrado ? "opacity-45" : ""}`}
              >
                {x.texto}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-taupe">
          {m.ayuda} ¿Se dañó? No se resta: se reporta, con «Reportar dañada» en la talla.
        </p>
      </CampoGuiado>

      {m.nota && (
        <CampoGuiado id="nota" guia={guia}>
          <CampoTexto
            id="ajuste-nota"
            etiqueta={m.nota.etiqueta}
            maxLength={200}
            placeholder={m.nota.ejemplo}
            value={control.nota}
            onChange={(e) => control.cambiarNota(e.target.value)}
          />
        </CampoGuiado>
      )}

      {control.avisoCarga && <Aviso tono="info" chico>{control.avisoCarga}</Aviso>}

      <div
        data-campo="cambios"
        data-enfocada={varianteFoco ? "si" : undefined}
        className="ajuste-planilla"
        // Tocar otra talla (o llegar a ella con Tab) enciende todo el modelo, y el toque sigue: su «+» suma igual (ronda 3).
        onPointerDownCapture={(e) => soltarFocoSiEsOtra(e.target)}
        onFocusCapture={(e) => soltarFocoSiEsOtra(e.target)}
      >
        {control.fallaLectura ? (
          <div className="p-4">
            <Aviso tono="error" chico accion={<button type="button" onClick={control.reintentar} className="btn-enlace">Reintentar</button>}>
              No se pudo leer el stock de la prenda.
            </Aviso>
          </div>
        ) : !modelo ? (
          <p role="status" className="p-5 text-[13px] text-taupe">
            Leyendo el stock de {sedeNombre}…
          </p>
        ) : (
          <table /* unificar-fijo: matriz de colores × tallas (ADR-0494), como la de Editar producto: las matrices de tallas quedan aparte de <Tabla> */ className="ajuste-tabla" style={{ minWidth: anchoDeLaPlanilla(nTallas) }}>
            <colgroup>
              <col />
              {modelo.tallas.map((t) => (
                <col key={t ?? "unica"} style={{ width: PLANILLA.columnaTalla }} />
              ))}
              {conTotal && <col style={{ width: PLANILLA.columnaTotal }} />}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="ajuste-col-color" style={indice(0)}>
                  <span className="label-cayla text-[11px] text-taupe">{DONDE[control.lugar].replace(/^en /, "En ")}</span>
                </th>
                {modelo.tallas.map((t, i) => (
                  <th key={t ?? "unica"} scope="col" style={indice(i + 1)}>
                    <span className="ajuste-talla" data-foco={varianteFoco && varianteFoco.talla === t ? "si" : undefined}>
                      {t ?? "Única"}
                    </span>
                  </th>
                ))}
                {conTotal && (
                  <th scope="col" style={indice(nTallas + 1)}>
                    <span className="label-cayla text-[11px] text-taupe">Total</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {modelo.colores.map((c, f) => {
                const enFila = modelo.tallas.map((t) => modelo.celdas.get(claveCelda(c.color, t)));
                const total = enFila.reduce((s, v) => s + (v ? control.numero(v) : 0), 0);
                const otroLugar = control.lugar === "piso" ? "almacén" : "piso";
                const otro = enFila.reduce((s, v) => s + (v ? (control.lugar === "piso" ? v.stockAlmacen : v.stockPiso) : 0), 0);
                return (
                  <tr key={c.color ?? "sin-color"} style={indice(f)}>
                    <th scope="row" className="ajuste-col-color">
                      <span className="ajuste-color" data-foco={varianteFoco && varianteFoco.color === c.color ? "si" : undefined}>
                        <span aria-hidden data-color-dato className="ajuste-muestra" style={{ background: c.hex ?? "var(--color-hueso)" }} />
                        <span className="min-w-0">
                          <b className="block truncate font-display text-[18px] font-medium leading-tight text-tinta">{c.color ?? "Sin color"}</b>
                          {control.separa && <small className="block truncate text-[12px] text-taupe">{`${otro} en ${otroLugar}`}</small>}
                        </span>
                      </span>
                    </th>
                    {enFila.map((v, i) =>
                      v ? (
                        <td key={v.varianteId}>
                          <Celda
                            v={v}
                            control={control}
                            enFoco={v.varianteId === varianteFoco?.varianteId}
                            ola={{ f, c: i }}
                            sello={sellados ? sellados.indexOf(v.varianteId) : -1}
                            onRazon={setRazon}
                            onAbrirConteo={onAbrirConteo}
                          />
                        </td>
                      ) : (
                        <td key={`${c.color}-${modelo.tallas[i]}`}>
                          <span className="ajuste-guion" title="Esta combinación no existe en el catálogo">
                            —
                          </span>
                        </td>
                      )
                    )}
                    {conTotal && <td className="ajuste-total tabular-nums">{total}</td>}
                  </tr>
                );
              })}
            </tbody>
            {modelo.colores.length > 1 && (
              <tfoot>
                <tr>
                  <th scope="row" className="ajuste-col-color label-cayla text-[11px] text-taupe">
                    Total
                  </th>
                  {modelo.tallas.map((t) => (
                    <td key={t ?? "unica"} className="tabular-nums">
                      {modelo.colores.reduce((s, c) => {
                        const v = modelo.celdas.get(claveCelda(c.color, t));
                        return s + (v ? control.numero(v) : 0);
                      }, 0)}
                    </td>
                  ))}
                  {conTotal && <td className="tabular-nums">{[...modelo.celdas.values()].reduce((s, v) => s + control.numero(v), 0)}</td>}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {razon && (
        <Aviso tono="atencion" chico>
          {razon}
        </Aviso>
      )}
      {control.error && (
        <Aviso tono={control.incierto ? "atencion" : "error"} enfocable>
          {control.error}
        </Aviso>
      )}
    </div>
  );
}

/** Una celda: el paso de cantidad «planilla» y, debajo, lo que hay que saber (cómo cambió, nueva aquí, apartadas o el otro lugar). */
function Celda({
  v,
  control,
  enFoco,
  ola,
  sello,
  onRazon,
  onAbrirConteo,
}: {
  v: VarianteAjuste;
  control: ControlAjuste;
  enFoco: boolean;
  /** Su fila y su columna: la ola llega en diagonal, y el anillo del foco se cierra cuando la ola terminó. */
  ola: { f: number; c: number };
  /** Su turno en el sellado tras guardar (`-1`: no se guardó). */
  sello: number;
  onRazon: (r: string | null) => void;
  onAbrirConteo: (varianteId: string) => void;
}) {
  // Lo que se está escribiendo (puede quedar vacío un instante); al salir o con Enter se fija, y la celda vuelve a su número.
  const [borrador, setBorrador] = useState<string | null>(null);
  const nombre = nombreDeCelda(v, control.modelo);
  const n = control.numero(v);
  // El número rueda al cambiar (ADR-0136, excepción de esta planilla): sube al sumar, baja al restar. Una vez por cambio.
  const caja = useRef<HTMLInputElement>(null);
  const previo = useRef(n);
  useEffect(() => {
    const antes = previo.current;
    previo.current = n;
    const el = caja.current;
    if (!el || antes === n) return;
    el.classList.remove("ajuste-sube", "ajuste-baja");
    void el.offsetWidth;
    el.classList.add(n > antes ? "ajuste-sube" : "ajuste-baja");
  }, [n]);
  const hoy = control.hoy(v);
  const cambio = n !== hoy;
  const noSube = control.porQueNoSube(v);
  const noBaja = control.porQueNoBaja(v);
  const apartado = apartadoEn(v, control.lugar);

  function tocar(p: 1 | -1) {
    const r = control.paso(v, p);
    if (r.abrirConteo) onAbrirConteo(v.varianteId);
    else onRazon(r.razon);
  }
  function confirmar() {
    if (borrador === null) return;
    const t = borrador.trim();
    setBorrador(null);
    if (t === "" || Number(t) === n) return;
    const r = control.fijar(v, Number(t));
    if (r.abrirConteo) onAbrirConteo(v.varianteId);
    else onRazon(r.razon);
  }

  let bajo: { texto: string; tono: "cambio" | "nueva" | "dato" | "otro" } | null;
  if (cambio) bajo = { texto: `${hoy} → ${n}`, tono: "cambio" };
  else if (v.sinHistoria) bajo = { texto: "nueva aquí", tono: "nueva" };
  else if (apartado > 0) bajo = { texto: `${apartado} ${apartado === 1 ? "apartada" : "apartadas"}`, tono: "dato" };
  else if (control.separa) bajo = { texto: `${control.lugar === "piso" ? v.stockAlmacen : v.stockPiso} en ${control.lugar === "piso" ? "almacén" : "piso"}`, tono: "otro" };
  else bajo = null;

  return (
    <div
      className="ajuste-celda"
      data-variante={v.varianteId}
      data-foco={enFoco ? "si" : undefined}
      data-cambio={cambio ? "si" : undefined}
      data-sellada={sello >= 0 ? "si" : undefined}
      style={{ "--f": ola.f, "--c": ola.c, "--espera-foco": `${(ola.f + ola.c) * 38 + 640}ms` } as CSSProperties}
    >
      <PasoCantidad
        tamano="planilla"
        tono={cambio ? "atencion" : undefined}
        sinTab
        menos={{ onClick: () => tocar(-1), bloqueado: noBaja !== null, etiqueta: `Una menos de ${nombre}`, title: noBaja || undefined }}
        mas={{ onClick: () => tocar(1), bloqueado: noSube !== null, etiqueta: `Una más de ${nombre}`, title: noSube ?? undefined }}
        campo={{
          ref: caja,
          value: borrador ?? String(n),
          inputMode: "numeric",
          "aria-label": `${nombre}, ${DONDE[control.lugar]}`,
          onFocus: (e) => e.currentTarget.select(),
          onChange: (e) => setBorrador(e.target.value.replace(/\D/g, "").slice(0, 3)),
          onBlur: confirmar,
          onKeyDown: (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmar();
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              tocar(e.key === "ArrowUp" ? 1 : -1);
            }
          },
        }}
      />
      <span className="ajuste-bajo" data-tono={bajo?.tono}>
        {bajo?.texto ?? " "}
      </span>
      {sello >= 0 && (
        <span aria-hidden className="ajuste-visto" style={{ "--n": sello } as CSSProperties}>
          <Check /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15) */ aria-hidden className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

/** El talón: lo que se va a guardar, talla por talla, y cuánto entra y sale. */
export function TalonDelAjuste({ control, guardadas, sellado = false }: { control: ControlAjuste; guardadas?: readonly LineaDelLote[]; sellado?: boolean }) {
  const lineas = guardadas ?? control.lineas;
  const resumen = guardadas ? resumenDeLineas(guardadas) : control.resumen;
  return (
    // En el celular el talón no cabe: el pie ya dice cuántos cambios, cuánto entra y cuánto sale.
    <div className="grid content-start gap-2.5 max-sm:hidden">
      <p className="flex items-center gap-2">
        <span className="label-cayla text-[11px] text-taupe">{guardadas ? "Lo que se guardó" : "Lo que vas a guardar"}</span>
        <Globito n={lineas.length} pide late etiqueta={`${lineas.length} ${lineas.length === 1 ? "talla tocada" : "tallas tocadas"}`} />
      </p>
      {lineas.length === 0 ? (
        <Vacio tamano="chico" alinear="izquierda" icono={<PencilLine aria-hidden className="h-5 w-5" />}>
          Toca − o +, o escribe lo que contaste. Nada se guarda hasta que confirmes.
        </Vacio>
      ) : (
        <>
          <ul className="ajuste-talon-tickets grid gap-1.5">
            {sellado && (
              <li aria-hidden className="ajuste-sello">
                Guardado
              </li>
            )}
            {lineas.map((l) => {
              const hex = control.modelo?.colores.find((c) => c.color === l.variante.color)?.hex ?? null;
              return (
                <li key={l.variante.varianteId} className="ajuste-ticket">
                  <span aria-hidden data-color-dato className="ajuste-ticket-muestra" style={{ background: hex ?? "var(--color-hueso)" }} />
                  <span className="min-w-0 truncate">
                    <b className="font-semibold text-tinta">{l.nombre}</b> <span className="tabular-nums text-taupe">{`${l.actual} → ${l.resultado}`}</span>
                  </span>
                  <span key={l.delta} className="ajuste-ticket-delta tabular-nums" data-tono={l.delta > 0 ? "entra" : "sale"}>
                    {l.delta > 0 ? `+${l.delta}` : `−${-l.delta}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <BarraApilada
            alto={8}
            viva
            sinEntrada
            decorativa
            segmentos={[
              { clave: "entran", nombre: "Entran", valor: resumen.entran, clase: "bg-verde" },
              { clave: "salen", nombre: "Salen", valor: resumen.salen, clase: "bg-ambar" },
            ]}
          />
          <p className="flex justify-between text-[12px] text-taupe">
            <span>
              <b className="font-display text-[18px] font-medium text-tinta">{resumen.entran}</b> entran
            </span>
            <span>
              <b className="font-display text-[18px] font-medium text-tinta">{resumen.salen}</b> salen
            </span>
          </p>
        </>
      )}
    </div>
  );
}

/** El pie: quién firma, el resumen o lo que falta, y Descartar (o Cancelar) / Guardar. */
export function PieDelAjuste({ control, onCancelar, onGuardar }: { control: ControlAjuste; onCancelar: () => void; onGuardar: () => void }) {
  const { resumen, problema, guia } = control;
  const n = resumen.tallas;
  return (
    <div className="pie-hoja-fijo mt-4">
      <div className="grid gap-3 border-t border-sand pt-3 sm:flex sm:flex-wrap sm:items-center">
        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={control.responsable} compacto deshabilitado={control.enviando} />
        </CampoGuiado>
        <div className="min-w-0 flex-1 text-[13px]">
          {n === 0 ? (
            <span className="text-taupe">Nada cambia hasta que guardes.</span>
          ) : problema ? (
            <PieGuia guia={guia} />
          ) : (
            <span role="status">
              <b className="font-semibold text-tinta">
                {n} {n === 1 ? "cambio" : "cambios"}
              </b>
              {resumen.entran > 0 && ` · entran ${resumen.entran}`}
              {resumen.salen > 0 && ` · salen ${resumen.salen}`}
            </span>
          )}
        </div>
        <PieAcciones>
          <Boton peso="fantasma" onClick={onCancelar} disabled={control.enviando || control.incierto}>
            {n > 0 ? "Descartar" : "Cancelar"}
          </Boton>
          <Boton peso="primario" cargando={control.enviando} disabled={n === 0 || Boolean(problema) || control.enviando} onClick={onGuardar} title={problema ? (guia.frase ?? undefined) : undefined}>
            {n > 0 ? `Guardar ${n} ${n === 1 ? "cambio" : "cambios"}` : "Guardar"}
          </Boton>
        </PieAcciones>
      </div>
    </div>
  );
}


function resumenDeLineas(lineas: readonly LineaDelLote[]) {
  return {
    tallas: lineas.length,
    entran: lineas.reduce((s, l) => s + Math.max(0, l.delta), 0),
    salen: lineas.reduce((s, l) => s + Math.max(0, -l.delta), 0),
  };
}

/** «Etiquetas de lo que entró» tras guardar (Felipe 2026-10-03, en la ficha; aquí, ADR-0494): una etiqueta por cada prenda que entró, con
 *  la tira de la impresora de Editar producto. «Imprimir» lleva a Etiquetas de precio con justo esas unidades. */
export function ListoDelAjuste({
  guardado,
  prenda,
  hexDe,
  precioDe,
  onMasTarde,
}: {
  guardado: AjusteGuardado;
  prenda: string;
  hexDe: (color: string | null) => string | null;
  precioDe: (color: string | null) => number | null;
  onMasTarde: () => void;
}) {
  const entraron = guardado.lineas.filter((l) => l.delta > 0);
  const { tallas, entran, salen } = resumenDeLineas(guardado.lineas);
  const donde = guardado.lugar === "piso" ? "al piso" : guardado.lugar === "almacen" ? "al almacén" : "a la sede";
  const subidas = entraron.map((l) => ({ varianteId: l.variante.varianteId, color: l.variante.color, talla: l.variante.talla, unidades: l.delta }));
  // `?ajuste=1`: la pantalla de etiquetas dice «Existencias · Lo que entró» y su «Volver» lleva aquí.
  const href = `${hrefEtiquetasDeSubidas(subidas)}&ajuste=1`;
  return (
    <div role="status" className="grid justify-items-center gap-3 py-2 text-center">
      <VistoQueSeDibuja />
      <TituloSeccion>
        Stock ajustado en {tallas} {tallas === 1 ? "talla" : "tallas"}
      </TituloSeccion>
      <p className="max-w-md text-[13.5px] text-taupe">
        {[`Entraron ${entran} ${donde}`, salen > 0 && (salen === 1 ? "salió 1" : `salieron ${salen}`)].filter(Boolean).join(" · ")}. Queda en Movimientos como «
        {motivoPlanilla(guardado.motivo).texto}».
      </p>
      <div className="w-full text-left">
        <TiraDeLoQueEntro
          prenda={prenda}
          papeles={entraron.map((l) => ({
            clave: l.variante.varianteId,
            color: l.variante.color ?? "Sin color",
            punto: <Punto hex={hexDe(l.variante.color)} />,
            talla: l.variante.talla ?? "Única",
            precio: precioDe(l.variante.color),
            unidades: l.delta,
            iconos: [],
          }))}
        />
      </div>
      <p className="text-[12.5px] text-taupe">Una etiqueta por cada prenda que entró: las que ya estaban en la tienda ya tienen la suya.</p>
      <PieAcciones className="w-full">
        <Boton peso="fantasma" onClick={onMasTarde}>
          Más tarde
        </Boton>
        <BotonImprimir peso="primario" href={href}>
          Imprimir {entran} {entran === 1 ? "etiqueta" : "etiquetas"}
        </BotonImprimir>
      </PieAcciones>
    </div>
  );
}

/** El índice de una pieza en la cascada (`--i` en la hoja de estilos). */
const indice = (i: number) => ({ "--i": i }) as CSSProperties;
