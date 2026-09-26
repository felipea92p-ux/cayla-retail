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
import { leerSePuedeEliminar, salidaSinEliminar, textoNoSePuede, textoSeBorra, type SePuedeEliminar } from "@/lib/eliminar-producto-reglas";

/**
 * «Eliminar» un producto (Felipe, 2026-09-26: solo Admin y Líder; ADR-0218).
 *
 * Primero PREGUNTA a la base si se puede (`fn_producto_se_puede_eliminar`) y recién con la respuesta muestra algo:
 *  - se puede → qué se borra + el combo «Responsable» + Eliminar (`eliminar_producto`, todo o nada);
 *  - no se puede → por qué, y la salida (descontinuarlo desde Editar). NUNCA un botón de borrar que la base va a rechazar:
 *    el líder no tiene que descubrir por prueba y error que Top Aurora tiene 7 ventas.
 *  - no se pudo preguntar (la base no respondió, o todavía no tiene la función) → se dice, y no se ofrece borrar a ciegas.
 *
 * Quien decide de verdad es la base: aunque esta ventana mintiera, `eliminar_producto` vuelve a comprobar dentro de la
 * misma transacción, con la fila bloqueada. La pantalla solo evita el clic inútil.
 */
export function EliminarProductoModal({
  producto,
  onClose,
}: {
  producto: { productoId: string; referencia: string; estado: string; numVariantes: number };
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [comprobacion, setComprobacion] = useState<SePuedeEliminar | "cargando" | "fallo">("cargando");
  const [eliminando, setEliminando] = useState(false);
  // Sube cuando hay que volver a preguntar (otra persona movió el producto con esta ventana abierta).
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    createClient()
      .rpc("fn_producto_se_puede_eliminar", { p_producto_id: producto.productoId })
      .then(({ data, error }) => {
        if (!vigente) return;
        setComprobacion(error ? "fallo" : (leerSePuedeEliminar(data) ?? "fallo"));
      });
    return () => {
      vigente = false;
    };
  }, [producto.productoId, intento]);

  async function eliminar(cerrar: () => void) {
    if (!responsable.listo) return;
    setEliminando(true);
    const { data, error } = await firmar(createClient().rpc("eliminar_producto", { p_producto_id: producto.productoId }), responsable.firma());
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

  const puede = typeof comprobacion === "object" && comprobacion.puede;
  const salida = typeof comprobacion === "object" && !comprobacion.puede ? salidaSinEliminar(producto.estado, comprobacion.razon) : null;
  // «No se puede» solo cuando la base lo dijo: si no se pudo ni preguntar, el título no afirma nada.
  const titulo = puede
    ? `¿Eliminar «${producto.referencia}»?`
    : typeof comprobacion === "object"
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

          {typeof comprobacion === "object" && !comprobacion.puede && (
            <>
              <p className="text-sm text-tinta/80">{textoNoSePuede(producto.referencia, comprobacion.razon)}</p>
              {salida && <p className="text-sm text-tinta/70">{salida.texto}</p>}
            </>
          )}

          {puede && (
            <>
              <p className="text-sm text-tinta/80">{textoSeBorra(producto.numVariantes)}</p>
              <ComboResponsable control={responsable} deshabilitado={eliminando} />
            </>
          )}

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
                Eliminar
              </Boton>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
