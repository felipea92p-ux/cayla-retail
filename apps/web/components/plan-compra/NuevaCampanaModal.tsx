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
import { RPC_PLAN_PROPIO, type DecisionDeCampana } from "@/lib/plan-compra-calendario";
import { RPC_CREAR_CAMPANA, argsCrearCampana, argsPlanPropio, borradorDeRanura, diferenciaConLaEtiqueta, type BorradorCampana, type EtiquetaCampana, type RanuraCalendario } from "@/lib/plan-compra-reglas";

// La hoja de «Armar el plan» de una campaña del calendario (ADR-0372, B3; act. 2026-10-12 f, Felipe: «opción A, con el mismo formato»): la campaña llega llena —su nombre del año y sus
// fechas de ese año— y un toque arma su plan. Es de Catálogo ▸ Insignias (`crear_plan_compra`) o PROPIA de tu calendario, sin insignia (`crear_plan_compra_propio`, ADR-0525). Las fechas del
// plan se pueden ajustar: una ventana de compra puede ser más ancha que la de venta («Navidad» es del 11 al 25; «Diciembre» del 1 al 31), y si difieren de las de la campaña ese año, la
// hoja lo dice. La abre quien tiene el módulo Plan de campaña (ADR-0387: en Compras el módulo es la llave; la base lo exige también). Crear una campaña NUEVA ya no pasa por aquí: se
// decide en el Calendario. Guía de foco (ADR-0284): `camposDeLaCampana` sale de la misma regla que la base.

export function NuevaCampanaModal({
  etiquetas,
  nombresEnUso,
  propias = [],
  ranura,
  onClose,
}: {
  etiquetas: readonly EtiquetaCampana[];
  nombresEnUso: readonly string[];
  /** Las campañas propias del calendario (con sus planes), para saber si la de la hoja ya tiene el de ese año. */
  propias?: readonly Pick<DecisionDeCampana, "id" | "planes">[];
  /** La campaña del calendario que se va a armar. */
  ranura: RanuraCalendario;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [b, setB] = useState<BorradorCampana>(() => borradorDeRanura(ranura));
  const [trabajando, setTrabajando] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale (chaos 2026-10-10).
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDeLaCampana(b, etiquetas, nombresEnUso, { listo: responsable.listo, motivo: responsable.motivo }, propias));
  const etiqueta = ranura.etiquetaId ? etiquetas.find((e) => e.id === ranura.etiquetaId) : undefined;
  const nota = diferenciaConLaEtiqueta(b, etiqueta);
  const nombreLimpio = b.nombre.replace(/\s+/g, " ").trim();
  const problemaDelNombre = guia.campos.find((c) => c.id === "nombre" && !c.hecho)?.pendiente ?? null;

  async function crear(cerrar: () => void) {
    if (!guia.puedeConfirmar || enviando.current) return;
    enviando.current = true;
    setTrabajando(true);
    const llamada = ranura.calendarioId
      ? createClient().rpc(RPC_PLAN_PROPIO as never, argsPlanPropio(b) as never)
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
    avisar.exito("Plan armado", { detalle: creada?.nombre ?? nombreLimpio });
    cerrar();
    router.push(creada?.id ? `/compras/plan?plan=${creada.id}` : "/compras/plan");
    router.refresh();
  }

  return (
    <Modal
      titulo={`Armar el plan de ${ranura.nombre}`}
      subtitulo={`${ranura.calendarioId ? "De tu calendario" : "De Catálogo ▸ Insignias"}, con sus fechas de ${ranura.anio}. Ajústalas si la compra necesita más días.`}
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void crear(cerrar);
          }}
          className="space-y-5"
        >
          {/* Solo se ve si mientras tanto alguien le armó el plan de ese año a esta campaña (o la quitó del calendario): la guía lo pide como «Campaña». */}
          {guia.campos.some((c) => c.id === "etiqueta") && (
            <CampoGuiado id="etiqueta" guia={guia} titulo="Campaña">
              <Aviso tono="atencion" chico>
                {guia.campos.find((c) => c.id === "etiqueta")?.pendiente}
              </Aviso>
            </CampoGuiado>
          )}
          <CampoGuiado id="nombre" guia={guia} titulo="Nombre del plan" ayuda="Como se verá en el selector">
            <CampoTexto
              etiqueta={<span className="sr-only">Nombre del plan</span>}
              caja
              value={b.nombre}
              onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))}
              // Lo que choca (ya hay un plan con ese nombre) se dice bajo el campo; un nombre vacío solo lo pide la guía.
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
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo="Todo listo para armar el plan." />
            <div className="pie-acciones pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={trabajando} disabled={!guia.puedeConfirmar} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                Armar plan
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
