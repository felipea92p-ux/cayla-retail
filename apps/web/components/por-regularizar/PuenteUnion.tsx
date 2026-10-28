"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Box, Tag } from "lucide-react";
import { anotadoPorCaja, balanzaDe, calceDe, diferenciasDe, disponibleDespues, FORMAS, fraseDeDiferencia, diferenciaDe, visitosDe, type FormaRegularizar, type PrendaParaRegularizar } from "@/lib/por-regularizar-mesa";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { avisoDeRespuesta, type FormaDeducida } from "@/lib/por-regularizar-deduccion";
import type { ControlResponsable } from "@/lib/useResponsable";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { IconoVisto, MosaicoDePrenda, MosaicoDeVenta, soles } from "./piezas";
import { PorQue } from "./PorQue";
import { LineaCorregida } from "./LineaCorregida";
import { estaEscribiendo } from "@/components/alta-producto/useGuiaAlta";
import { Boton } from "@/components/ui/campos";

/** Un rótulo pegado a una marca de la regla no se sale de ella: cerca de un borde se alinea hacia adentro. */
const alinear = (pos: number): "ini" | "fin" | undefined => (pos < 24 ? "ini" : pos > 76 ? "fin" : undefined);

/** ¿La línea no se ve? Fuera de la ventana, o debajo del pie fijo del puente (`.vsr-pu-fin`, pegado abajo en la hoja y en dos columnas):
 *  lo que queda bajo su borde de arriba está tapado. Con el pie en su lugar (debajo de la línea, en tres columnas), no tapa nada. */
function quedaTapado(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const pie = el.closest("[data-vsr-puente]")?.querySelector<HTMLElement>(".vsr-pu-fin");
  const bordePie = pie ? pie.getBoundingClientRect().top : Infinity;
  const abajo = Math.min(window.innerHeight, bordePie > r.top ? bordePie : Infinity);
  return r.top < 0 || r.bottom > abajo;
}

/**
 * El puente (ADR-0360, maqueta A2): la unión de la venta con la prenda, a la vista. Arriba lo que anotó caja; abajo la prenda elegida;
 * en medio la cuerda con tres visitos (prenda, talla, color: el que no coincide dice «≠»). Con la prenda elegida aparecen el precio
 * (la balanza: oficial contra cobrado), «¿Cómo estaba?», el responsable y el botón: todo en el mismo lugar, sin bajar a buscarlo.
 *
 * Es la guía de foco de esta pantalla (CLAUDE.md «Guía de foco»): el campo que sigue se enciende y, sobre el botón, «Falta: …».
 * La regla de negocio no cambió: lo que se guarda es lo mismo que guardaba el modal «Regularizar» (`regularizar_prenda`).
 */
