"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, Campo, CampoMonto, Interruptor } from "@/components/ui/campos";
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
  frenteATienda,
  margenSinIgv,
  MARGEN_BAJO,
  MAX_DESCRIPCION_WEB,
  modeloDeJson,
  precioConCampana,
  precioWebDe,
  precioWebDeTexto,
  textoLoNuevo,
  type EnLoNuevo,
  type ModeloVitrina,
} from "@/lib/vitrina-reglas";
import { soles } from "@/lib/precio-sede-reglas";

const COLORES_A_LA_VISTA = 8;
const OPCIONES_LO_NUEVO = [
  { clave: "automatico", etiqueta: "Automático" },
  { clave: "fijo", etiqueta: "Fijado" },
  { clave: "quitado", etiqueta: "Fuera" },
];

/**
 * La hoja de un modelo en la Vitrina web (maqueta v4, «Publicar un modelo»): mostrarlo u ocultarlo, su precio web (con lo que queda
 * frente a la tienda, con la campaña y, para el líder, el margen), cómo entra a «Lo nuevo» y lo que ve el cliente (sus fotos por
 * color y la descripción para la web). Encenderlo por primera vez abre esta hoja con el precio de tienda escrito: el precio web nace
 * aquí. Guardar firma el «Responsable» (ADR-0162); si otra persona lo cambió mientras estaba abierta, la base lo dice y no pisa nada.
 */
export function VitrinaModeloHoja({
  modelo,
  veCostos,
  encender,
  onClose,
  onGuardado,
}: {
  modelo: ModeloVitrina;
  veCostos: boolean;
  /** Se abrió desde el interruptor apagado: la hoja llega con «Mostrar en la web» prendido. */
  encender: boolean;
  onClose: () => void;
  onGuardado: (modelo: ModeloVitrina) => void;
}) {
  const responsable = useResponsable();
  const v = modelo.vitrina;
  const inicial = precioWebDe(modelo);
  const [publicado, setPublicado] = useState((encender || Boolean(v?.publicado)) && modelo.publicable);
  const [precio, setPrecio] = useState(inicial && inicial > 0 ? inicial.toFixed(2) : "");
  const [enLoNuevo, setEnLoNuevo] = useState<EnLoNuevo>(v?.enLoNuevo ?? "automatico");
  const [descripcion, setDescripcion] = useState(v?.descripcionWeb ?? modelo.descripcion ?? "");
  const [guardando, setGuardando] = useState(false);
  // Un doble clic no manda dos veces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);

  const costo = veCostos ? modelo.costo : null;
  const campos = camposDeModelo({ precio, costo, descripcion, responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const guia = useGuiaCampos(campos);
  const precioN = precioWebDeTexto(precio);
  const conCampana = precioN !== null && modelo.campana ? precioConCampana(precioN, modelo.campana.pct) : null;
  const margen = precioN !== null ? margenSinIgv(precioN, costo) : null;
  const margenCampana = conCampana !== null ? margenSinIgv(conCampana, costo) : null;
  const margenFinal = margenCampana ?? margen;
  const bajoCostoConCampana = costo !== null && conCampana !== null && conCampana < costo;
  const frente = precioN !== null ? frenteATienda(precioN, modelo.precioTienda) : null;
  const sinFotoPropia = coloresSinFoto(modelo);
  const descripcionFinal = descripcionParaGuardar(descripcion, modelo.descripcion);
  const sinCambios =
    v !== null &&
    publicado === v.publicado &&
    precioN === v.precioWeb &&
    enLoNuevo === v.enLoNuevo &&
    descripcionFinal === (v.descripcionWeb ?? null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !guia.puedeConfirmar || precioN === null) return;
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
        p_precio_web: precioN,
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
    avisar.exito(publicado ? `${modelo.nombre} se ve en la web` : `${modelo.nombre} queda oculto`, { detalle: `Precio web ${soles(precioN)}.` });
    onClose();
  }

  const colores = modelo.colores.slice(0, COLORES_A_LA_VISTA);
  const bajada = [
    modelo.categoria,
    `${modelo.colores.length} ${modelo.colores.length === 1 ? "color" : "colores"}`,
    `${modelo.tallas} ${modelo.tallas === 1 ? "talla" : "tallas"}`,
    veCostos && modelo.costo !== null ? `cuesta ${soles(modelo.costo)}` : null,
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
            pie="Se ve con todos sus colores y tallas. El cliente lo separa y lo recoge en su tienda."
          />
          {!modelo.publicable && (
            <Aviso tono="atencion" chico>
              No se puede mostrar: está descontinuado, es de prueba o no tiene tallas activas.
            </Aviso>
          )}
        </div>

        <div className="space-y-3 border-t border-sand pt-4" data-guia="vitrina-modelo.precio">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="campo-etiqueta">Precio en tienda</p>
              <p className="font-display mt-2 text-2xl leading-none tabular-nums text-tinta">
                {modelo.precioTienda === null
                  ? "—"
                  : modelo.precioTiendaMin !== null && modelo.precioTiendaMin < modelo.precioTienda
                    ? `${soles(modelo.precioTiendaMin)} a ${modelo.precioTienda.toFixed(2)}`
                    : soles(modelo.precioTienda)}
              </p>
            </div>
            <CampoGuiado id="precio" guia={guia} titulo="Precio web">
              <CampoMonto etiqueta="Precio web" etiquetaOculta inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </CampoGuiado>
          </div>
          {precioN !== null && (
            <dl className="divide-y divide-sand rounded-xl border border-sand bg-papel text-[13px]">
              {frente && (
                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <dt className="text-taupe">Frente a la tienda</dt>
                  <dd className="tabular-nums text-tinta">{frente === "igual" ? "Igual" : frente}</dd>
                </div>
              )}
              {margen !== null && (
                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <dt className="text-taupe">Margen web, sin IGV</dt>
                  <dd className="tabular-nums text-tinta">{Math.round(margen * 100)} %</dd>
                </div>
              )}
              {modelo.campana && conCampana !== null && (
                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <dt className="text-taupe">
                    Con «{modelo.campana.nombre}» (−{modelo.campana.pct} %){modelo.campana.todas ? "" : ", en algunas tallas"}
                  </dt>
                  <dd className="whitespace-nowrap tabular-nums text-tinta">
                    {soles(conCampana)}
                    {margenCampana !== null ? ` · margen ${Math.round(margenCampana * 100)} %` : ""}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {/* Solo el líder ve el costo: estos avisos no bloquean (la base ya no deja un precio web bajo el costo; la campaña sí puede
              bajarlo, como en la tienda). Bajo el costo, el campo mismo ya dice qué falta. */}
          {bajoCostoConCampana ? (
            <Aviso tono="atencion" chico>
              Con la campaña queda por debajo del costo. Sube el precio web o saca el modelo de la campaña.
            </Aviso>
          ) : margenFinal !== null && margenFinal < MARGEN_BAJO && costo !== null && precioN !== null && precioN >= costo ? (
            <Aviso tono="atencion" chico>
              El margen queda bajo el {Math.round(MARGEN_BAJO * 100)} %.
            </Aviso>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-[12px] text-taupe">Vale para todas sus tallas y colores. El cliente ve solo este precio.</p>
            {modelo.precioTienda !== null && precioN !== modelo.precioTienda && (
              <button type="button" className="btn-enlace text-[13px]" onClick={() => setPrecio(modelo.precioTienda!.toFixed(2))}>
                Igualar al precio de tienda
              </button>
            )}
          </div>
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
