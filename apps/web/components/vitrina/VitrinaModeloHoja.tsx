"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, Campo, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { camposDeModelo } from "@/lib/vitrina-guia";
import {
  coloresSinFoto,
  descripcionParaGuardar,
  errorDeVitrina,
  esEmpaque,
  MAX_DESCRIPCION_WEB,
  modeloDeJson,
  razonNoSeMuestra,
  textoLoNuevo,
  type EnLoNuevo,
  type ModeloVitrina,
} from "@/lib/vitrina-reglas";

const COLORES_A_LA_VISTA = 8;
const OPCIONES_LO_NUEVO = [
  { clave: "automatico", etiqueta: "Automático" },
  { clave: "fijo", etiqueta: "Fijado" },
  { clave: "quitado", etiqueta: "Fuera" },
];

/**
 * La hoja de un modelo en la Vitrina web (maqueta v4, «Publicar un modelo»): mostrarlo u ocultarlo, cómo entra a «Lo nuevo» y lo que
 * ve el cliente (sus fotos por color y la descripción para la web). No hay precio web: en la web vale lo que vale en cada tienda
 * (se cambia en la ficha del producto). Guardar firma el «Responsable» (ADR-0162); si otra persona lo cambió mientras estaba abierta,
 * la base lo dice y no pisa nada.
 */
