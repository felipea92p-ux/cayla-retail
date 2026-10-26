"use client";

import { useEffect, useRef, useState } from "react";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { camposDeCorreccionCosto } from "@/lib/costo-correccion-guia";
import { leerCostosAtipicos, type CostoAtipico } from "@/lib/costo-atipico-reglas";
import {
  costoEscrito,
  esCorreccionYaHecha,
  fraseDeErrorDeCorreccion,
  fraseDeVistaPrevia,
  hoyTrasCorregir,
  leerVistaPrevia,
  MOTIVO_MAXIMO,
  problemaDeLaCorreccion,
  problemaDelCosto,
  type VistaPreviaCosto,
} from "@/lib/costo-correccion-reglas";
import { diaCorto, type CompraCosto } from "@/lib/costo-prenda-reglas";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/historial-prenda-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

/**
 * Corregir el costo de la ÚLTIMA compra de una prenda (Felipe 2026-10-24, ADR-0515). Un líder escribe el costo correcto de lo que
 * llegó y por qué estaba mal; la base (`corregir_costo_de_compra`, 20261026160000) recalcula lo que cuesta cada prenda, deja la foto
 * de antes y después y NO toca la factura, el stock ni lo ya vendido. La hoja dice qué pasaría antes de guardar («Hoy cada prenda te
 * cuesta S/ 19.57; con la corrección, S/ 19.49») leyéndolo de la base (`previsualizar_correccion_de_costo`), nunca calculándolo aquí.
 */
