"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { camposDeLaCampana } from "@/lib/plan-compra-guia";
import {
  RPC_CAMPANA_NUEVA,
  RPC_CREAR_CAMPANA,
  argsCampanaNueva,
  argsCrearCampana,
  borradorDeRanura,
  borradorNuevo,
  diferenciaConLaEtiqueta,
  fechaCortaES,
  nombreDelPlanNuevo,
  type BorradorCampana,
  type EtiquetaCampana,
  type RanuraCalendario,
} from "@/lib/plan-compra-reglas";

// La hoja de una campaña del plan (ADR-0372, B3; act. 2026-10-12 f, Felipe: «opción A, con el mismo formato»). Tiene dos caras:
//   · Una campaña del CALENDARIO (la tocaste en el selector): llega llena —su nombre del año y sus fechas de ese año— y un toque arma el plan
//     (`crear_plan_compra`). Las fechas del plan se pueden ajustar: una ventana de compra puede ser más ancha que la de venta («Navidad» es del
//     11 al 25; «Diciembre» del 1 al 31), y si difieren de las de la campaña ese año, la hoja lo dice. La abre quien tiene el módulo Plan de
//     campaña (ADR-0387: en Compras el módulo es la llave; la base lo exige también).
//   · Una campaña NUEVA (no está en Etiquetas): nombre y fechas. Se crea en Catálogo ▸ Etiquetas con el formato de las demás —«Campaña y
//     festividad», su ícono por el nombre, sus fechas, aprobada, sin descuento— y con su plan, en una transacción (`crear_campana_con_plan`).
//     Esta sigue siendo solo de un líder: escribe en Etiquetas, no solo en Compras (la base lo exige también).
// Guía de foco (ADR-0284): `camposDeLaCampana` sale de la misma regla que la base.

