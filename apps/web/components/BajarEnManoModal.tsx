"use client";

import { useRef, useState, type RefObject } from "react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { avisarLectura } from "@/lib/sonido-conteo";
import { nombreDePrenda, type PrendaBajable } from "@/lib/bajada-reglas";
import {
  argumentosEnMano,
  avisoDeEnMano,
  BOTON_CORREGIR_Y_COLGAR,
  BOTON_EN_MANO_DE_NUEVO,
  interpretarErrorEnMano,
  leerRespuestaEnMano,
  MAX_NOTA_EN_MANO,
  pasosEnMano,
  respuestaResuelveLaMarcaEnMano,
  RPC_EN_MANO,
  type RespuestaEnMano,
} from "@/lib/bajada-en-mano";

const TOPE_ESPERA_MS = 20_000;

// sugerir-fijo: de dónde puede salir una prenda que el sistema no tenía no depende de nada elegido antes (talla, color o sede).
const DE_DONDE = ["Venía en un fardo", "Estaba guardada sin registrar"] as const;

// «La tengo en la mano» (ADR-0328, actividad 9): la asesora escaneó en Bajar al piso una prenda que el sistema tiene en 0 en el
// almacén. Esta ventana la corrige (+1 «Encontré prendas») y la cuelga en UN paso con `bajar_en_mano` (todo o nada, con marca de
// reintento). No es optimista: espera a la base (el loader global la acompaña) y recién entonces suena, avisa y cierra.
//
// El responsable es el MISMO de la pantalla (`control`): el nombre se pide una vez por operación (ADR-0328, decisión 7); si aún
// no lo eligió, lo elige aquí y queda elegido también allá.
export function BajarEnManoModal({
  prenda,
  ubicacionId,
  sede,
  responsable,
  yaCuentaEnPiso = 0,
  alCerrarEnfocar,
  onListo,
  onClose,
}: {
  prenda: PrendaBajable;
  ubicacionId: string;
  sede: string;
  responsable: ControlResponsable;
  /** Si el sistema ya contaba colgadas de esta prenda y ella dijo «es otra unidad»: se le recuerda que se suma una más. */
  yaCuentaEnPiso?: number;
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  onListo: (r: RespuestaEnMano) => void;
  onClose: () => void;
}) {
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La marca de este intento: el mismo toque enviado otra vez (doble toque, reintento tras un corte) no corrige dos veces.
  const token = useRef<string>(crypto.randomUUID());
  // Tras una respuesta incierta la ventana queda fija: solo se reenvía LO MISMO con la misma marca, o se cierra.
  const [congelado, setCongelado] = useState(false);
  const enviadoEn = useRef<string | null>(null);
  // Contra el doble toque en el mismo instante: `loading` apaga el botón recién en el render siguiente.
  const enVuelo = useRef(false);
  const nombre = nombreDePrenda(prenda);
  const pasos = pasosEnMano(sede);

  // La guía de foco (ADR-0284) sale de lo que ya bloquea el botón: quién lo hace. La nota es opcional (la automática va siempre).
  const guia = useGuiaCampos([
    { id: "nota", nombre: "De dónde salió", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: "Elige quién corrige y cuelga la prenda." },
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !responsable.listo) return;
    enVuelo.current = true;
    setLoading(true);
    setError(null);
    const eraReenvio = enviadoEn.current !== null;
    enviadoEn.current ??= new Date().toISOString();
    // Sin tope, una conexión colgada dejaría la ventana bloqueada: a los 20 s se trata como un corte (la base pudo guardar igual).
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    let data: unknown = null;
    let errorRpc: ErrorEscritura = null;
    try {
      const respuesta = await firmar(
        createClient()
          .rpc(RPC_EN_MANO as never, argumentosEnMano(ubicacionId, prenda.varianteId, nota, token.current) as never)
          .abortSignal(control.signal),
        responsable.firma(),
      );
      data = respuesta.data;
      errorRpc = respuesta.error;
    } catch (excepcion) {
      errorRpc = { message: excepcion instanceof Error ? excepcion.message : String(excepcion) };
    }
    window.clearTimeout(tope);
    setLoading(false);
    enVuelo.current = false;
    responsable.despues(errorRpc);

    if (errorRpc) {
      const fallo = interpretarErrorEnMano(errorRpc, sede);
      if (fallo.tipo === "red" || (eraReenvio && !respuestaResuelveLaMarcaEnMano(errorRpc))) {
        // No se sabe si se guardó: todo queda fijo y solo se reenvía igual, con la misma marca.
        setCongelado(true);
        setError(fallo.mensaje);
        avisarLectura("desconocida");
        return;
      }
      // La base miró la marca: esa transacción se deshizo entera. Si la marca era de otra cosa, se estrena una.
      enviadoEn.current = null;
      setCongelado(false);
      if (fallo.hint === "en_mano_token_reusado") token.current = crypto.randomUUID();
      setError(fallo.mensaje);
      avisarLectura("desconocida");
      return;
    }

    // Sin error la transacción se confirmó. Si la respuesta no calza con el contrato, se dice lo único seguro (quedó registrada)
    // sin inventar si corrigió o no; la pantalla se relee igual.
    const leida = leerRespuestaEnMano(data);
    const r: RespuestaEnMano = leida ?? {
      bajada_id: token.current,
      ya_registrada: false,
      corregida: false,
      ajuste_movimiento_id: null,
      movimiento_id: null,
      piso: prenda.piso + 1,
      almacen: 0,
      registrada_en: new Date().toISOString(),
    };
    const aviso = leida ? avisoDeEnMano(leida, prenda, sede) : { titulo: "Registrada", detalle: `${nombre} · al piso de ${sede}` };
    avisarLectura("nueva");
    if (r.ya_registrada) avisar.aviso(aviso.titulo, { detalle: aviso.detalle });
    else avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    onListo(r);
    onClose();
  }

  return (
    <Modal titulo="La tengo en la mano" subtitulo="Corregir el almacén y colgarla, en un paso" onClose={onClose} bloqueado={loading} alCerrarEnfocar={alCerrarEnfocar} ancho="max-w-md">
      {(cerrar) => (
        // `noValidate`: sin él la burbuja del navegador frena el envío y no salen los textos propios.
        <form onSubmit={onSubmit} className="mt-2 space-y-4" noValidate>
          <div className="flex items-center gap-3">
            <MiniaturaPrenda fotoUrl={prenda.fotoUrl} tamano="lg" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-tinta">{nombre}</p>
              {prenda.sku && <p className="font-mono text-xs text-tinta/65">{prenda.sku}</p>}
            </div>
          </div>

          <ol className="space-y-1.5 rounded-xl bg-hueso px-4 py-3 text-[13px] leading-snug text-tinta">
            {pasos.map((paso, i) => (
              <li key={paso} className="flex gap-2">
                <span aria-hidden className="tabular-nums text-taupe">
                  {i + 1}.
                </span>
                <span>{paso}</span>
              </li>
            ))}
          </ol>

          {yaCuentaEnPiso > 0 && (
            <p className="text-[13px] text-ambar-profundo">
              El sistema ya cuenta {yaCuentaEnPiso === 1 ? "1 colgada" : `${yaCuentaEnPiso} colgadas`}: esta se suma como una más. Hazlo solo si es otra unidad.
            </p>
          )}
          {prenda.danado > 0 && (
            <p className="text-[13px] text-ambar-profundo">
              Hay {prenda.danado === 1 ? "1 dañada" : `${prenda.danado} dañadas`} de esta prenda en cuarentena: si la que tienes es esa, no la cuelgues.
            </p>
          )}

          <CampoGuiado id="nota" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("nota", "¿De dónde salió? (opcional)")}
              value={nota}
              maxLength={MAX_NOTA_EN_MANO}
              disabled={congelado || loading}
              placeholder="Escribe de dónde salió, o elige abajo"
              onChange={(e) => setNota(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {DE_DONDE.map((texto) => (
                <button
                  key={texto}
                  type="button"
                  aria-pressed={nota.trim() === texto}
                  disabled={congelado || loading}
                  onClick={() => setNota((actual) => (actual.trim() === texto ? "" : texto))}
                  className="pildora-cayla"
                >
                  {texto}
                </button>
              ))}
            </div>
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={loading} />
          </CampoGuiado>

          {error && (
            <p role="alert" className="text-sm text-rojo-profundo">
              {error}
            </p>
          )}

          <PieGuia guia={guia} listo="Todo listo para corregir y colgar." />

          {/* `pie-hoja-fijo`: los botones no se van bajo el pliegue en un celular de pie frente al rack (globals.css). */}
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} disabled={loading} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={loading}
              disabled={!responsable.listo}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              {congelado ? BOTON_EN_MANO_DE_NUEVO : BOTON_CORREGIR_Y_COLGAR}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
