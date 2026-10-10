"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, type Opcion } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { EtiquetaLiquidacion } from "@/components/liquidacion/EtiquetaLiquidacion";
import { useImprimirLiquidacion } from "@/components/liquidacion/useImprimirLiquidacion";
import { AvisoAyudanteMac } from "@/components/impresion/useImpresionBrother";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { camposDeEtiquetar } from "@/lib/liquidacion-guia";
import { errorDeLiquidacion, piezaDeJson, precioDeTexto, soles, type PiezaLiquidacion } from "@/lib/liquidacion-reglas";

export type CategoriaLiquidacion = { id: string; nombre: string };

/**
 * «Etiquetar una pieza» (ADR-0371): la prenda suelta que se liquida entra con su categoría y su precio, sin ficha, foto, talla ni
 * color. Al guardar, la hoja muestra la etiqueta tal como sale y el botón que la imprime; «Etiquetar otra» deja la categoría
 * elegida (suelen venir varias del mismo tipo) y limpia el precio. Firma el «Responsable» (ADR-0162).
 */
export function EtiquetarPiezaModal({
  ubicacionId,
  categorias,
  minimo,
  esLider,
  impreso,
  onClose,
  onEtiquetada,
}: {
  ubicacionId: string;
  categorias: readonly CategoriaLiquidacion[];
  minimo: number;
  esLider: boolean;
  impreso: string;
  onClose: () => void;
  onEtiquetada: (pieza: PiezaLiquidacion) => void;
}) {
  const responsable = useResponsable();
  const [categoriaId, setCategoriaId] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [lista, setLista] = useState<PiezaLiquidacion | null>(null);
  // /chaos (DC-01, RS-03): tres clics seguidos creaban tres piezas. `enVuelo` traba el botón en el mismo instante (el estado de
  // React llega tarde dentro de un mismo clic) y `token` hace que un reintento devuelva la pieza ya creada en vez de otra.
  const enVuelo = useRef(false);
  const token = useRef<string>(crypto.randomUUID());

  const campos = camposDeEtiquetar({ categoriaId, precio, minimo, esLider, responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const guia = useGuiaCampos(campos);
  const opciones: Opcion<string>[] = categorias.map((c) => ({ valor: c.id, texto: c.nombre }));
  const impresion = useImprimirLiquidacion(
    lista?.codigo ? [{ codigo: lista.codigo, categoria: lista.categoria, precio: lista.precio }] : [],
    impreso,
  );

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const monto = precioDeTexto(precio);
    if (enVuelo.current || !guia.puedeConfirmar || monto === null) return;
    enVuelo.current = true;
    setGuardando(true);
    const { data, error } = await firmar(
      createClient().rpc("crear_pieza_liquidacion", { p_ubicacion_id: ubicacionId, p_categoria_id: categoriaId, p_precio: monto, p_token: token.current }),
      responsable.firma(),
    );
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error || !data) {
      const propio = errorDeLiquidacion(`${error?.message ?? ""} ${error?.hint ?? ""}`);
      if (propio) avisar.error(propio.titulo, propio.detalle ? { detalle: propio.detalle } : undefined);
      else avisar.error(traducirError(error ?? { message: "sin respuesta" }, "etiquetar la pieza"));
      return;
    }
    const pieza = piezaDeJson(data as unknown as Record<string, unknown>);
    // La pieza ya existe: la próxima es otra, con su propio token.
    token.current = crypto.randomUUID();
    setLista(pieza);
    onEtiquetada(pieza);
    avisar.exito("Pieza etiquetada", { detalle: `${pieza.categoria} a S/ ${soles(pieza.precio)}. Imprime su etiqueta y pégala en la prenda.` });
  }

  function otra() {
    setLista(null);
    setPrecio("");
  }

  return (
    <Modal
      titulo={lista ? "Lista para imprimir" : "Etiquetar una pieza"}
      subtitulo={
        lista
          ? "Pégala en la prenda. La caja la cobra escaneando el código, al precio que dice."
          : "Para una prenda suelta que se liquida: no entra al catálogo, solo lleva su etiqueta."
      }
      onClose={onClose}
      variante="hoja"
      ancho="max-w-md"
    >
      {lista?.codigo ? (
        <div className="space-y-4">
          <div className="liq-previa">
            <EtiquetaLiquidacion codigo={lista.codigo} categoria={lista.categoria} precio={lista.precio} impreso={impreso} />
          </div>
          {impresion.avisoMac && (
            <AvisoAyudanteMac {...impresion.avisoMac} instalar={impresion.instalar} mientras="Mientras tanto, «Imprimir» usa el diálogo de Chrome: la etiqueta sale, pero con papel de sobra." />
          )}
          <div className="pie-hoja-fijo flex flex-wrap items-center justify-end gap-3 pt-2">
            <Boton type="button" onClick={otra}>
              + Etiquetar otra
            </Boton>
            <Boton type="button" peso="primario" cargando={impresion.enviando} onClick={impresion.imprimir}>
              Imprimir etiqueta
            </Boton>
          </div>
          {impresion.hoja}
        </div>
      ) : (
        <form onSubmit={guardar} className="space-y-4">
          <CampoGuiado id="categoria" guia={guia} titulo="Qué prenda es">
            <CampoSelect etiqueta="Categoría" valor={categoriaId} onValor={setCategoriaId} opciones={opciones} marcador="Elige la categoría" caja />
          </CampoGuiado>
          <CampoGuiado id="precio" guia={guia} titulo="Precio" ayuda={esLider ? `El mínimo es S/ ${soles(minimo)}; tú puedes bajarlo` : `Desde S/ ${soles(minimo)}`}>
            <CampoMonto etiqueta="Precio de liquidación" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <PieGuia guia={guia} listo="Todo listo para etiquetar." />
            <div className="ml-auto flex gap-3">
              <Boton type="button" onClick={onClose}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={guardando}
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
              >
                Etiquetar
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
