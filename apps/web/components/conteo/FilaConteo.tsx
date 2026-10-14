"use client";

import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { notaDeLinea, textoHabiaAntes, type PrendaConteo } from "@/lib/conteo-reglas";
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

   Fila de la tabla del sistema (ADR-0358, ronda 9: `fila-cayla`, rayado en hueso, cascada al abrir): 39 px con puntero fino (6 + control
   de 26 + 6 + línea; con dedo, el control sube a 36), algo más alta que la compacta de antes, que se lee mejor de pie con la prenda en la
   mano. La talla que se acaba de contar respira en verde una vez (`data-recien`, como la fila recién guardada de <Tabla>). El estado no
   reserva la línea de «Confirmado»: en Contar casi nunca aparece, y la nota solo estira la fila cuando hay algo que explicar.
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
  // La talla recién contada respira en verde una vez: solo cuando su número CAMBIA (no al abrir la lista con lo ya contado). Se quita el
  // atributo al terminar, para que la fila vuelva a su tinte (verde si quedó correcta) y a su rayado.
  const fila = useRef<HTMLTableRowElement>(null);
  const contadaAntes = useRef(linea?.contada);
  const contada = linea?.contada;
  useEffect(() => {
    if (contadaAntes.current === contada) return;
    contadaAntes.current = contada;
    const el = fila.current;
    if (!el || contada === null || contada === undefined) return;
    el.removeAttribute("data-recien");
    void el.offsetWidth;
    el.setAttribute("data-recien", "");
    // Solo el fin de ESE respiro (el estado de adentro también anima al asentarse).
    const quitar = (e: AnimationEvent) => {
      if (e.animationName !== "cayla-fila-recien") return;
      el.removeAttribute("data-recien");
      el.removeEventListener("animationend", quitar);
    };
    el.addEventListener("animationend", quitar);
    return () => el.removeEventListener("animationend", quitar);
  }, [contada]);
  // La línea pudo salir del conteo (se le borró la cantidad a una que no estaba en la foto) un instante antes de que la lista se reagrupe.
  if (!linea) return null;

  const nota = notaDeLinea(linea);
  const habiaAntes = textoHabiaAntes(linea);
  const tinte = linea.estado === "correcta" ? "bg-verde/[0.045]" : linea.estado === "en_reconteo" ? "bg-ambar/[0.05]" : "";
  const talla = prenda.talla ?? "Única";
  const etiqueta = `Contaste de ${prenda.referencia} ${prenda.color ?? ""} talla ${talla}`.replace(/\s+/g, " ");

  return (
    <tr ref={fila} hidden={oculta} className={`fila-cayla transition-colors duration-300 ${tinte}`}>
      <th
        scope="row"
        // «Estándar» (8 letras) mide ~56 px y la columna angosta le deja 44: en una tarjeta angosta baja a 11 px para leerse entera.
        className={`py-[6px] pl-[18px] pr-1 text-left align-middle font-semibold text-tinta ${talla.length > 5 ? "text-[11px] @[26rem]:text-sm" : "text-sm"}`}
      >
        <span className="block truncate" title={talla}>
          {talla}
        </span>
      </th>
      <td className="px-1 py-[6px] text-center align-middle text-sm tabular-nums text-tinta/65">
        {linea.debeHaber}
        {/* Al corregir un conteo cerrado el «debe haber» salta al contar de nuevo (3 → 2): esta marca fija dice con cuánto se empezó. */}
        {habiaAntes && <span className="block text-[10px] leading-[12px] text-taupe">{habiaAntes}</span>}
      </td>
      <td className="px-1 py-[6px] align-middle">
        <CampoContaste varianteId={id} contada={linea.contada} sugerida={linea.contada === null ? linea.anterior : null} etiqueta={etiqueta} alConfirmar={alConfirmar} alInvalido={alInvalido} alEnter={alEnter} />
      </td>
      <td className="py-[6px] pl-2 pr-3 align-middle">
        <EstadoLinea sinReserva antes={linea.anterior} sinContar={linea.aplicadaSinContar} estado={linea.estado} debeHaber={linea.debeHaber} contada={linea.contada} diferencia={linea.diferencia} />
        {nota && <p className="mt-0.5 text-[11px] leading-[15px] text-taupe">{nota}</p>}
      </td>
    </tr>
  );
});