export function PuenteUnion({
  venta,
  prenda,
  disponible,
  notaStock = null,
  deducida = null,
  forma,
  onForma,
  responsable,
  guia,
  guardando,
  hecho,
  onGuardar,
  onCorregir,
  alCrecer,
}: {
  venta: FilaPorRegularizar;
  prenda: PrendaParaRegularizar | null;
  /** Unidades libres de la prenda en la tienda de la venta; `null` = no se pudo leer. */
  disponible: number | null;
  /** La nota en ámbar de una prenda sin unidades libres (`notaSinUnidades`): si nunca entró a la tienda, la MISMA frase con que la base
   *  la va a rechazar (20261004204000); `null` = nada que decir. */
  notaStock?: string | null;
  /** Lo que dice el libro de esta prenda a la hora de la venta (ADR-0328 act. 5): la respuesta sugerida y su porqué, o `null` si no hay
   *  nada que decir. Solo SUGIERE: no elige ni cambia qué se puede confirmar. */
  deducida?: FormaDeducida | null;
  forma: FormaRegularizar | null;
  onForma: (f: FormaRegularizar) => void;
  responsable: ControlResponsable;
  guia: GuiaCampos;
  guardando: boolean;
  /** Ya se guardó: las dos mitades se juntan y cae el sello. */
  hecho: boolean;
  onGuardar: () => void;
  /** «Corregir» lo que anotó caja (ADR-0369): abre la hoja con lo anotado. */
  onCorregir: () => void;
  /** El puente creció (se abrió una nota «¿Por qué?»): quien lo pinta lo trae a la vista. */
  alCrecer?: () => void;
}) {
  const calce = prenda ? calceDe(venta, prenda) : null;
  const diferencia = prenda ? diferenciaDe(venta, prenda) : 0;
  const balanza = prenda ? balanzaDe(venta.precioCobrado, prenda.precio) : null;
  const puedeGuardar = Boolean(prenda && forma && responsable.listo && !guardando && !hecho);
  // Si la persona elige lo contrario de lo que dice el libro, un aviso en ámbar dice qué pasaría (sin detenerla: puede tener razón).
  const aviso = avisoDeRespuesta(deducida, forma, venta.sede);
  const porque = deducida?.porque ?? null;
  // El porqué de «Sugerida» (al elegir la prenda) y el aviso (al elegir la contraria) aparecen donde la persona puede no estar mirando: en
  // la hoja del celular o en la mesa de dos columnas quedaban bajo el pie fijo con «Regularizar», y se veía «Sugerida» sin su porqué. Se
  // traen a la vista una vez, con suavidad, SOLO si quedaron tapados (`nearest`, con `scroll-margin` para librar el pie): si ya se ven, no
  // se mueve nada (ni se corta el desplazamiento que trae el botón). Nunca mientras se teclea; sin animación con movimiento reducido.
  const refDeduce = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if ((!aviso && !porque) || estaEscribiendo()) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let segundo = 0;
    const primero = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => {
        const el = refDeduce.current;
        if (el && quedaTapado(el)) el.scrollIntoView({ block: "nearest", behavior: quieto ? "auto" : "smooth" });
      });
    });
    return () => {
      cancelAnimationFrame(primero);
      cancelAnimationFrame(segundo);
    };
  }, [aviso, porque]);

  return (
    <div className="vsr-pu" data-guia="regularizar.puente" data-vsr-puente data-hecho={hecho ? "" : undefined}>
      <p className="label-cayla vsr-pu-t text-[11px] text-tinta/65">Venta y prenda</p>

      <div className="vsr-sl vsr-sl-venta" data-vsr-slot="venta">
        <span className="vsr-sl-etq">Lo que anotó caja</span>
        <span className="vsr-sl-foto">
          <MosaicoDeVenta venta={venta} />
        </span>
        <div className="vsr-sl-tx">
          <b>{venta.descripcion}</b>
          {anotadoPorCaja(venta) && <small className="vsr-sl-anotado">{anotadoPorCaja(venta)}</small>}
          <small>{venta.vendidoPor}</small>
          <LineaCorregida fila={venta} />
          <span className="vsr-sl-pr">{soles(venta.precioCobrado)} cobrado</span>
          {/* Caja anota a ojo (ADR-0369): si la categoría, la talla o el color no eran, se corrigen aquí, antes de buscar la prenda. */}
          <button type="button" onClick={onCorregir} disabled={guardando || hecho} className="btn-cayla btn-enlace vsr-sl-corregir text-xs">
            Corregir lo anotado
          </button>
        </div>
      </div>

      <div className="vsr-cuerda" data-lista={prenda ? "" : undefined}>
        {calce ? (
          <div className="vsr-visitos" key={prenda?.id}>
            {visitosDe(calce).map((v, i) => (
              <span key={v.etiqueta} className="vsr-visito" data-no={v.coincide ? undefined : ""} style={{ "--i": i } as CSSProperties} title={v.coincide ? `${v.etiqueta}: coincide` : `${v.etiqueta}: no coincide con lo que anotó caja`}>
                <i>{v.coincide ? <IconoVisto /> : "≠"}</i>
                {v.etiqueta}
              </span>
            ))}
          </div>
        ) : (
          <span className="vsr-sin-visitos">Toca una prenda</span>
        )}
        {prenda && diferenciasDe(venta, prenda).length > 0 && (
          <ul className="vsr-difs" key={`d-${prenda.id}`}>
            {diferenciasDe(venta, prenda).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="vsr-sl vsr-sl-prenda" data-vsr-slot="prenda" data-llena={prenda ? "" : undefined} key={prenda?.id ?? "vacia"}>
        <span className="vsr-sl-etq">La prenda real</span>
        {prenda ? (
          <>
            <span className="vsr-sl-foto">
              <MosaicoDePrenda prenda={prenda} />
            </span>
            <div className="vsr-sl-tx">
              <b>{prenda.nombre}</b>
              <small>{[prenda.talla, prenda.color, prenda.codigo].filter(Boolean).join(" · ")}</small>
              <span className="vsr-sl-pr">{soles(prenda.precio)} oficial</span>
            </div>
          </>
        ) : (
          <span className="vsr-sl-vacio">Aquí aparece la prenda que elijas</span>
        )}
      </div>

      {prenda && balanza && (
        <div className="vsr-pu-extra" key={`extra-${prenda.id}`}>
          <div className="vsr-bal">
            <p className="vsr-bal-t">
              <b>{fraseDeDiferencia(diferencia)}</b>
            </p>
            <div className="vsr-regla" data-tipo={balanza.tipo} role="img" aria-label={`${fraseDeDiferencia(diferencia)}. Oficial ${soles(prenda.precio)}, cobrado ${soles(venta.precioCobrado)}`}>
              <span className="vsr-regla-eje" />
              <span className="vsr-regla-tramo" style={{ left: `${balanza.desde}%`, width: `${balanza.ancho}%` }} />
              <span className="vsr-regla-of" data-alin={alinear(balanza.oficial)} style={{ left: `${balanza.oficial}%` }}>
                Oficial {soles(prenda.precio)}
              </span>
              <span className="vsr-regla-punto" style={{ left: `${balanza.cobrado}%` }} />
              <span className="vsr-regla-co" data-alin={alinear(balanza.cobrado)} style={{ left: `${balanza.cobrado}%` }}>
                Cobrado {soles(venta.precioCobrado)}
              </span>
            </div>
          </div>

          {notaStock && (
            <p className="vsr-aviso-stock" role="note">
              {notaStock}
            </p>
          )}

          <CampoGuiado id="forma" guia={guia} titulo="¿Cómo estaba esta prenda en el sistema?" retiene="fila">
            <div className="vsr-formas" data-guia="regularizar.formas" role="group" aria-label="Cómo estaba esta prenda en el sistema">
              {(["ya_registrada", "llego_nueva"] as const).map((f) => (
                <button key={f} type="button" className="vsr-forma" aria-pressed={forma === f} onClick={() => onForma(f)} disabled={guardando || hecho}>
                  {f === "ya_registrada" ? <Tag aria-hidden /> : <Box aria-hidden />}
                  <span>
                    <b>
                      {FORMAS[f].titulo}
                      {/* Marcada, NO elegida: la respuesta la da la persona (contestar mal descuenta dos veces o deja una fantasma). */}
                      {deducida?.forma === f && <span className="vsr-forma-sug">Sugerida</span>}
                    </b>
                    <small>{FORMAS[f].detalle}</small>
                  </span>
                </button>
              ))}
            </div>
            {/* El porqué de la sugerencia (o de por qué no la hay), con su fecha; si se elige lo contrario, pasa a ámbar y dice qué pasaría. */}
            {deducida && (
              <div aria-live="polite">
                <p ref={refDeduce} key={aviso ? `aviso-${forma}` : "porque"} className="vsr-deduce" data-aviso={aviso ? "" : undefined} role="note">
                  {aviso ?? deducida.porque}
                </p>
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center">
              <PorQue etiqueta="¿Cuál elijo?" alAbrir={alCrecer}>
                <p>
                  <b>{FORMAS.ya_registrada.titulo}:</b> la prenda ya estaba en el sistema y solo se quedó sin etiqueta. {FORMAS.ya_registrada.efecto}
                </p>
                <p>
                  <b>{FORMAS.llego_nueva.titulo}:</b> nunca se contó en un lote. {FORMAS.llego_nueva.efecto}
                </p>
              </PorQue>
            </div>
          </CampoGuiado>

          {forma && (
            <p className="vsr-cons" key={forma}>
              {disponible !== null && (
                <span>
                  Unidades libres: <b>{disponible}</b> → <b>{disponibleDespues(disponible, forma)}</b>
                </span>
              )}
              <span>{FORMAS[forma].efecto}</span>
            </p>
          )}

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando || hecho} compacto />
          </CampoGuiado>

          <div className="vsr-pu-fin" data-guia="regularizar.guardar">
            <PieGuia guia={guia} />
            <Boton type="button" peso="primario" cargando={guardando} onClick={onGuardar} disabled={!puedeGuardar} title={guia.frase ?? responsable.motivo ?? undefined} className={`w-full flex-1 ${guia.claseConfirmar}`}>
              {hecho ? "Listo" : "Regularizar"}
            </Boton>
          </div>
        </div>
      )}
      {hecho && (
        <span className="vsr-sello" aria-hidden>
          Unidas
        </span>
      )}
    </div>
  );
}