export function NuevaCampanaModal({
  etiquetas,
  nombresEnUso,
  ranura,
  onClose,
}: {
  etiquetas: readonly EtiquetaCampana[];
  nombresEnUso: readonly string[];
  /** La campaña del calendario que se va a armar; sin ella, una campaña nueva. */
  ranura: RanuraCalendario | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [b, setB] = useState<BorradorCampana>(() => (ranura ? borradorDeRanura(ranura) : borradorNuevo()));
  const [trabajando, setTrabajando] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale (chaos 2026-10-10).
  const enviando = useRef(false);
  const nueva = ranura === null;
  const guia = useGuiaCampos(camposDeLaCampana(b, etiquetas, nombresEnUso, { listo: responsable.listo, motivo: responsable.motivo }));
  const etiqueta = ranura ? etiquetas.find((e) => e.id === ranura.etiquetaId) : undefined;
  const nota = diferenciaConLaEtiqueta(b, etiqueta);
  const nombreLimpio = b.nombre.replace(/\s+/g, " ").trim();
  const problemaDelNombre = guia.campos.find((c) => c.id === "nombre" && !c.hecho)?.pendiente ?? null;
  const conFechas = /^\d{4}-\d{2}-\d{2}$/.test(b.desde) && /^\d{4}-\d{2}-\d{2}$/.test(b.hasta) && b.desde <= b.hasta;

  async function crear(cerrar: () => void) {
    if (!guia.puedeConfirmar || enviando.current) return;
    enviando.current = true;
    setTrabajando(true);
    const llamada = nueva
      ? createClient().rpc(RPC_CAMPANA_NUEVA as never, argsCampanaNueva(b) as never)
      : createClient().rpc(RPC_CREAR_CAMPANA as never, argsCrearCampana(b) as never);
    const { data, error } = await firmar(llamada, responsable.firma());
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    if (error) {
      // Puede que SÍ se haya creado (se cortó la red después de guardar) u otra persona la creó recién: se vuelven a leer las campañas, así el
      // selector la muestra y esta hoja dice que esa campaña ya tiene su plan (chaos 2026-10-10: decía «No se guardó nada»).
      router.refresh();
      if (esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras creabas la campaña: puede que se haya creado. Mírala en el selector antes de volver a intentarlo.");
      return void avisar.error(traducirError(error, "crear la campaña"));
    }
    const creada = data as { id?: string; nombre?: string } | null;
    avisar.exito(nueva ? "Campaña creada en Etiquetas, con su plan" : "Plan armado", { detalle: creada?.nombre ?? nombreLimpio });
    cerrar();
    router.push(creada?.id ? `/compras/plan?plan=${creada.id}` : "/compras/plan");
    router.refresh();
  }

  return (
    <Modal
      titulo={nueva ? "Campaña nueva" : `Armar el plan de ${ranura.nombre}`}
      subtitulo={
        nueva
          ? "Una fecha que no está en el calendario. Queda en Catálogo ▸ Etiquetas como las demás y vuelve cada año."
          : `De Catálogo ▸ Etiquetas, con sus fechas de ${ranura.anio}. Ajústalas si la compra necesita más días.`
      }
      onClose={onClose}
      variante="hoja"
      ancho="max-w-lg"
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void crear(cerrar);
          }}
          className="space-y-5"
        >
          {/* Solo se ve si mientras tanto alguien le armó el plan de ese año a esta campaña: la guía lo pide como «Campaña». */}
          {!nueva && guia.campos.some((c) => c.id === "etiqueta") && (
            <CampoGuiado id="etiqueta" guia={guia} titulo="Campaña">
              <Aviso tono="atencion" chico>
                {guia.campos.find((c) => c.id === "etiqueta")?.pendiente}
              </Aviso>
            </CampoGuiado>
          )}
          <CampoGuiado id="nombre" guia={guia} titulo={nueva ? "Nombre de la campaña" : "Nombre del plan"} ayuda={nueva ? "Como saldrá en Etiquetas" : "Como se verá en el selector"}>
            <CampoTexto
              etiqueta={<span className="sr-only">{nueva ? "Nombre de la campaña" : "Nombre del plan"}</span>}
              caja
              value={b.nombre}
              onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))}
              autoFocus={nueva}
              // Lo que choca (ya está en el calendario, o su plan ya existe) se dice bajo el campo; un nombre vacío solo lo pide la guía.
              {...(nombreLimpio && problemaDelNombre ? { tono: "error" as const, pie: problemaDelNombre } : {})}
            />
          </CampoGuiado>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoGuiado id="desde" guia={guia} titulo="Desde">
              <CampoFecha etiqueta={<span className="sr-only">Desde</span>} caja estricto valor={b.desde} onValor={(iso) => setB((x) => ({ ...x, desde: iso }))} />
            </CampoGuiado>
            <CampoGuiado id="hasta" guia={guia} titulo="Hasta">
              <CampoFecha etiqueta={<span className="sr-only">Hasta</span>} caja estricto valor={b.hasta} onValor={(iso) => setB((x) => ({ ...x, hasta: iso }))} />
            </CampoGuiado>
          </div>
          {nota && <p className="nota-cayla">{nota}</p>}
          {/* Lo que va a quedar, antes de crearlo: la campaña en Etiquetas (con su formato) y su plan. Sin descuento: no cambia ningún precio. */}
          {nueva && nombreLimpio && conFechas && !guia.campos.find((c) => c.id === "nombre" && !c.hecho) && (
            <Aviso tono="info" chico titulo="Esto es lo que se crea">
              <span className="block">
                <b className="font-semibold">En Catálogo ▸ Etiquetas:</b> «{nombreLimpio}», en «Campaña y festividad», del {fechaCortaES(b.desde)} al {fechaCortaES(b.hasta)}, aprobada y
                sin descuento: no cambia ningún precio.
              </span>
              <span className="mt-1 block">
                <b className="font-semibold">En el Plan:</b> «{nombreDelPlanNuevo(b)}», lista para armar. El año que viene vuelve sola al calendario.
              </span>
            </Aviso>
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo={nueva ? "Todo listo para crear." : "Todo listo para armar el plan."} />
            <div className="pie-acciones pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={trabajando} disabled={!guia.puedeConfirmar} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                {nueva ? "Crear campaña y su plan" : "Armar plan"}
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
