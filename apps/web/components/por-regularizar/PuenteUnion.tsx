"use client";

import type { CSSProperties } from "react";
import { Box, Tag } from "lucide-react";
import { anotadoPorCaja, balanzaDe, calceDe, diferenciasDe, disponibleDespues, FORMAS, fraseDeDiferencia, diferenciaDe, visitosDe, type FormaRegularizar, type PrendaParaRegularizar } from "@/lib/por-regularizar-mesa";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import type { ControlResponsable } from "@/lib/useResponsable";
import { botonPrimario } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { IconoVisto, MosaicoDePrenda, MosaicoDeVenta, soles } from "./piezas";
import { PorQue } from "./PorQue";

/** Un rótulo pegado a una marca de la regla no se sale de ella: cerca de un borde se alinea hacia adentro. */
const alinear = (pos: number): "ini" | "fin" | undefined => (pos < 24 ? "ini" : pos > 76 ? "fin" : undefined);

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
  forma,
  onForma,
  responsable,
  guia,
  guardando,
  hecho,
  onGuardar,
  alCrecer,
}: {
  venta: FilaPorRegularizar;
  prenda: PrendaParaRegularizar | null;
  /** Unidades libres de la prenda en la tienda de la venta; `null` = no se pudo leer. */
  disponible: number | null;
  forma: FormaRegularizar | null;
  onForma: (f: FormaRegularizar) => void;
  responsable: ControlResponsable;
  guia: GuiaCampos;
  guardando: boolean;
  /** Ya se guardó: las dos mitades se juntan y cae el sello. */
  hecho: boolean;
  onGuardar: () => void;
  /** El puente creció (se abrió una nota «¿Por qué?»): quien lo pinta lo trae a la vista. */
  alCrecer?: () => void;
}) {
  const calce = prenda ? calceDe(venta, prenda) : null;
  const diferencia = prenda ? diferenciaDe(venta, prenda) : 0;
  const balanza = prenda ? balanzaDe(venta.precioCobrado, prenda.precio) : null;
  const puedeGuardar = Boolean(prenda && forma && responsable.listo && !guardando && !hecho);
  const sinUnidades = prenda !== null && disponible === 0;

  return (
    <div className="vsr-pu" data-vsr-puente data-hecho={hecho ? "" : undefined}>
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
          <span className="vsr-sl-pr">{soles(venta.precioCobrado)} cobrado</span>
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

          {sinUnidades && (
            <p className="vsr-aviso-stock" role="note">
              Hoy no tiene unidades libres en esta tienda. Si nunca se contó en un lote, elige «Llegó nueva».
            </p>
          )}

          <CampoGuiado id="forma" guia={guia} titulo="¿Cómo estaba esta prenda en el sistema?" retiene="fila">
            <div className="vsr-formas" role="group" aria-label="Cómo estaba esta prenda en el sistema">
              {(["ya_registrada", "llego_nueva"] as const).map((f) => (
                <button key={f} type="button" className="vsr-forma" aria-pressed={forma === f} onClick={() => onForma(f)} disabled={guardando || hecho}>
                  {f === "ya_registrada" ? <Tag aria-hidden strokeWidth={1.6} /> : <Box aria-hidden strokeWidth={1.6} />}
                  <span>
                    <b>{FORMAS[f].titulo}</b>
                    <small>{FORMAS[f].detalle}</small>
                  </span>
                </button>
              ))}
            </div>
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

          <div className="vsr-pu-fin">
            <PieGuia guia={guia} />
            <button type="button" onClick={onGuardar} disabled={!puedeGuardar} title={guia.frase ?? responsable.motivo ?? undefined} className={`${botonPrimario} w-full ${guia.claseConfirmar}`}>
              {guardando ? "Guardando…" : hecho ? "Listo" : "Regularizar"}
            </button>
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
