"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  TEXTO_RESPALDO,
  leerComoEliminar,
  ofreceEliminar,
  rpcParaEliminar,
  salidaSinEliminar,
  textoNoSePuede,
  textoQuienLoCargo,
  textoSeBorra,
  textoSeBorraConHistoria,
  type ComoEliminar,
} from "@/lib/eliminar-producto-reglas";

/**
 * «Eliminar» un producto (ADR-0218 sin historia, ADR-0252 con su historia de stock). Lo hace quien edita el catálogo
 * (`fn_puede_editar_catalogo`; hasta el 2026-10-03 era solo del Líder y, con historia, solo del Admin).
 *
 * Primero PREGUNTA a la base cómo se puede eliminar (`fn_producto_como_eliminar`) y recién con la respuesta muestra algo:
 *  - libre → qué se borra + el combo «Responsable» + Eliminar (`eliminar_producto`, todo o nada);
 *  - con historia de stock → cuánto se va, quién lo cargó y cuándo, el respaldo + «Eliminar con su historia»
 *    (`eliminar_producto_con_historia`, todo o nada). Si la base dice que esta cuenta no puede, ve por qué y la salida;
 *  - con documentos (ventas, compras, traslados…) o pieza del sistema → por qué no, y la salida (descontinuarlo desde
 *    Editar). NUNCA un botón que la base va a rechazar;
 *  - no se pudo preguntar (la base no respondió, o todavía no tiene la función) → se dice, y no se ofrece borrar a ciegas.
 *
 * Quien decide de verdad es la base: aunque esta ventana mintiera, las dos funciones vuelven a comprobar dentro de la
 * misma transacción, con las filas bloqueadas. La pantalla solo evita el clic inútil.
 */
export function EliminarProductoModal({
  producto,
  onClose,
}: {
  /** `estado` y `numVariantes` solo redactan los textos; `null` = no se sabe (Existencias abre desde un color en una sede
   *  y no sabe cuántas variantes tiene el producto; el estado, si su lectura del catálogo falló). Lo que se puede y lo que
   *  se borra lo decide la base, no estos dos. */
  producto: { productoId: string; referencia: string; estado: string | null; numVariantes: number | null };
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [comprobacion, setComprobacion] = useState<ComoEliminar | "cargando" | "fallo">("cargando");
  const [eliminando, setEliminando] = useState(false);
  // Sube cuando hay que volver a preguntar (otra persona movió el producto con esta ventana abierta).
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    createClient()
      .rpc("fn_producto_como_eliminar", { p_producto_id: producto.productoId })
      .then(({ data, error }) => {
        if (!vigente) return;
        setComprobacion(error ? "fallo" : (leerComoEliminar(data) ?? "fallo"));
      });
    return () => {
      vigente = false;
    };
  }, [producto.productoId, intento]);

  const como = typeof comprobacion === "object" ? comprobacion : null;
  const rpc = como ? rpcParaEliminar(como) : null;

  async function eliminar(cerrar: () => void) {
    if (!responsable.listo || !rpc) return;
    setEliminando(true);
    const { data, error } = await firmar(createClient().rpc(rpc, { p_producto_id: producto.productoId }), responsable.firma());
    setEliminando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "eliminar el producto"));
      // Otra persona lo movió mientras esta ventana estaba abierta: se vuelve a preguntar para mostrar la razón actual.
      if (error.message?.startsWith("No se puede eliminar")) {
        setComprobacion("cargando");
        setIntento((n) => n + 1);
      }
      return;
    }
    avisar.exito(`«${data ?? producto.referencia}» eliminado`);
    cerrar();
    router.refresh();
  }

  const puede = como ? ofreceEliminar(como) : false;
  const conHistoria = puede && como?.nivel === "con_historia";
  const salida = como && !puede ? salidaSinEliminar(producto.estado, como.nivel) : null;
  const quien = como && como.nivel !== "libre" ? textoQuienLoCargo(como.cargadoPor, como.cargadoEl) : null;
  // «No se puede» solo cuando la base lo dijo: si no se pudo ni preguntar, el título no afirma nada.
  const titulo = puede
    ? conHistoria
      ? `¿Eliminar «${producto.referencia}» con su historia?`
      : `¿Eliminar «${producto.referencia}»?`
    : como
      ? `No se puede eliminar «${producto.referencia}»`
      : `Eliminar «${producto.referencia}»`;

  return (
    <Modal titulo={titulo} ancho="max-w-md" bloqueado={eliminando} onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          {comprobacion === "cargando" && <p className="text-sm text-tinta/70">Revisando si tiene ventas o movimientos…</p>}

          {comprobacion === "fallo" && (
            <p className="text-sm text-tinta/80">
              No se pudo comprobar si se puede eliminar. Cierra esta ventana y vuelve a intentar; si sigue igual, avisa a Felipe.
            </p>
          )}

          {como && !puede && (
            <>
              <p className="text-sm text-tinta/80">{textoNoSePuede(producto.referencia, como)}</p>
              {quien && <p className="text-sm text-tinta/70">{quien}</p>}
              {salida && <p className="text-sm text-tinta/70">{salida.texto}</p>}
            </>
          )}

          {puede && !conHistoria && <p className="text-sm text-tinta/80">{textoSeBorra(producto.numVariantes)}</p>}

          {conHistoria && como && (
            <>
              <p className="text-sm text-tinta/80">{textoSeBorraConHistoria(producto.numVariantes, como.prendas, como.movimientos)}</p>
              {quien && <p className="text-sm font-medium text-rojo">{quien} Revisa que de verdad sea de prueba antes de seguir.</p>}
              <p className="nota-cayla">{TEXTO_RESPALDO}</p>
            </>
          )}

          {puede && <ComboResponsable control={responsable} deshabilitado={eliminando} />}

          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={eliminando}>
              {puede ? "Cancelar" : "Cerrar"}
            </Boton>
            {salida?.irAEditar && (
              <Link href={`/productos/${producto.productoId}/editar`} className="label-cayla flex flex-1 items-center justify-center rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo-profundo">
                Editar
              </Link>
            )}
            {puede && (
              <Boton peso="primario" className="flex-1" cargando={eliminando} disabled={!responsable.listo} title={responsable.motivo ?? undefined} onClick={() => void eliminar(cerrar)}>
                {conHistoria ? "Eliminar con su historia" : "Eliminar"}
              </Boton>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
