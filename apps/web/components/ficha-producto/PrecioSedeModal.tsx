"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import { camposPonerPrecio, camposQuitarPrecio, fraseDiferencia, leerMonto, muyLejos, soles, type PrecioDeSede } from "@/lib/precio-sede-reglas";
import { sugerirMotivo } from "@/lib/sugerencias-precio-sede";

export type Tienda = { id: string; nombre: string };

const ID_PRECIO = "precio-sede-monto";
const ID_MOTIVO = "precio-sede-motivo";

/**
 * «Precio distinto en una sede» (Felipe 2026-10-09). Guarda en el acto con `poner_precio_sede`: no espera al «Confirmar y
 * guardar» de la ficha, porque no es un cambio de la ficha sino de UNA tienda, con su motivo y su firma. Si la prenda ya tenía
 * precio en esa tienda (`actual`), lo reemplaza.
 */
export function PonerPrecioSedeModal({
  productoId,
  tiendas,
  general,
  actual,
  onClose,
  onGuardado,
}: {
  productoId: string;
  /** Las tiendas donde esta cuenta puede poner precio (la suya; el líder, todas). */
  tiendas: readonly Tienda[];
  general: number | null;
  /** Cambiar el precio que ya tiene una tienda. */
  actual?: PrecioDeSede;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [tiendaId, setTiendaId] = useState<string>(actual?.ubicacionId ?? (tiendas.length === 1 ? tiendas[0].id : ""));
  const [monto, setMonto] = useState(actual ? actual.precio.toFixed(2) : "");
  const [motivo, setMotivo] = useState(actual?.motivo ?? "");
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();

  const tienda = tiendas.find((t) => t.id === tiendaId) ?? null;
  const precio = leerMonto(monto);
  const campos = camposPonerPrecio({
    tiendaId: tienda?.id ?? null,
    monto,
    general,
    motivo,
    responsableListo: responsable.listo,
    responsableMotivo: responsable.motivo,
  });
  const guia = useGuiaCampos(campos);
  const lejos = muyLejos(precio, general);
  const diferencia = precio !== null ? fraseDiferencia(precio, general) : null;

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!sePuedeConfirmar(campos) || !tienda || precio === null) {
      const falta = campos.find((c) => !c.hecho);
      if (falta) avisar.error(falta.pendiente, { enfocar: falta.id === "precio" ? ID_PRECIO : falta.id === "motivo" ? ID_MOTIVO : undefined });
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("poner_precio_sede", { p_producto_id: productoId, p_ubicacion_id: tienda.id, p_precio: precio, p_motivo: motivo.trim() }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "guardar el precio de la tienda"));
      return;
    }
    avisar.exito(`Precio de ${tienda.nombre} guardado`, { detalle: `Ahí se vende a ${soles(precio)}. Las etiquetas que se impriman ahí saldrán con este precio.` });
    onGuardado();
  }

  return (
    <Modal
      titulo={actual ? `Cambiar el precio de ${actual.sede}` : "Precio distinto en una sede"}
      subtitulo={
        general !== null
          ? `En las demás tiendas sigue a ${soles(general)}. En la que elijas se cobra este precio en Vender, apartados y cambios.`
          : "En la tienda que elijas se cobra este precio en Vender, apartados y cambios."
      }
      onClose={onClose}
      variante="hoja"
      conCerrar
    >
      {(cerrar) => (
        <form onSubmit={onGuardar} className="space-y-6">
          <CampoGuiado id="tienda" guia={guia} titulo="Tienda">
            {tiendas.length === 1 || actual ? (
              <p className="text-[14px] text-tinta">{tienda?.nombre ?? actual?.sede}</p>
            ) : (
              <CampoSelect
                etiqueta="Tienda"
                caja
                valor={tiendaId}
                onValor={setTiendaId}
                marcador="Elige la tienda"
                opciones={tiendas.map((t) => ({ valor: t.id, texto: t.nombre }))}
              />
            )}
          </CampoGuiado>

          <CampoGuiado id="precio" guia={guia} titulo={tienda ? `Precio en ${tienda.nombre}` : "Precio en esta tienda"}>
            <CampoTexto
              id={ID_PRECIO}
              etiqueta="Precio (S/)"
              caja
              inputMode="decimal"
              autoComplete="off"
              // sugerir-fijo: el ejemplo es el precio general de esta misma prenda, no depende de otra elección
              placeholder={general !== null ? general.toFixed(2) : "0.00"}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              pie={diferencia && diferencia !== "igual que el general" ? diferencia : undefined}
            />
          </CampoGuiado>

          {lejos && precio !== null && general !== null && (
            <Aviso tono="atencion" titulo="Revisa el precio" chico>
              {soles(precio)} está muy lejos del general ({soles(general)}). Revisa que no sobre o falte un número; si es correcto, guárdalo igual.
            </Aviso>
          )}

          <CampoGuiado id="motivo" guia={guia} titulo="Por qué">
            <CampoTexto
              id={ID_MOTIVO}
              etiqueta="Por qué esta tienda tiene otro precio"
              caja
              maxLength={160}
              placeholder={sugerirMotivo({ sede: tienda?.nombre ?? null, monto, general }).texto}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <PieGuia guia={guia} listo="Todo listo para guardar." />
            <div className="ml-auto flex gap-3">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={guardando}
                disabled={!guia.puedeConfirmar}
                title={responsable.motivo ?? guia.frase ?? undefined}
                className={guia.claseConfirmar}
              >
                {tienda ? `Guardar precio de ${tienda.nombre}` : "Guardar precio"}
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Quitar el precio propio: la prenda vuelve al general en esa tienda. Se puede volver a poner; queda en el historial. */
export function QuitarPrecioSedeModal({
  productoId,
  precio,
  general,
  onClose,
  onGuardado,
}: {
  productoId: string;
  precio: PrecioDeSede;
  general: number | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();
  const campos = camposQuitarPrecio({ responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const guia = useGuiaCampos(campos);

  async function onQuitar(e: React.FormEvent) {
    e.preventDefault();
    if (!sePuedeConfirmar(campos)) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("quitar_precio_sede", { p_producto_id: productoId, p_ubicacion_id: precio.ubicacionId, p_motivo: motivo.trim() || undefined }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "quitar el precio de la tienda"));
      return;
    }
    avisar.exito(`${precio.sede} vuelve al precio general`, general !== null ? { detalle: `Ahí se vende otra vez a ${soles(general)}.` } : undefined);
    onGuardado();
  }

  return (
    <Modal
      titulo={`Quitar el precio de ${precio.sede}`}
      subtitulo={
        general !== null
          ? `Hoy se vende ahí a ${soles(precio.precio)}. Al quitarlo vuelve a ${soles(general)}, como en las demás tiendas.`
          : `Hoy se vende ahí a ${soles(precio.precio)}. Al quitarlo vuelve al precio general.`
      }
      onClose={onClose}
      variante="hoja"
      conCerrar
    >
      {(cerrar) => (
        <form onSubmit={onQuitar} className="space-y-6">
          <CampoTexto
            etiqueta="Por qué (opcional)"
            caja
            maxLength={160}
            // sugerir-fijo: quitar no tiene elección previa que el ejemplo deba seguir; es una instrucción, no un ejemplo
            placeholder="Por qué vuelve al precio general"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <PieGuia guia={guia} listo="Listo para quitarlo." />
            <div className="ml-auto flex gap-3">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="peligro" cargando={guardando} disabled={!guia.puedeConfirmar} title={responsable.motivo ?? guia.frase ?? undefined}>
                Quitar precio de {precio.sede}
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
