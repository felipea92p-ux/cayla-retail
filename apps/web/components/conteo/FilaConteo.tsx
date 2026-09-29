"use client";

import { memo, useCallback, useSyncExternalStore } from "react";
import { notaDeLinea, type PrendaConteo } from "@/lib/conteo-reglas";
import { CampoContaste } from "@/components/conteo/CampoContaste";
import { EstadoLinea } from "@/components/conteo/EstadoLinea";
import type { ControlConteo } from "@/components/conteo/control-conteo";

/* ====================================================================
   FilaConteo · UNA talla de la lista de Contar: Talla · Debe haber · Contaste · Estado
   (Inventario ▸ Conteo ▸ Contar, rediseño 2026-09-29; plano §3.3)

   Es una fila de la tabla (`<tr>`), `memo` y suscrita SOLO a su variante: cuando el escáner suma una unidad o la base
   contesta, se vuelve a dibujar esta fila y ninguna otra. Con 800 filas en pantalla, esa es la diferencia entre que
   escribir un número responda al instante o se sienta pesado.

   «Debe haber» es SIEMPRE lo que CAYLA esperaba al verificar (`cantidad_sistema`). La foto de cuando se abrió el conteo
   solo aparece como nota discreta bajo el estado, cuando difiere: «Al abrir: 11 · salieron 1 durante el conteo» — es lo
   que explica por qué una venta a media cuenta NO es un faltante.

   El alto de la fila es el mismo en todos los estados: 60 px = 8 + input de 44 + 8. El estado y su nota caben dentro.
   ==================================================================== */

export const FilaConteo = memo(function FilaConteo({
  prenda,
  oculta,
  control,
  alConfirmar,
  alInvalido,
  alEnter,
}: {
  prenda: PrendaConteo;
  /** Escondida por el buscador: sigue montada (conserva lo escrito) pero no se ve ni se puede enfocar. */
  oculta: boolean;
  control: ControlConteo;
  alConfirmar: (varianteId: string, cantidad: number | null) => boolean;
  alInvalido: (texto: string) => void;
  alEnter: (campo: HTMLInputElement) => void;
}) {
  const id = prenda.varianteId;
  const suscribir = useCallback((avisar: () => void) => control.suscribirLinea(id, avisar), [control, id]);
  const leer = useCallback(() => control.linea(id), [control, id]);
  const linea = useSyncExternalStore(suscribir, leer, leer);
  // La línea pudo salir del conteo (se le borró la cantidad a una que no estaba en la foto) un instante antes de que la lista se reagrupe.
  if (!linea) return null;

  const nota = notaDeLinea(linea);
  const tinte = linea.estado === "correcta" ? "bg-verde/[0.045]" : linea.estado === "en_reconteo" ? "bg-ambar/[0.05]" : "";
  const talla = prenda.talla ?? "Única";
  const etiqueta = `Contaste de ${prenda.referencia} ${prenda.color ?? ""} talla ${talla}`.replace(/\s+/g, " ");

  return (
    <tr hidden={oculta} className={`transition-colors duration-300 ${tinte}`}>
      <th
        scope="row"
        // «Estándar» (8 letras) en 13 px mide ~56 px y la columna angosta le deja 48: en el celular baja a 11 px para leerse entera.
        className={`py-2 pl-3 pr-1 text-left align-middle font-semibold text-tinta @[36rem]:pl-5 @[36rem]:text-sm ${talla.length > 5 ? "text-[11px] @[36rem]:text-sm" : "text-[13px]"}`}
      >
        <span className="block truncate" title={talla}>
          {talla}
        </span>
      </th>
      <td className="px-1 py-2 text-center align-middle text-sm tabular-nums text-tinta/85 @[36rem]:px-3">{linea.debeHaber}</td>
      <td className="px-1 py-2 align-middle @[36rem]:px-3">
        <CampoContaste varianteId={id} contada={linea.contada} etiqueta={etiqueta} alConfirmar={alConfirmar} alInvalido={alInvalido} alEnter={alEnter} />
      </td>
      <td className="py-2 pl-1.5 pr-3 align-middle @[36rem]:pr-5">
        <EstadoLinea estado={linea.estado} debeHaber={linea.debeHaber} contada={linea.contada} diferencia={linea.diferencia} />
        {nota && <p className="mt-0.5 text-[11px] leading-[15px] text-taupe">{nota}</p>}
      </td>
    </tr>
  );
});