export function VitrinaModeloHoja({
  modelo,
  onClose,
  onGuardado,
}: {
  modelo: ModeloVitrina;
  onClose: () => void;
  onGuardado: (modelo: ModeloVitrina) => void;
}) {
  const responsable = useResponsable();
  const v = modelo.vitrina;
  const [publicado, setPublicado] = useState(Boolean(v?.publicado) && modelo.publicable);
  const [enLoNuevo, setEnLoNuevo] = useState<EnLoNuevo>(v?.enLoNuevo ?? "automatico");
  const [descripcion, setDescripcion] = useState(v?.descripcionWeb ?? modelo.descripcion ?? "");
  const [guardando, setGuardando] = useState(false);
  // Un doble clic no manda dos veces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);

  const guia = useGuiaCampos(camposDeModelo({ descripcion, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));
  const sinFotoPropia = coloresSinFoto(modelo);
  const razon = razonNoSeMuestra(modelo);
  const descripcionFinal = descripcionParaGuardar(descripcion, modelo.descripcion);
  // Lo que ya está guardado (o, si nunca estuvo, lo de fábrica: oculto, automático y con la descripción del catálogo).
  const sinCambios =
    publicado === Boolean(v?.publicado) && enLoNuevo === (v?.enLoNuevo ?? "automatico") && descripcionFinal === (v?.descripcionWeb ?? null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !guia.puedeConfirmar) return;
    if (sinCambios) {
      onClose();
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    const { data, error } = await firmar(
      createClient().rpc("vitrina_guardar_modelo", {
        p_producto_id: modelo.id,
        p_publicado: publicado,
        p_en_lo_nuevo: enLoNuevo,
        p_descripcion_web: descripcionFinal,
        p_version: v?.version ?? null,
      }),
      responsable.firma(),
    );
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error || !data) {
      const propio = errorDeVitrina(`${error?.message ?? ""} ${error?.hint ?? ""}`);
      if (propio) avisar.error(propio.titulo, propio.detalle ? { detalle: propio.detalle } : undefined);
      else avisar.error(traducirError(error ?? { message: "sin respuesta" }, "guardar el modelo en la vitrina"));
      return;
    }
    const nuevo = modeloDeJson(data);
    if (nuevo) onGuardado(nuevo);
    avisar.exito(publicado ? `${modelo.nombre} se ve en la web` : `${modelo.nombre} queda oculto`);
    onClose();
  }

  const colores = modelo.colores.slice(0, COLORES_A_LA_VISTA);
  const bajada = [
    modelo.categoria,
    `${modelo.colores.length} ${modelo.colores.length === 1 ? "color" : "colores"}`,
    `${modelo.tallas} ${modelo.tallas === 1 ? "talla" : "tallas"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal
      titulo={
        <span className="inline-flex flex-wrap items-center gap-2">
          {modelo.nombre}
          {v?.publicado && modelo.publicable ? (
            <Chip tono="verde" className="font-sans">
              Se ve en la web
            </Chip>
          ) : (
            <Chip tono="apagado" tachado={false} className="font-sans">
              Oculto
            </Chip>
          )}
        </span>
      }
      subtitulo={bajada}
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      bloqueado={guardando}
      conCerrar
    >
      <form onSubmit={guardar} className="space-y-5">
        <div className="space-y-2" data-guia="vitrina-modelo.mostrar">
          <Interruptor
            activo={publicado}
            onActivo={setPublicado}
            disabled={!modelo.publicable && !publicado}
            etiqueta="Mostrar en la web"
            pie="Se ve con todos sus colores y tallas, al precio de cada tienda. El cliente lo separa y lo recoge en su tienda."
          />
          {/* Por qué no se puede mostrar: el empaque (se vende en la caja, «Solo ropa en la web») es un dato, no un problema. */}
          {razon && (
            <Aviso tono={esEmpaque(modelo) ? "info" : "atencion"} chico>
              {razon.frase}
            </Aviso>
          )}
        </div>

        <div className="space-y-2 border-t border-sand pt-4" data-guia="vitrina-modelo.lo-nuevo">
          <p className="campo-etiqueta">Lo nuevo</p>
          <SegmentoDeslizante opciones={OPCIONES_LO_NUEVO} valor={enLoNuevo} onCambio={(c) => setEnLoNuevo(c as EnLoNuevo)} etiqueta="Cómo entra a Lo nuevo" />
          <p className="text-[12px] text-taupe">{textoLoNuevo(enLoNuevo)}</p>
        </div>

        <div className="space-y-3 border-t border-sand pt-4" data-guia="vitrina-modelo.cliente">
          <p className="campo-etiqueta flex flex-wrap items-center gap-2">
            Lo que ve el cliente
            {sinFotoPropia > 0 && <Chip tono="ambar" className="font-sans normal-case tracking-normal">{`${sinFotoPropia} sin foto propia`}</Chip>}
          </p>
          {colores.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {colores.map((c) => (
                <li key={c.codigo} className="flex min-w-0 items-center gap-2">
                  <MiniaturaPrenda
                    fotoUrl={c.foto ?? modelo.foto}
                    colorHex={c.hex}
                    tamano="lg"
                    prefijo={modelo.prefijo}
                    familia={modelo.familia}
                    categoria={modelo.categoria}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-tinta">{c.nombre}</span>
                    <span className={`block truncate text-[11px] ${c.foto ? "text-taupe" : "text-ambar-profundo"}`}>
                      {c.foto ? "Foto propia" : modelo.foto ? "Usa la foto principal" : "Sin foto"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-taupe">Este modelo no tiene colores en sus tallas activas.</p>
          )}
          {modelo.colores.length > COLORES_A_LA_VISTA && (
            <p className="text-[12px] text-taupe">Y {modelo.colores.length - COLORES_A_LA_VISTA} colores más.</p>
          )}
          <CampoGuiado id="descripcion" guia={guia} titulo="Descripción para la web" ayuda="Opcional · sin ella sale la del catálogo">
            <Campo
              etiqueta="Descripción para la web"
              etiquetaOculta
              pie={descripcion.length > MAX_DESCRIPCION_WEB - 60 ? `Quedan ${Math.max(0, MAX_DESCRIPCION_WEB - descripcion.length)} letras.` : undefined}
            >
              <div className="caja-cayla caja-campo caja-campo-texto-largo">
                <textarea
                  className="self-stretch resize-none"
                  rows={3}
                  maxLength={MAX_DESCRIPCION_WEB}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  aria-label="Descripción para la web"
                />
              </div>
            </Campo>
          </CampoGuiado>
        </div>

        <CampoGuiado id="responsable" guia={guia}>
          <div data-guia="vitrina-modelo.responsable">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </div>
        </CampoGuiado>

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} listo={sinCambios ? "No cambiaste nada." : "Todo listo."} />
          <div className="ml-auto pie-acciones" data-guia="vitrina-modelo.guardar">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Guardar
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
