"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
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
import { camposDeCambiarPrecio, camposDeRetirar } from "@/lib/liquidacion-guia";
import { diasALaVenta, tiempoALaVenta, errorDeLiquidacion, fechaLima, piezaDeJson, precioDeTexto, soles, type PiezaLiquidacion } from "@/lib/liquidacion-reglas";

type Modo = "ver" | "precio" | "retirar";

/**
 * Una pieza de liquidación (ADR-0371), abierta desde la lista o escaneando su etiqueta. Muestra la etiqueta vigente tal como sale
 * y deja hacer las dos cosas que le pasan a una pieza que no se vende: **bajarle el precio** (sale una etiqueta NUEVA, con otro
 * código; la vieja deja de valer en la caja, así que hay que quitarla) y **retirarla** (se perdió, se dañó, se donó: nunca se
 * borra). Con `codigoViejo` llegó escaneando una etiqueta que ya no vale, y lo dice arriba.
 */
export function PiezaLiquidacionModal({
  pieza: inicial,
  codigoViejo,
  minimo,
  esLider,
  impreso,
  hoy,
  onClose,
  onCambio,
}: {
  pieza: PiezaLiquidacion;
  codigoViejo?: string | null;
  minimo: number;
  esLider: boolean;
  impreso: string;
  hoy: string;
  onClose: () => void;
  onCambio: (pieza: PiezaLiquidacion) => void;
}) {
  const responsable = useResponsable();
  const [pieza, setPieza] = useState(inicial);
  const [modo, setModo] = useState<Modo>("ver");
  const [precio, setPrecio] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  // /chaos (DC-01): dos clics en «Cambiar precio» rebajaban una vez pero mostraban «Precio cambiado» y «Esa etiqueta ya no vale» a la
  // vez. `enVuelo` traba el botón en el mismo instante; el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);
  // Recién rebajada: la etiqueta de arriba es la nueva y hay que pegarla en lugar de la vieja.
  const [rebajadaDe, setRebajadaDe] = useState<number | null>(null);

  const firma = { responsableListo: responsable.listo, responsableMotivo: responsable.motivo };
  const camposPrecio = camposDeCambiarPrecio({ precio, actual: pieza.precio, minimo, esLider, ...firma });
  const camposRetiro = camposDeRetirar({ motivo, ...firma });
  const guiaPrecio = useGuiaCampos(camposPrecio);
  const guiaRetiro = useGuiaCampos(camposRetiro);
  const impresion = useImprimirLiquidacion(
    pieza.estado === "disponible" && pieza.codigo ? [{ codigo: pieza.codigo, categoria: pieza.categoria, precio: pieza.precio }] : [],
    impreso,
  );

  async function llamar(fn: "cambiar_precio" | "retirar", que: string) {
    if (enVuelo.current) return null;
    enVuelo.current = true;
    setGuardando(true);
    const supabase = createClient();
    const codigo = pieza.codigo ?? "";
    const peticion =
      fn === "cambiar_precio"
        ? supabase.rpc("cambiar_precio_pieza_liquidacion", { p_codigo: codigo, p_precio: precioDeTexto(precio) ?? 0 })
        : supabase.rpc("retirar_pieza_liquidacion", { p_codigo: codigo, p_motivo: motivo.trim() });
    const { data, error } = await firmar(peticion, responsable.firma());
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error || !data) {
      const propio = errorDeLiquidacion(`${error?.message ?? ""} ${error?.hint ?? ""}`);
      if (propio) {
        avisar.error(propio.titulo, propio.detalle ? { detalle: propio.detalle } : undefined);
        if (propio.titulo === "Ese ya es su precio") setModo("ver");
      } else avisar.error(traducirError(error ?? { message: "sin respuesta" }, que));
      return null;
    }
    const nueva = piezaDeJson(data as unknown as Record<string, unknown>);
    setPieza(nueva);
    onCambio(nueva);
    return nueva;
  }

  async function cambiarPrecio(e: React.FormEvent) {
    e.preventDefault();
    const monto = precioDeTexto(precio);
    if (guardando || !guiaPrecio.puedeConfirmar || monto === null || !pieza.codigo) return;
    const antes = pieza.precio;
    const nueva = await llamar("cambiar_precio", "cambiar el precio");
    if (!nueva) return;
    setRebajadaDe(antes);
    setPrecio("");
    setModo("ver");
    avisar.exito("Precio cambiado", { detalle: `Ahora cuesta S/ ${soles(nueva.precio)}.` });
  }

  async function retirar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando || !guiaRetiro.puedeConfirmar || !pieza.codigo) return;
    const nueva = await llamar("retirar", "retirar la pieza");
    if (!nueva) return;
    setModo("ver");
    avisar.exito("Pieza retirada", { detalle: "Ya no se puede cobrar. Queda en la lista de retiradas." });
  }

  const dias = diasALaVenta(pieza, hoy);
  const subtitulo =
    pieza.estado === "vendida"
      ? `Se vendió el ${fechaLima(pieza.vendidaEn) ?? "—"} a S/ ${soles(pieza.precio)}.`
      : pieza.estado === "retirada"
        ? `Se retiró el ${fechaLima(pieza.retiradaEn) ?? "—"}: ${pieza.motivoRetiro ?? "sin motivo"}.`
        : `A la venta ${dias <= 0 ? "desde hoy" : `hace ${tiempoALaVenta(dias)}`}${pieza.etiquetas > 1 ? `, con ${pieza.etiquetas - 1} ${pieza.etiquetas === 2 ? "rebaja" : "rebajas"}` : ""}.`;

  return (
    <Modal titulo={pieza.categoria || "Pieza de liquidación"} subtitulo={subtitulo} onClose={onClose} variante="hoja" ancho="max-w-md" conCerrar>
      <div className="space-y-4">
        {codigoViejo && codigoViejo !== pieza.codigo && pieza.estado === "disponible" && (
          <Aviso tono="atencion" titulo="Esa etiqueta ya no vale">
            Leíste {codigoViejo}, una etiqueta vieja de esta pieza. La que se cobra es la de abajo: imprímela y cámbiala en la prenda.
          </Aviso>
        )}
        {rebajadaDe !== null && (
          <Aviso tono="exito" titulo="Etiqueta nueva lista">
            Bajó de <span className="liq-tachado">S/ {soles(rebajadaDe)}</span> a S/ {soles(pieza.precio)}. Imprímela y quita la vieja de la prenda.
          </Aviso>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Chip tono={pieza.estado === "disponible" ? "verde" : pieza.estado === "vendida" ? "pizarra" : "apagado"}>
            {pieza.estado === "disponible" ? "A la venta" : pieza.estado === "vendida" ? "Vendida" : "Retirada"}
          </Chip>
          {pieza.precioInicial > pieza.precio && (
            <span className="text-[13px] text-taupe">
              Entró a <span className="liq-tachado">S/ {soles(pieza.precioInicial)}</span>
            </span>
          )}
        </div>

        {pieza.estado === "disponible" && pieza.codigo && (
          <div className="liq-previa" key={pieza.codigo}>
            <EtiquetaLiquidacion codigo={pieza.codigo} categoria={pieza.categoria} precio={pieza.precio} impreso={impreso} />
          </div>
        )}

        {modo === "precio" && (
          <form onSubmit={cambiarPrecio} className="space-y-4">
            <CampoGuiado id="precio" guia={guiaPrecio} titulo="Precio nuevo" ayuda={`Ahora: S/ ${soles(pieza.precio)} · mínimo S/ ${soles(minimo)}`}>
              <CampoMonto etiqueta="Precio nuevo" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} autoFocus />
            </CampoGuiado>
            <CampoGuiado id="responsable" guia={guiaPrecio}>
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
            <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
              <PieGuia guia={guiaPrecio} listo="Sale una etiqueta nueva; la de ahora deja de valer." />
              <div className="ml-auto flex gap-3">
                <Boton type="button" onClick={() => setModo("ver")}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" cargando={guardando} disabled={!guiaPrecio.puedeConfirmar} className={guiaPrecio.claseConfirmar}>
                  Cambiar precio
                </Boton>
              </div>
            </div>
          </form>
        )}

        {modo === "retirar" && (
          <form onSubmit={retirar} className="space-y-4">
            <CampoGuiado id="motivo" guia={guiaRetiro} titulo="Por qué sale">
              <CampoTexto etiqueta="Motivo" caja maxLength={120} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </CampoGuiado>
            <CampoGuiado id="responsable" guia={guiaRetiro}>
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
            <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
              <PieGuia guia={guiaRetiro} listo="Deja de estar a la venta. No se borra: queda en «Retiradas»." />
              <div className="ml-auto flex gap-3">
                <Boton type="button" onClick={() => setModo("ver")}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="peligro" cargando={guardando} disabled={!guiaRetiro.puedeConfirmar} className={guiaRetiro.claseConfirmar}>
                  Retirar
                </Boton>
              </div>
            </div>
          </form>
        )}

        {modo === "ver" && pieza.estado === "disponible" && (
          <>
            {impresion.avisoMac && (
              <AvisoAyudanteMac {...impresion.avisoMac} instalar={impresion.instalar} mientras="Mientras tanto, «Imprimir» usa el diálogo de Chrome: la etiqueta sale, pero con papel de sobra." />
            )}
            <div className="pie-hoja-fijo flex flex-wrap items-center justify-end gap-3 pt-2">
              <Boton type="button" peso="peligro" onClick={() => setModo("retirar")}>
                Retirar
              </Boton>
              <Boton type="button" onClick={() => setModo("precio")}>
                Bajar el precio
              </Boton>
              <Boton type="button" peso="primario" cargando={impresion.enviando} onClick={impresion.imprimir}>
                Imprimir etiqueta
              </Boton>
            </div>
          </>
        )}
        {impresion.hoja}
      </div>
    </Modal>
  );
}
