"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as KeyboardEventReact, type ReactNode, type RefObject } from "react";
import { Archive, Check, Info, PencilLine } from "lucide-react";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { Boton, CampoTexto, Desplegable } from "@/components/ui/campos";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
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
import {
  avisoCargaDeLaPlanilla,
  claveCelda,
  motivoCerrado,
  motivoPlanilla,
  MOTIVOS_PLANILLA,
  ordenDeRecorrido,
  siguienteDelRecorrido,
} from "@/lib/existencias-ajuste-modelo";
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

/** En el celular la hoja se desliza entera y el pie queda pegado abajo (Felipe 2026-10-26: con avisos, la planilla quedaba de una fila).
 *  La planilla crece con sus colores hasta lo que se ve entre el borde de arriba de la hoja y el pie: bajando, la tabla llena la pantalla
 *  con sus tallas y su total a la vista. Mide la hoja y el pie (cambian con el teclado y con «Falta: …») y lo deja en `--tope-planilla`,
 *  que solo lee el CSS del celular (`ajuste-modelo.css`). */
export function useTopeDeLaPlanilla(raiz: RefObject<HTMLElement | null>, activo: boolean) {
  useEffect(() => {
    if (!activo || typeof ResizeObserver === "undefined") return;
    let el: HTMLElement | null = null;
    let observador: ResizeObserver | null = null;
    let cuadro = 0;
    // El portal de Radix monta la hoja un instante después del primer render: se espera a que exista, cuadro a cuadro.
    const enlazar = () => {
      el = raiz.current;
      const hoja = el?.closest<HTMLElement>("[data-variante]");
      if (!el || !hoja) {
        cuadro = requestAnimationFrame(enlazar);
        return;
      }
      const vista = el;
      const pie = hoja.querySelector<HTMLElement>(".pie-hoja-fijo");
      // 24 px: los 16 que separan el pie de la planilla y 8 de aire arriba, para que la cabecera de tallas no quede pegada al borde.
      const medir = () => vista.style.setProperty("--tope-planilla", `${Math.max(192, hoja.clientHeight - (pie?.offsetHeight ?? 0) - 24)}px`);
      observador = new ResizeObserver(medir);
      observador.observe(hoja);
      if (pie) observador.observe(pie);
    };
    enlazar();
    return () => {
      cancelAnimationFrame(cuadro);
      observador?.disconnect();
      el?.style.removeProperty("--tope-planilla");
    };
  }, [raiz, activo]);
}

/** Lo que dice cada lugar en una frase. */
const DONDE = { piso: "en piso", almacen: "en almacén", sede: "en la sede" } as const;
const NOMBRE_LUGAR = { piso: "piso", almacen: "almacén" } as const;

/** Lo que una cantidad tiene que decir además de su número: cambió mientras se contaba, nunca estuvo aquí o tiene apartadas. */
function notaDeCelda(v: VarianteAjuste, control: ControlAjuste): { texto: string; tono: "nueva" | "dato" | "ajeno" } | null {
  const ajeno = control.cambioAjeno(v);
  if (ajeno) return { texto: `había ${ajeno.antes}, ahora ${ajeno.ahora}`, tono: "ajeno" };
  if (v.sinHistoria) return { texto: "nueva aquí", tono: "nueva" };
  const apartado = apartadoEn(v, control.lugar);
  if (apartado > 0) return { texto: `${apartado} ${apartado === 1 ? "apartada" : "apartadas"}`, tono: "dato" };
  return null;
}

/* La planilla del modelo entero («Planilla rápida», ronda 2: Felipe 2026-10-26, docs/maquetas/existencias-ajustar-tabla-2026-10/ronda-2.html).
   Arriba, la banda con «Dónde» y «Qué pasó» (un combo), siempre en el mismo lugar; debajo, el aviso, y la planilla, lo único que se desliza. Con una
   talla, columnas Hoy · Contaste · Cambio y lo del otro lugar; con varias, colores × tallas. La cantidad de la que se viene lleva el cursor y
   un filo, y nada se apaga: todo el modelo se toca igual. Enter pasa a la siguiente cantidad (talla por talla, bajando por los colores), y
   un ✓ marca cada color ya mirado. «Dónde» no lleva conteos: eran del modelo entero y chocaban con los de la talla (/formidable 2026-10-26). */
