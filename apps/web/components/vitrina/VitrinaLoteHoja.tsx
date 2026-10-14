"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { camposDeLoteMostrar, camposDeLotePrecio } from "@/lib/vitrina-guia";
import {
  errorDeVitrina,
  margenSinIgv,
  nuevoPrecioLote,
  precioConCampana,
  precioWebDe,
  valorDeLote,
  type DireccionLote,
  type ModeloVitrina,
  type UnidadLote,
} from "@/lib/vitrina-reglas";
import { soles } from "@/lib/precio-sede-reglas";

export type ModoLote = "precio" | "mostrar" | "ocultar";


/** Lo que le pasa a cada modelo al mostrar u ocultar, en palabras, y si cambia. */
function queLePasa(m: ModeloVitrina, modo: "mostrar" | "ocultar"): { texto: string; cambia: boolean } {
  if (modo === "ocultar") {
    if (!m.vitrina?.publicado) return { texto: "Ya está oculto", cambia: false };
    return { texto: `Se oculta y guarda su precio web (${soles(m.vitrina.precioWeb)})`, cambia: true };
  }
  if (m.vitrina?.publicado) return { texto: m.publicable ? "Ya se ve" : "No se puede vender: no se ve", cambia: false };
  if (!m.publicable) return { texto: "No se puede mostrar: descontinuado, de prueba o sin tallas", cambia: false };
  if (m.vitrina) return { texto: `Vuelve con su precio web (${soles(m.vitrina.precioWeb)})`, cambia: true };
  return m.precioTienda !== null && m.precioTienda > 0
    ? { texto: `Entra con el precio de tienda (${soles(m.precioTienda)})`, cambia: true }
    : { texto: "No tiene precio de tienda: ábrelo y ponle su precio web", cambia: false };
}

/**
 * El lote de la Vitrina web (maqueta v4, «Cambiar precio web», «Mostrar», «Ocultar»): lo mismo para varios modelos a la vez. Cambiar
 * el precio sube o baja en soles o en %, con la lista de cómo queda cada uno antes de aplicarlo. Mostrar y ocultar dicen qué le pasa a
 * cada uno (el que nunca estuvo entra con su precio de tienda; el que estuvo, con el suyo). Todo o nada, firmado por el «Responsable».
 */
