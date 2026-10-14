"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  FRASE_BAJO_COSTO,
  IGUAL_AL_DE_LA_PRENDA,
  avisoEtiquetasAlCambiar,
  camposPonerPrecio,
  camposQuitarPrecio,
  fraseDiferencia,
  leerMonto,
  muyLejos,
  bajoElCostoSinIgual,
  soles,
  type PrecioDeSede,
} from "@/lib/precio-sede-reglas";
import { sugerirMotivo } from "@/lib/sugerencias-precio-sede";
import { useStockEnSede } from "@/components/useStockEnSede";

export type Tienda = { id: string; nombre: string };

const ID_PRECIO = "precio-sede-monto";
const ID_MOTIVO = "precio-sede-motivo";

/** Cuántas prendas del modelo hay en la tienda elegida, piso y almacén (para el aviso de etiquetas): la misma lectura física de
 *  Etiquetas (`useStockEnSede`: cada prenda colgada lleva su etiqueta). `undefined` mientras se lee, `null` si no se pudo (sin
 *  permiso para ver esa tienda, o sin red): entonces el aviso no se da. */
function usePrendasEnTienda(productoId: string, ubicacionId: string | null) {
  const { leer } = useStockEnSede(ubicacionId ?? "");
  const [leido, setLeido] = useState<{ id: string; n: number | null } | null>(null);
  useEffect(() => {
    if (!ubicacionId) return;
    let vivo = true;
    void leer([productoId]).then((porVariante) => {
      if (!vivo) return;
      setLeido({ id: ubicacionId, n: porVariante ? [...porVariante.values()].reduce((suma, n) => suma + Math.max(0, n), 0) : null });
    });
    return () => {
      vivo = false;
    };
  }, [productoId, ubicacionId, leer]);
  return ubicacionId && leido?.id === ubicacionId ? leido.n : undefined;
}

/** «Imprimir etiquetas» al terminar, solo en la tienda de quien guarda: la etiqueta sale con el precio de la tienda donde se imprime. */
function accionImprimir(router: ReturnType<typeof useRouter>, productoId: string, ubicacionId: string, ubicacionActual: string | null, unidades: number | null | undefined) {
  if (ubicacionId !== ubicacionActual || !unidades) return {};
  return { accion: { texto: "Imprimir etiquetas", onClick: () => router.push(`/etiquetas-de-precio?producto=${productoId}`) }, duracion: 10000 };
}

/**
 * «Precio distinto en una sede» (Felipe 2026-10-09). Guarda en el acto con `poner_precio_sede`: no espera al «Confirmar y
 * guardar» de la ficha, porque no es un cambio de la ficha sino de UNA tienda, con su motivo y su firma. Si la prenda ya tenía
 * precio en esa tienda (`actual`), lo reemplaza. Vale para TODA la prenda en esa tienda (sus tallas de hoy y las que se agreguen).
 * Antes de guardar dice cuántas prendas de esa tienda llevan la etiqueta con el precio de antes (2026-10-10: la caja empieza a cobrar
 * el nuevo en el acto y el cliente puede exigir el de la etiqueta).
 */