export function PlanillaDelAjuste({
  control,
  foco,
  onApagarFoco,
  onVolver,
  onAbrirConteo,
  onGuardarYPasar,
  onAvisoLugar,
  sedeNombre,
  sellados,
}: {
  control: ControlAjuste;
  /** La celda de la que se viene (su variante), con su filo; `null` = ya se tocó otra. */
  foco: string | null;
  onApagarFoco: () => void;
  onVolver: () => void;
  /** Esa talla faltó en un conteo cerrado: se suma en la ventana completa de Ajustar, que la enlaza (ADR-0291). */
  onAbrirConteo: (varianteId: string) => void;
  /** «Guardar y pasar a almacén»: guarda lo contado aquí y sigue en el otro lugar. */
  onGuardarYPasar: (lugar: "piso" | "almacen") => void;
  /** El aviso de lugar se abrió o se cerró: mientras está abierto, el pie no compite con él. */
  onAvisoLugar?: (abierto: boolean) => void;
  sedeNombre: string;
  /** Lo recién guardado, por variante y en orden: cada talla se sella en verde, una tras otra, antes de «listo». */
  sellados?: readonly string[];
}) {
  const { modelo, guia } = control;
  // El último «por qué no» de un toque, o el lugar pedido con cambios sin guardar: en el aviso, entre la banda y la planilla, hasta el
  // siguiente toque que sí se pudo. `vez` vuelve a montar el aviso, así destella también la segunda vez que se pide lo mismo.
  const [razon, setRazon] = useState<string | null>(null);
  const [pideLugar, ponerPideLugar] = useState<"piso" | "almacen" | null>(null);
  // Mientras el aviso pregunta, la acción principal es la suya: el panel baja el «Guardar» del pie a secundario (/formidable 2026-10-26).
  const setPideLugar = (u: "piso" | "almacen" | null) => {
    ponerPideLugar(u);
    onAvisoLugar?.(u !== null);
  };
  const [vez, setVez] = useState(0);
  // Lo que la persona ya miró en esta visita (tocó, escribió o confirmó con Enter): el ✓ de cada color ya mirado entero. Sin contador: «Revisaste
  // 0 de 6» se leía como una tarea obligatoria (/formidable 2026-10-26).
  const [vistas, setVistas] = useState<ReadonlySet<string>>(() => new Set());
  const [deslizada, setDeslizada] = useState(false);
  const m = motivoPlanilla(control.motivo);
  const varianteFoco = modelo && foco ? [...modelo.celdas.values()].find((v) => v.varianteId === foco) : undefined;
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const orden = modelo ? ordenDeRecorrido(modelo) : [];
  const avisoCarga = avisoCargaDeLaPlanilla(control.avisoCarga);

  /** Lleva una cantidad a la vista DENTRO de la planilla, sin mover la hoja ni la página. */
  function verEnLaPlanilla(el: Element) {
    const vista = caja.current;
    if (!vista) return;
    const v = vista.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cab = vista.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const pie = vista.querySelector("tfoot")?.getBoundingClientRect().height ?? 0;
    const izq = vista.querySelector("tbody .ajuste-col-color")?.getBoundingClientRect().width ?? 0;
    if (r.top < v.top + cab) vista.scrollTop -= v.top + cab - r.top + 6;
    else if (r.bottom > v.bottom - pie) vista.scrollTop += r.bottom - (v.bottom - pie) + 6;
    if (r.left < v.left + izq) vista.scrollLeft -= v.left + izq - r.left + 6;
    else if (r.right > v.right) vista.scrollLeft += r.right - v.right + 6;
  }

  function enfocar(varianteId: string) {
    const input = raiz.current?.querySelector<HTMLInputElement>(`[data-variante="${varianteId}"] input`);
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
    verEnLaPlanilla(input);
  }

  // En la compu, el cursor queda en la cantidad de la que se viene, con su número elegido para escribir encima (en el celular no: abriría el
  // teclado sin pedirlo). Espera a que la planilla llegue (la ola de ADR-0136).
  const enfocada = Boolean(varianteFoco);
  useEffect(() => {
    if (!enfocada || !foco || !window.matchMedia?.("(pointer: fine)").matches) return;
    const t = window.setTimeout(() => enfocar(foco), 420);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al llegar a la planilla
  }, [enfocada, foco]);

  function soltarFocoSiEsOtra(destino: EventTarget) {
    if (!foco) return;
    const celda = (destino as HTMLElement).closest?.("[data-variante]");
    if (celda && celda.getAttribute("data-variante") !== foco) onApagarFoco();
  }

  function alTeclear(e: KeyboardEventReact<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    // Escape vuelve a la talla (con «¿Salir sin guardar?» si hay algo tocado). No cierra el modal (`useEscapeLibre`, ADR-0136 act. 2026-09-26).
    e.stopPropagation();
    onVolver();
  }

  function avisar(texto: string | null) {
    setRazon(texto);
    setPideLugar(null);
    if (texto) setVez((n) => n + 1);
  }

  function elegirLugar(u: "piso" | "almacen") {
    if (u === control.ubicado) return;
    const r = control.cambiarLugar(u);
    if (r && control.lineas.length > 0 && !control.incierto) {
      // Hay cambios sin guardar aquí: un lugar por vez. El aviso pregunta qué hacer con ellos, con las tres salidas a un toque.
      setRazon(null);
      setPideLugar(u);
      setVez((n) => n + 1);
      return;
    }
    avisar(r);
  }

  const marcarVista = (varianteId: string) => setVistas((s) => (s.has(varianteId) ? s : new Set(s).add(varianteId)));

  const nTallas = modelo?.tallas.length ?? 0;
  const varias = nTallas > 1;
  const titulo = varianteFoco ? nombreDeCelda(varianteFoco, modelo) : null;
  const otroLugar = control.lugar === "piso" ? "almacén" : "piso";
  const otro = (v: VarianteAjuste) => (control.lugar === "piso" ? v.stockAlmacen : v.stockPiso);
  const nCambios = control.lineas.length;

  const celda = (v: VarianteAjuste, f: number, c: number, conNota: boolean) => (
    <Celda
      v={v}
      control={control}
      enFoco={v.varianteId === varianteFoco?.varianteId}
      ola={{ f, c }}
      sello={sellados ? sellados.indexOf(v.varianteId) : -1}
      conNota={conNota}
      onRazon={avisar}
      onVista={() => marcarVista(v.varianteId)}
      onSiguiente={() => {
        const sig = siguienteDelRecorrido(orden, v.varianteId);
        if (sig) enfocar(sig);
      }}
      onAbrirConteo={onAbrirConteo}
    />
  );
  const columnaColor = (color: string | null, hex: string | null, extra?: ReactNode) => (
    <th scope="row" className="ajuste-col-color">
      <span aria-hidden data-color-dato className="ajuste-franja" style={{ background: hex ?? "var(--color-sand)" }} />
      <span className="ajuste-color">
        <b>{color ?? "Sin color"}</b>
        {extra}
      </span>
    </th>
  );

  return (
    <div ref={raiz} onKeyDown={alTeclear} className="ajuste-vista">
      <div className="ajuste-encabezado">
        <Volver onClick={onVolver} a="la talla" />
        <p className="min-w-0">
          {titulo ? (
            <>
              Empiezas por <b>{titulo}</b>
              <span className="ajuste-de-mas">; puedes cambiar {varias ? "cualquier talla" : "cualquier color"}</span>.
            </>
          ) : (
            <>
              Todo el modelo{modelo ? ` · ${modelo.colores.length} ${modelo.colores.length === 1 ? "color" : "colores"}${varias ? ` · ${nTallas} tallas` : ""}` : ""} · {sedeNombre}
            </>
          )}
        </p>
      </div>

      <div className="ajuste-banda">
        {control.separa && (
          <div className="ajuste-banda-fila">
            <span className="ajuste-banda-tit">Dónde</span>
            <div role="group" aria-label="Dónde contaste" className="ajuste-opciones">
              {(["almacen", "piso"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={control.ubicado === u}
                  data-pide={pideLugar === u ? "si" : undefined}
                  onClick={() => elegirLugar(u)}
                  className="pildora-cayla ajuste-opcion"
                >
                  {u === "almacen" ? <Archive aria-hidden className="h-4 w-4" /> : <IconoPercha aria-hidden className="h-4 w-4" />}
                  {u === "almacen" ? "En almacén" : "En piso"}
                </button>
              ))}
            </div>
          </div>
        )}
        <CampoGuiado id="motivo" guia={guia} retiene="fila" className="ajuste-banda-fila">
          <span id="ajuste-motivo-tit" className="ajuste-banda-tit">
            <ConMarca estado={guia.estado("motivo")} sinAhora>
              Qué pasó
            </ConMarca>
          </span>
          {/* Un combo y no seis píldoras: en dos filas se leían desordenadas (Felipe 2026-10-26). Elegir uno que no va (Encontré en
              el piso, o con un guardado que quedó en duda) sigue pasando por `cambiarMotivo`, que dice por qué en el aviso. */}
          <Desplegable
            idEtiqueta="ajuste-motivo-tit"
            valor={control.motivo}
            onValor={(v) => avisar(control.cambiarMotivo(v))}
            opciones={MOTIVOS_PLANILLA.map((x) => {
              const cerrado = motivoCerrado(x.clave, control.ubicado, control.separa);
              return { valor: x.clave, texto: cerrado ? `${x.texto} · solo en almacén` : x.texto, deshabilitada: Boolean(cerrado) };
            })}
            className="ajuste-motivo"
          />
        </CampoGuiado>
        {m.nota && (
          <CampoGuiado id="nota" guia={guia} className="ajuste-banda-pie">
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
        <div className="ajuste-banda-pie">
          <span>
            {m.ayuda}
            <span className="ajuste-de-mas"> ¿Se dañó? Se reporta, no se resta: «Reportar dañada» en la talla.</span>
          </span>
          {avisoCarga && (
            <span className="ajuste-banda-info">
              <Info aria-hidden className="h-3.5 w-3.5 shrink-0" />
              {avisoCarga}
            </span>
          )}
        </div>
      </div>

      {pideLugar ? (
        <Aviso
          key={`lugar-${vez}`}
          tono="atencion"
          className="ajuste-aviso"
          titulo={`Tienes ${nCambios} ${nCambios === 1 ? "cambio" : "cambios"} sin guardar ${DONDE[control.lugar]}`}
        >
          Guárdalo y sigue con {pideLugar === "piso" ? "el piso" : "el almacén"}, o descártalo.
          <span className="ajuste-aviso-acciones">
            <Boton
              peso="primario"
              cargando={control.enviando}
              disabled={Boolean(control.problema)}
              title={control.problema ? (guia.frase ?? undefined) : undefined}
              onClick={() => {
                setPideLugar(null);
                onGuardarYPasar(pideLugar);
              }}
            >
              Guardar y pasar a {NOMBRE_LUGAR[pideLugar]}
            </Boton>
            <Boton
              peso="fantasma"
              onClick={() => {
                control.descartarYPasar(pideLugar);
                setPideLugar(null);
              }}
            >
              Descartar y pasar
            </Boton>
            <Boton peso="fantasma" onClick={() => setPideLugar(null)}>
              Seguir {DONDE[control.lugar]}
            </Boton>
          </span>
        </Aviso>
      ) : razon ? (
        <Aviso key={`razon-${vez}`} tono="atencion" className="ajuste-aviso">
          {razon}
        </Aviso>
      ) : null}
      {control.error && (
        <Aviso tono={control.incierto || control.cambioAlContar ? "atencion" : "error"} enfocable>
          {control.error}
        </Aviso>
      )}

      <div
        data-campo="cambios"
        className="ajuste-planilla"
        // Tocar otra cantidad (o llegar a ella con Tab) le quita el filo a la de partida, y el toque sigue: su «+» suma igual.
        onPointerDownCapture={(e) => soltarFocoSiEsOtra(e.target)}
        onFocusCapture={(e) => soltarFocoSiEsOtra(e.target)}
      >
        {control.fallaLectura ? (
          <div className="bg-papel p-4">
            <Aviso tono="error" chico accion={<button type="button" onClick={control.reintentar} className="btn-enlace">Reintentar</button>}>
              No se pudo leer el stock de la prenda.
            </Aviso>
          </div>
        ) : !modelo ? (
          <p role="status" className="bg-papel p-5 text-[13px] text-taupe">
            Leyendo el stock de {sedeNombre}…
          </p>
        ) : (
          <>
            <div className="ajuste-planilla-barra">
              <span className="ajuste-planilla-lugar">
                {control.lugar === "almacen" ? <Archive aria-hidden className="h-3.5 w-3.5" /> : control.lugar === "piso" ? <IconoPercha aria-hidden className="h-3.5 w-3.5" /> : null}
                {DONDE[control.lugar].replace(/^en /, "En ")}
              </span>
              {!varias && <span className="ajuste-talla">{modelo.tallas[0] ?? "Única"}</span>}
              <span className="ajuste-pista">
                <kbd>Enter</kbd> pasa {varias ? "al color de abajo" : "al siguiente"}
              </span>
            </div>
            <div ref={caja} className="ajuste-desliza" data-desliza={deslizada ? "si" : undefined} onScroll={(e) => setDeslizada(e.currentTarget.scrollLeft > 2)}>
              {varias ? (
                <table /* unificar-fijo: matriz de colores × tallas (ADR-0494), como la de Editar producto: las matrices de tallas quedan aparte de <Tabla> */ className="ajuste-tabla" data-tallas="varias">
                  <thead>
                    <tr>
                      <th scope="col" className="ajuste-col-color">
                        <span className="label-cayla text-[11px] text-taupe">Color</span>
                      </th>
                      {modelo.tallas.map((t) => (
                        <th key={t ?? "unica"} scope="col">
                          <span className="ajuste-talla">{t ?? "Única"}</span>
                        </th>
                      ))}
                      <th scope="col">
                        <span className="label-cayla text-[11px] text-taupe">Total</span>
                      </th>
                      <th aria-hidden className="ajuste-relleno" />
                    </tr>
                  </thead>
                  <tbody>
                    {modelo.colores.map((c, f) => {
                      const enFila = modelo.tallas.map((t) => modelo.celdas.get(claveCelda(c.color, t)));
                      const total = enFila.reduce((s, v) => s + (v ? control.numero(v) : 0), 0);
                      const delColor = enFila.filter((v): v is VarianteAjuste => Boolean(v));
                      return (
                        <tr key={c.color ?? "sin-color"} style={indice(f)}>
                          {columnaColor(c.color, c.hex)}
                          {enFila.map((v, i) =>
                            v ? (
                              <td key={v.varianteId}>{celda(v, f, i, true)}</td>
                            ) : (
                              <td key={`${c.color}-${modelo.tallas[i]}`}>
                                <span className="ajuste-guion" title="Esta combinación no existe en el catálogo">
                                  —
                                </span>
                              </td>
                            )
                          )}
                          <td className="ajuste-total tabular-nums">{total}</td>
                          <td className="ajuste-relleno">
                            <Revisado on={delColor.length > 0 && delColor.every((v) => vistas.has(v.varianteId))} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" className="ajuste-col-color">
                        <span className="label-cayla text-[11px] text-taupe">Total</span>
                      </th>
                      {modelo.tallas.map((t) => (
                        <td key={t ?? "unica"} className="tabular-nums">
                          {modelo.colores.reduce((s, c) => {
                            const v = modelo.celdas.get(claveCelda(c.color, t));
                            return s + (v ? control.numero(v) : 0);
                          }, 0)}
                        </td>
                      ))}
                      <td className="tabular-nums">{[...modelo.celdas.values()].reduce((s, v) => s + control.numero(v), 0)}</td>
                      <td className="ajuste-relleno" />
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table /* unificar-fijo: la planilla de un modelo de una talla (ADR-0494): sus filas son pasos de cantidad, no registros de <Tabla> */ className="ajuste-tabla" data-tallas="una">
                  <thead>
                    <tr>
                      <th scope="col" className="ajuste-col-color">
                        <span className="label-cayla text-[11px] text-taupe">Color</span>
                      </th>
                      <th scope="col" className="ajuste-hoy">
                        <span className="label-cayla text-[11px] text-taupe">Hoy</span>
                      </th>
                      <th scope="col">
                        <span className="label-cayla text-[11px] text-taupe">Contaste</span>
                      </th>
                      <th scope="col">
                        <span className="label-cayla text-[11px] text-taupe">Cambio</span>
                      </th>
                      <th scope="col" className="ajuste-relleno">
                        {control.separa && <span className="label-cayla text-[11px] text-taupe">En {otroLugar}</span>}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelo.colores.map((c, f) => {
                      const v = modelo.celdas.get(claveCelda(c.color, modelo.tallas[0] ?? null));
                      if (!v) return null;
                      const hoy = control.hoy(v);
                      const d = control.numero(v) - hoy;
                      const nota = notaDeCelda(v, control);
                      return (
                        <tr key={v.varianteId} style={indice(f)} data-cambio={d !== 0 ? "si" : undefined}>
                          {columnaColor(c.color, c.hex, <span className="ajuste-hoy-movil">hoy {hoy}{nota ? ` · ${nota.texto}` : ""}</span>)}
                          <td className="ajuste-hoy">{hoy}</td>
                          <td>{celda(v, f, 0, false)}</td>
                          <td className="ajuste-cambio">
                            {d === 0 ? (
                              <span className="ajuste-nada">—</span>
                            ) : (
                              <span key={d} className="ajuste-delta tabular-nums" data-tono={d > 0 ? "entra" : "sale"}>
                                {d > 0 ? `+${d}` : `−${-d}`}
                              </span>
                            )}
                          </td>
                          <td className="ajuste-relleno ajuste-otro">
                            {control.separa && otro(v)}
                            {nota && <small data-tono={nota.tono}>{nota.texto}</small>}
                            <Revisado on={vistas.has(v.varianteId)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** El visto de un color ya mirado entero en esta visita. */
function Revisado({ on }: { on: boolean }) {
  return (
    <span aria-hidden className="ajuste-revisado" data-on={on ? "si" : undefined}>
      <Check className="h-3.5 w-3.5" />
    </span>
  );
}

/** Una cantidad: el paso de cantidad «planilla» y, con varias tallas, debajo lo que hay que saber (era cuánto, nueva aquí, apartadas). */
function Celda({
  v,
  control,
  enFoco,
  ola,
  sello,
  conNota,
  onRazon,
  onVista,
  onSiguiente,
  onAbrirConteo,
}: {
  v: VarianteAjuste;
  control: ControlAjuste;
  enFoco: boolean;
  /** Su fila y su columna: la ola llega en diagonal, y el anillo de la cantidad de partida se cierra cuando la ola terminó. */
  ola: { f: number; c: number };
  /** Su turno en el sellado tras guardar (`-1`: no se guardó). */
  sello: number;
  /** Con varias tallas, la línea de abajo; con una, eso va en las columnas de la fila. */
  conNota: boolean;
  onRazon: (r: string | null) => void;
  onVista: () => void;
  onSiguiente: () => void;
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
  const ajeno = control.cambioAjeno(v);

  function tocar(p: 1 | -1) {
    const r = control.paso(v, p);
    if (r.abrirConteo) onAbrirConteo(v.varianteId);
    else onRazon(r.razon);
    if (!r.razon) onVista();
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

  const nota = notaDeCelda(v, control);
  const bajo = !conNota ? null : nota?.tono === "ajeno" ? nota : cambio ? { texto: `era ${hoy}`, tono: "cambio" as const } : nota;

  return (
    <div
      className="ajuste-celda"
      data-variante={v.varianteId}
      data-foco={enFoco ? "si" : undefined}
      data-cambio={cambio ? "si" : undefined}
      data-ajeno={ajeno ? "si" : undefined}
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
              onVista();
              onSiguiente();
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              tocar(e.key === "ArrowUp" ? 1 : -1);
            }
          },
        }}
      />
      {conNota && (
        <span className="ajuste-bajo" data-tono={bajo?.tono}>
          {bajo?.texto ?? " "}
        </span>
      )}
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
    <div className="grid min-h-0 content-start gap-2.5 overflow-y-auto max-sm:hidden">
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
export function PieDelAjuste({
  control,
  onCancelar,
  onGuardar,
  secundario = false,
}: {
  control: ControlAjuste;
  onCancelar: () => void;
  onGuardar: () => void;
  /** El aviso de lugar está preguntando: su «Guardar y pasar» es la acción principal y este botón no compite con él. */
  secundario?: boolean;
}) {
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
            <span className="text-taupe max-sm:hidden">Nada cambia hasta que guardes.</span>
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
          <Boton peso={secundario ? "fantasma" : "primario"} cargando={control.enviando} disabled={n === 0 || Boolean(problema) || control.enviando} onClick={onGuardar} title={problema ? (guia.frase ?? undefined) : undefined}>
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