export function VitrinaLoteHoja({
  modo,
  modelos,
  veCostos,
  onClose,
  onHecho,
}: {
  modo: ModoLote;
  modelos: ModeloVitrina[];
  veCostos: boolean;
  onClose: () => void;
  onHecho: () => void;
}) {
  const responsable = useResponsable();
  const [direccion, setDireccion] = useState<DireccionLote>("bajar");
  const [unidad, setUnidad] = useState<UnidadLote>("soles");
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const enVuelo = useRef(false);

  const cuanto = valorDeLote(valor, direccion, unidad);
  const filasPrecio = modelos.map((m) => {
    const hoy = precioWebDe(m);
    const nuevo = hoy !== null && cuanto !== null ? nuevoPrecioLote(hoy, direccion, unidad, cuanto) : null;
    const final = nuevo !== null && m.campana ? precioConCampana(nuevo, m.campana.pct) : nuevo;
    return { m, hoy, nuevo, margen: veCostos && final !== null ? margenSinIgv(final, m.costo) : null };
  });
  const sinPrecio = cuanto === null ? 0 : filasPrecio.filter((f) => f.nuevo === null).length;
  const quePasa = modo === "precio" ? [] : modelos.map((m) => ({ m, ...queLePasa(m, modo) }));
  const cambian = modo === "precio" ? filasPrecio.filter((f) => f.nuevo !== null && f.nuevo !== f.hoy).length : quePasa.filter((q) => q.cambia).length;

  const campos =
    modo === "precio"
      ? camposDeLotePrecio({ valor, direccion, unidad, sinPrecio, responsableListo: responsable.listo, responsableMotivo: responsable.motivo })
      : camposDeLoteMostrar({ responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const guia = useGuiaCampos(campos);

  async function aplicar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !guia.puedeConfirmar || cambian === 0) return;
    enVuelo.current = true;
    setGuardando(true);
    const cliente = createClient();
    const consulta =
      modo === "precio"
        ? cliente.rpc("vitrina_cambiar_precios", {
            p_cambios: filasPrecio
              .filter((f) => f.nuevo !== null && f.nuevo !== f.hoy)
              .map((f) => ({ producto_id: f.m.id, precio_web: f.nuevo, version: f.m.vitrina?.version ?? null })),
          })
        : cliente.rpc("vitrina_mostrar", { p_producto_ids: quePasa.filter((q) => q.cambia).map((q) => q.m.id), p_publicado: modo === "mostrar" });
    const { error } = await firmar(consulta, responsable.firma());
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      const propio = errorDeVitrina(`${error.message ?? ""} ${error.hint ?? ""}`);
      if (propio) avisar.error(propio.titulo, propio.detalle ? { detalle: propio.detalle } : undefined);
      else avisar.error(traducirError(error, modo === "precio" ? "cambiar los precios web" : modo === "mostrar" ? "mostrar los modelos" : "ocultar los modelos"));
      return;
    }
    const n = `${cambian} ${cambian === 1 ? "modelo" : "modelos"}`;
    avisar.exito(modo === "precio" ? `Precio web cambiado en ${n}` : modo === "mostrar" ? `${n} ya se ven en la web` : `${n} ya no se ven en la web`);
    onHecho();
  }

  const uno = modelos.length === 1 ? modelos[0] : null;
  const titulo = modo === "precio" ? "Cambiar precio web" : modo === "mostrar" ? "Mostrar en la web" : "Ocultar de la web";
  const subtitulo =
    modo === "ocultar" && uno
      ? `«${uno.nombre}» deja de verse en la tienda online. Su precio web se guarda para cuando lo vuelvas a mostrar.`
      : `${modelos.length} ${modelos.length === 1 ? "modelo elegido" : "modelos elegidos"}`;
  const accion = modo === "precio" ? `Aplicar a ${cambian}` : modo === "mostrar" ? `Mostrar ${cambian}` : uno ? "Ocultar" : `Ocultar ${cambian}`;

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} onClose={onClose} variante="hoja" ancho="max-w-lg" bloqueado={guardando} conCerrar>
      <form onSubmit={aplicar} className="space-y-5">
        {modo === "precio" ? (
          <>
            <div className="space-y-3" data-guia="vitrina-lote.cuanto">
              <SegmentoDeslizante
                opciones={[
                  { clave: "bajar", etiqueta: "Bajar" },
                  { clave: "subir", etiqueta: "Subir" },
                ]}
                valor={direccion}
                onCambio={(c) => setDireccion(c as DireccionLote)}
                etiqueta="Subir o bajar"
              />
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <CampoGuiado id="cuanto" guia={guia} titulo="Cuánto">
                  <CampoTexto etiqueta="Cuánto" caja inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                </CampoGuiado>
                <SegmentoDeslizante
                  opciones={[
                    { clave: "soles", etiqueta: "Soles" },
                    { clave: "pct", etiqueta: "%" },
                  ]}
                  valor={unidad}
                  onCambio={(c) => setUnidad(c as UnidadLote)}
                  etiqueta="En soles o en %"
                  className="mb-[22px]"
                />
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-sand" data-guia="vitrina-lote.vista">
              <div className={`grid gap-x-3 bg-hueso px-3.5 py-2 text-[12px] text-taupe ${veCostos ? "grid-cols-[minmax(0,1fr)_5rem_5rem_3.5rem]" : "grid-cols-[minmax(0,1fr)_5rem_5rem]"}`}>
                <span>Modelo</span>
                <span className="text-right">Hoy</span>
                <span className="text-right">Nuevo</span>
                {veCostos && <span className="text-right">Margen</span>}
              </div>
              <ul className="max-h-64 divide-y divide-sand overflow-y-auto bg-papel text-[13px]">
                {filasPrecio.map((f) => (
                  <li key={f.m.id} className={`grid items-baseline gap-x-3 px-3.5 py-2 ${veCostos ? "grid-cols-[minmax(0,1fr)_5rem_5rem_3.5rem]" : "grid-cols-[minmax(0,1fr)_5rem_5rem]"}`}>
                    <span className="truncate text-tinta">{f.m.nombre}</span>
                    <span className="text-right tabular-nums text-taupe">{f.hoy === null ? "—" : soles(f.hoy)}</span>
                    <span className="text-right font-semibold tabular-nums text-tinta">
                      {cuanto === null ? "—" : f.nuevo === null ? <span className="font-normal text-ambar-profundo">Queda en 0</span> : soles(f.nuevo)}
                    </span>
                    {veCostos && <span className="text-right tabular-nums text-taupe">{f.margen === null ? "—" : `${Math.round(f.margen * 100)} %`}</span>}
                  </li>
                ))}
              </ul>
            </div>
            {modelos.some((m) => !m.vitrina) && (
              <p className="text-[12px] text-taupe">Los que nunca estuvieron en la web guardan su precio web y siguen ocultos hasta que los muestres.</p>
            )}
          </>
        ) : (
          <ul className="max-h-72 divide-y divide-sand overflow-y-auto rounded-xl border border-sand bg-papel text-[13px]">
            {quePasa.map((q) => (
              <li key={q.m.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                <span className={`min-w-0 truncate ${q.cambia ? "text-tinta" : "text-taupe"}`}>{q.m.nombre}</span>
                <span className={`shrink-0 text-right ${q.cambia ? "text-tinta" : "text-taupe"}`}>{q.texto}</span>
              </li>
            ))}
          </ul>
        )}

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </CampoGuiado>

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} listo={cambian === 0 ? (modo === "precio" ? "Escribe cuánto subir o bajar." : "Ninguno cambia.") : "Todo listo."} />
          <div className="ml-auto pie-acciones">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              disabled={!guia.puedeConfirmar || cambian === 0}
              title={guia.frase ?? (cambian === 0 ? "Ninguno de los elegidos cambia." : undefined)}
              className={guia.claseConfirmar}
            >
              {accion}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