export function PonerPrecioSedeModal({
  productoId,
  tiendas,
  tiendaInicial,
  general,
  costoMaximo,
  precioAntesEn,
  ubicacionActual,
  actual,
  onClose,
  onGuardado,
}: {
  productoId: string;
  /** Las tiendas donde esta cuenta puede poner precio (la suya; el líder, todas). */
  tiendas: readonly Tienda[];
  /** La tienda ya elegida (desde su fila en «Precio por tienda»). */
  tiendaInicial?: string;
  /** El precio de la prenda, si todas sus tallas valen igual; si cambia según la talla, null. */
  general: number | null;
  /** Lo que cuesta la talla activa que MÁS cuesta, si esta cuenta ve costos; null si no (la base rechaza igual un precio bajo el costo). */
  costoMaximo: number | null;
  /** A cuánto vende HOY la prenda cada tienda (lo que dice la etiqueta colgada). */
  precioAntesEn: (ubicacionId: string) => number | null;
  /** La tienda de quien guarda: ahí se ofrece imprimir las etiquetas nuevas. */
  ubicacionActual: string | null;
  /** Cambiar el precio que ya tiene una tienda. */
  actual?: PrecioDeSede;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const router = useRouter();
  const [tiendaId, setTiendaId] = useState<string>(
    actual?.ubicacionId ?? (tiendaInicial && tiendas.some((t) => t.id === tiendaInicial) ? tiendaInicial : tiendas.length === 1 ? tiendas[0].id : ""),
  );
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
    costoMaximo,
  });
  const guia = useGuiaCampos(campos);
  const lejos = muyLejos(precio, general);
  // El piso de la base (Felipe 2026-10-11): no se puede bajar del costo. Solo se sabe aquí si esta cuenta ve costos; si no, la base lo dice al guardar.
  const bajoCosto = bajoElCostoSinIgual(precio, general, costoMaximo);
  const diferencia = precio !== null ? fraseDiferencia(precio, general) : null;
  const unidades = usePrendasEnTienda(productoId, tienda?.id ?? null);
  const antes = tienda ? precioAntesEn(tienda.id) : null;
  // Solo si el precio de esa tienda va a cambiar de verdad.
  const avisoEtiquetas =
    tienda && unidades && precio !== null && (antes === null || Math.abs(antes - precio) >= 0.005)
      ? avisoEtiquetasAlCambiar(unidades, tienda.nombre, antes)
      : null;

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!sePuedeConfirmar(campos) || !tienda || precio === null) {
      const falta = campos.find((c) => !c.hecho);
      if (falta) avisar.error(falta.pendiente, { enfocar: falta.id === "precio" ? ID_PRECIO : falta.id === "motivo" ? ID_MOTIVO : undefined });
      return;
    }
    setGuardando(true);
    const { data: cambiadas, error } = await firmar(
      createClient().rpc("poner_precio_sede", { p_producto_id: productoId, p_ubicacion_id: tienda.id, p_precio: precio, p_motivo: motivo.trim() }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "guardar el precio de la tienda"));
      return;
    }
    // La base no cambió nada (ya tenía ese precio y ese motivo): decirlo, no anunciar «guardado».
    if (cambiadas === 0) {
      avisar.aviso(`No había nada que cambiar en ${tienda.nombre}`, { detalle: "Ya tenía ese precio y ese motivo." });
      onGuardado();
      return;
    }
    avisar.exito(`Precio de ${tienda.nombre} guardado`, {
      detalle: `Ahí se vende a ${soles(precio)}, en todas sus tallas.${avisoEtiquetas ? ` ${avisoEtiquetas}` : ""}`,
      ...accionImprimir(router, productoId, tienda.id, ubicacionActual, unidades),
    });
    onGuardado();
  }

  return (
    <Modal
      titulo={actual ? `Cambiar el precio de ${actual.sede}` : tienda && tiendas.length === 1 ? `Precio propio en ${tienda.nombre}` : "Precio distinto en una sede"}
      subtitulo="Todas sus tallas y colores se venden a este precio en esa tienda, en Vender y en apartados. Las otras tiendas no cambian. (Un cambio de talla o color vale lo que se pagó donde se compró.)"
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
              // El piso va en el pie del campo (la pieza decidida para el error de UN dato), no en un aviso aparte: no desplaza nada.
              tono={bajoCosto ? "error" : undefined}
              pie={bajoCosto ? FRASE_BAJO_COSTO : diferencia && diferencia !== IGUAL_AL_DE_LA_PRENDA ? diferencia : undefined}
            />
          </CampoGuiado>

          {lejos && !bajoCosto && precio !== null && general !== null && (
            <Aviso tono="atencion" titulo="Revisa el precio" chico>
              {soles(precio)} está muy lejos del precio de la prenda ({soles(general)}). Revisa que no sobre o falte un número; si es correcto, guárdalo igual.
            </Aviso>
          )}

          {avisoEtiquetas && (
            <Aviso tono="info" titulo="Etiquetas colgadas" chico>
              {avisoEtiquetas} Desde que guardes, la caja cobra el precio nuevo.
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
            <div className="ml-auto pie-acciones">
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

/** Quitar el precio propio: la prenda vuelve al precio de la prenda en esa tienda. Se puede volver a poner; queda en el historial. */
export function QuitarPrecioSedeModal({
  productoId,
  precio,
  general,
  ubicacionActual,
  onClose,
  onGuardado,
}: {
  productoId: string;
  precio: PrecioDeSede;
  /** El precio de la prenda, si todas sus tallas valen igual; si cambia según la talla, null. */
  general: number | null;
  /** La tienda de quien quita: ahí se ofrece imprimir las etiquetas nuevas. */
  ubicacionActual: string | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const router = useRouter();
  const unidades = usePrendasEnTienda(productoId, precio.ubicacionId);
  const avisoEtiquetas =
    unidades && (general === null || Math.abs(general - precio.precio) >= 0.005) ? avisoEtiquetasAlCambiar(unidades, precio.sede, precio.precio) : null;
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
    avisar.exito(`${precio.sede} vuelve al precio de la prenda`, {
      detalle: `${general !== null ? `Ahí se vende otra vez a ${soles(general)}.` : "Ahí se vende otra vez al precio de cada talla."}${avisoEtiquetas ? ` ${avisoEtiquetas}` : ""}`,
      ...accionImprimir(router, productoId, precio.ubicacionId, ubicacionActual, unidades),
    });
    onGuardado();
  }

  return (
    <Modal
      titulo={`Quitar el precio de ${precio.sede}`}
      subtitulo={
        general !== null
          ? `Hoy se vende ahí a ${soles(precio.precio)}. Al quitarlo vuelve al precio de la prenda: ${soles(general)}.`
          : `Hoy se vende ahí a ${soles(precio.precio)}. Al quitarlo vuelve al precio de cada talla.`
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
            placeholder="Por qué vuelve al precio de la prenda"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {avisoEtiquetas && (
            <Aviso tono="info" titulo="Etiquetas colgadas" chico>
              {avisoEtiquetas} Desde que lo quites, la caja cobra el precio de la prenda.
            </Aviso>
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <PieGuia guia={guia} listo="Listo para quitarlo." />
            <div className="ml-auto pie-acciones">
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