export function CorregirCostoModal({
  productoId,
  compra,
  numero,
  nombre,
  onCorregido,
  onClose,
}: {
  productoId: string;
  compra: CompraCosto;
  /** El número de la compra en la tabla y el gráfico (①②③). */
  numero: number;
  nombre: string;
  /** Se guardó (o ya estaba guardado): la pestaña vuelve a leerse. */
  onCorregido: () => void;
  onClose: () => void;
}) {
  const [costo, setCosto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que dijo la base cuando el costo está fuera de lo normal (ADR-0298): el líder lo corrige o lo confirma.
  const [atipicos, setAtipicos] = useState<CostoAtipico[] | null>(null);
  // El aviso se deja a la vista SOBRE el pie fijo (a 375 px, sus botones quedaban debajo): `scroll-mb-24` guarda el alto del pie.
  const zonaAviso = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (atipicos) zonaAviso.current?.scrollIntoView({ block: "nearest" });
  }, [atipicos]);
  const responsable = useResponsable();

  const borrador = { costo, motivo, costoActual: compra.costoLlegaron };
  const guia = useGuiaCampos(camposDeCorreccionCosto(borrador, responsable.listo));

  // La vista previa se pide a la base cuando el costo ya es válido y la persona hizo una pausa. La respuesta lleva la clave del costo
  // que la pidió: una vieja (se siguió escribiendo) no pisa a la nueva.
  const nuevo = costoEscrito(costo);
  const costoValido = nuevo !== null && problemaDelCosto(costo, compra.costoLlegaron) === null;
  const clave = nuevo === null ? "" : String(nuevo);
  const [respuesta, setRespuesta] = useState<{ clave: string; previa: VistaPreviaCosto | null } | null>(null);
  useEffect(() => {
    if (!costoValido || nuevo === null) return;
    let vivo = true;
    const espera = window.setTimeout(() => {
      // Los tipos de la base son generados y todavía no traen esta función: la llamada va con `as never`, como las demás de esta pantalla.
      void createClient()
        .rpc("previsualizar_correccion_de_costo" as never, { p_producto_id: productoId, p_compra_en: compra.fecha, p_costo: nuevo } as never)
        .then(({ data }) => {
          if (vivo) setRespuesta({ clave, previa: leerVistaPrevia(data) });
        });
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [costoValido, nuevo, clave, productoId, compra.fecha]);
  const previa = costoValido && respuesta?.clave === clave ? respuesta.previa : null;

  async function guardar(cerrar: () => void, confirma = false) {
    if (guardando) return;
    const problema = problemaDeLaCorreccion(borrador);
    if (problema) return setError(problema);
    if (!responsable.listo) return setError(responsable.motivo ?? "Elige quién corrige.");
    if (nuevo === null) return;

    setGuardando(true);
    setError(null);
    const { data, error: errGuardar } = await firmar(
      createClient().rpc("corregir_costo_de_compra" as never, { p_producto_id: productoId, p_compra_en: compra.fecha, p_costo: nuevo, p_motivo: motivo.trim(), p_confirma_costo: confirma } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(errGuardar);
    // «Sin cambios»: un doble clic, o alguien ya lo corrigió a ese costo. Es lo que se pedía: se toma como hecho.
    // Un costo fuera de lo normal (ADR-0298): la base no escribió nada y pide decidir.
    const raro = leerCostosAtipicos(errGuardar);
    if (raro) return setAtipicos(raro);
    if (errGuardar && !esCorreccionYaHecha(errGuardar)) return setError(fraseDeErrorDeCorreccion(errGuardar) ?? traducirError(errGuardar, "corregir el costo"));
    const hoy = hoyTrasCorregir(data);
    avisar.exito("Costo corregido", {
      detalle: hoy !== null ? `La compra ${numero} llegó a ${soles(nuevo)}. Hoy cada prenda te cuesta ${soles(hoy)}.` : `La compra ${numero} llegó a ${soles(nuevo)}.`,
    });
    onCorregido();
    cerrar();
  }

  return (
    <Modal titulo="Corregir el costo" subtitulo={`Compra ${numero} · ${diaCorto(compra.fecha)} · ${nombre}`} onClose={onClose} tamano="angosta">
      {(cerrar) => (
        <div data-guia="historial-prenda.corregir-costo" className="mt-4 space-y-4">
          <p className="nota-cayla">
            Llegaron <b>{compra.llegaron}</b> a <b>{soles(compra.costoLlegaron)}</b>. La factura y lo ya vendido no cambian.
          </p>

          <CampoGuiado id="costo" guia={guia}>
            <CampoMonto
              etiqueta={guia.etiqueta("costo", "Costo correcto de lo que llegó")}
              pie="por prenda, sin IGV"
              inputMode="decimal"
              placeholder="0.00"
              value={costo}
              onChange={(e) => {
                setCosto(e.target.value);
                setError(null);
                setAtipicos(null);
              }}
              disabled={guardando}
              autoComplete="off"
            />
          </CampoGuiado>

          {previa && fraseDeVistaPrevia(previa) && (
            <p role="status" className="anim-revelar text-[13px] tabular-nums text-tinta/80">
              {fraseDeVistaPrevia(previa)}
            </p>
          )}

          <CampoGuiado id="motivo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("motivo", "¿Qué estaba mal?")}
              pie="Queda anotado con tu nombre."
              maxLength={MOTIVO_MAXIMO}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
              disabled={guardando}
              autoComplete="off"
            />
          </CampoGuiado>

          {error && <Aviso tono="error">{error}</Aviso>}
          {atipicos && (
            <div ref={zonaAviso} className="scroll-mb-24">
              <AvisoCostoAtipico
                costos={atipicos}
                pie="Si es el costo de verdad, confírmalo: entra al promedio de las tres sedes y queda anotado como un costo fuera de lo normal."
                textoCorregir="Corregir el costo"
                textoConfirmar="Confirmar y guardar"
                textoCargando="Guardando…"
                cargando={guardando}
                listo={responsable.listo}
                motivoNoListo={responsable.motivo}
                onCorregir={() => {
                  setAtipicos(null);
                  guia.ir("costo");
                }}
                onConfirmar={() => void guardar(cerrar, true)}
              />
            </div>
          )}

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div data-guia="historial-prenda.corregir-costo-pie" className="pie-acciones pie-hoja-fijo">
            <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            {/* Con el aviso de costo raro a la vista, la decisión (corregir o confirmar) la lleva el aviso: el pie no repite «Guardar». */}
            {!atipicos && (
              <Boton peso="primario" onClick={() => void guardar(cerrar)} cargando={guardando} disabled={!responsable.listo} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                Guardar
              </Boton>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
