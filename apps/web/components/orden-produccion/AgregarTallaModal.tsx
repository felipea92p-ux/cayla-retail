"use client";

import { useState, type RefObject } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { fraseDeLasTallasNuevas, tallasDesactivadas, tallasQueFaltan, type VarianteDesactivada } from "@/lib/agregar-variantes-orden-reglas";
import type { CategoriaDeModelo } from "@/lib/modelo-nuevo-reglas";
import { useAgregarVariantes } from "./useAgregarVariantes";

// «+ Talla» de la matriz de Nueva orden (Felipe, 2026-10-31): las tallas que le faltan al modelo se agregan aquí, sin salir a Catálogo ▸ Editar producto. Se pueden elegir
// varias de una vez: la base las crea todas o ninguna, una prenda por cada color del modelo, con su precio y su costo y sin stock.
//
// Va SIN `<form>` a propósito: la hoja se abre desde dentro del formulario de la orden y React hace subir los eventos de un portal por sus ancestros (ADR-0128), así que
// un «submit» de acá abriría la orden entera. Un botón normal no tiene ese riesgo.

export function AgregarTallaModal({
  tallerId,
  productoId,
  referencia,
  categoria,
  variantes,
  desactivadas = [],
  alCerrarEnfocar,
  onClose,
}: {
  tallerId: string;
  productoId: string;
  referencia: string;
  categoria: CategoriaDeModelo | null;
  variantes: readonly { talla: string | null; color: string | null }[];
  /** Las variantes desactivadas del modelo: sus tallas no se ofrecen (se reactivan desde Editar producto). */
  desactivadas?: readonly VarianteDesactivada[];
  /** El botón que abrió la hoja: al cerrar, el foco vuelve a él. */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { responsable, cargando, agregar } = useAgregarVariantes({ tallerId, productoId, onClose });
  const faltan = tallasQueFaltan(categoria, variantes, desactivadas);
  const apagadas = tallasDesactivadas(categoria, variantes, desactivadas);
  const [elegidasIds, setElegidasIds] = useState<string[]>([]);
  // En el orden de la lista (S · M · L), no en el de los clics.
  const elegidas = faltan.filter((t) => elegidasIds.includes(t.id));

  const alternar = (id: string) => setElegidasIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const nombres = elegidas.map((t) => t.valor);

  return (
    <Modal titulo="Agregar tallas" subtitulo={`A ${referencia}. Quedan en el catálogo, como si las hubieras agregado desde Editar producto.`} variante="hoja" tamano="angosta" alCerrarEnfocar={alCerrarEnfocar} onClose={onClose}>
      <div className="mt-3.5 space-y-5">
        <div className="space-y-2">
          <span className={campoEtiqueta}>Qué tallas</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tallas que le faltan al modelo">
            {faltan.map((t) => (
              <ChipOpcion key={t.id} elegido={elegidasIds.includes(t.id)} onClick={() => alternar(t.id)} disabled={cargando}>
                {t.valor}
              </ChipOpcion>
            ))}
          </div>
        </div>

        {apagadas.length > 0 && (
          <p className="text-sm text-tinta/65">
            {apagadas.length === 1 ? `La talla ${apagadas[0]} está desactivada en este modelo: se reactiva` : `Las tallas ${apagadas.join(", ")} están desactivadas en este modelo: se reactivan`} desde Editar producto.
          </p>
        )}

        {elegidas.length > 0 && (
          <Aviso tono="info" chico>
            {fraseDeLasTallasNuevas(nombres, variantes)}
          </Aviso>
        )}

        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={onClose} disabled={cargando}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              cargando={cargando}
              textoCargando="Agregando…"
              onClick={() =>
                void agregar(
                  { tallaIds: elegidas.map((t) => t.id) },
                  `${elegidas.length === 1 ? `Talla ${nombres[0]} agregada` : `Tallas ${nombres.join(", ")} agregadas`} a ${referencia}`,
                  "agregar las tallas"
                )
              }
              disabled={elegidas.length === 0 || !responsable.listo}
              title={elegidas.length === 0 ? "Elige las tallas que faltan." : (responsable.motivo ?? undefined)}
            >
              {elegidas.length === 0 ? "Agregar tallas" : elegidas.length === 1 ? `Agregar la talla ${nombres[0]}` : `Agregar ${elegidas.length} tallas`}
            </Boton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
