"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Casilla } from "@/components/ui/Casilla";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin, RadiosFin } from "@/components/finanzas/kit";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { TEXTO_MEDIO_COBRO, mediosDeMaquina, textoTarifa, validarTarifa, type BorradorTarifa, type MaquinaPos, type MedioCobro } from "@/lib/cuentas-dinero-reglas";

// Configuración ▸ Cuentas y cobros ▸ «Cambiar la tarifa» de una máquina de cobro (ADR-0429, act. 4). La tarifa SOLO estima y avisa:
// con ella, cada día pendiente de depósito dice la comisión esperada y el ERP avisa cuando la máquina se atrasa. La comisión real
// sale siempre del depósito (actividad 3). Se cambia desde hoy: lo pasado se estima con la tarifa que regía ese día.
// Guía de foco (ADR-0284): «falta» es lo mismo que apaga «Guardar» (`validarTarifa` y el responsable); el cargo fijo es opcional.

const ID_TASA = "tarifa-tasa";
const ID_FIJO = "tarifa-fijo";
const ID_DIAS = "tarifa-dias";

export function TarifaMaquinaModal({ maquina, medioInicial, onCerrar }: { maquina: MaquinaPos; medioInicial?: MedioCobro; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const medios = mediosDeMaquina(maquina);
  const primero = medios.find((m) => m.medio === medioInicial) ?? medios[0];
  const [b, setB] = useState<BorradorTarifa>(() => deBorrador(primero?.medio ?? "tarjeta", primero?.tarifa ?? null));
  const [guardando, setGuardando] = useState(false);
  const cambiar = (c: Partial<BorradorTarifa>) => setB((x) => ({ ...x, ...c }));
  const elegirMedio = (medio: MedioCobro) => setB(deBorrador(medio, medios.find((m) => m.medio === medio)?.tarifa ?? null));
  const vigente = medios.find((m) => m.medio === b.medio)?.tarifa ?? null;

  const v = validarTarifa(b, maquina.id);
  const tasaOk = b.tasa.trim() !== "" && (v.ok || !v.error.startsWith("Tasa") && !v.error.startsWith("La tasa"));
  const diasOk = /^\d{1,2}$/.test(b.diasAbono.trim()) && Number(b.diasAbono) <= 15;
  const campos: CampoDeGuia[] = [
    { id: ID_TASA, nombre: "Tasa", requerido: true, hecho: tasaOk, pendiente: "Escribe la tasa que descuenta la máquina, en %; si no cobra, 0." },
    { id: ID_FIJO, nombre: "Cargo fijo", requerido: false, sugerido: false, hecho: b.cargoFijo.trim() !== "", pendiente: "Si cobra un fijo por cada pago, escríbelo." },
    { id: ID_DIAS, nombre: "Días de abono", requerido: true, hecho: diasOk, pendiente: "En cuántos días hábiles deposita (1 a 3, según la tarjeta)." },
    { id: "responsable", nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién hace el cambio." },
  ];
  const guia = useGuiaCampos(campos);

  async function guardar() {
    if (!v.ok) return avisar.error(v.error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("guardar_pos_tarifa" as never, v.valor as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "cambiar la tarifa"));
    avisar.exito(`Tarifa de ${maquina.nombre} guardada`, { detalle: "Desde hoy, lo pendiente de depósito dice su comisión esperada con esta tarifa. La real sigue saliendo del depósito." });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      variante="hoja"
      titulo={`Tarifa de ${maquina.nombre}`}
      subtitulo="Solo para estimar y avisar: la comisión real sale de cada depósito. Cambia desde hoy; lo pasado queda con la tarifa que regía."
      onClose={onCerrar}
      tamano="mediana"
    >
      {medios.length > 1 && (
        <div data-sin-cascada>
          <CampoFin etiqueta="De qué medio">
            <RadiosFin<MedioCobro> nombre="tarifa-medio" etiqueta="De qué medio es la tarifa" valor={b.medio} onValor={elegirMedio} opciones={medios.map((m) => ({ valor: m.medio, texto: TEXTO_MEDIO_COBRO[m.medio] }))} />
          </CampoFin>
        </div>
      )}
      <p className="nota-cayla mb-4">Hoy: {textoTarifa(vigente)}.</p>

      <div className="fin-dos-campos">
        <CampoGuiado id={ID_TASA} guia={guia}>
          <CampoFin etiqueta={guia.etiqueta(ID_TASA, "Tasa (%)")} htmlFor={ID_TASA} ayuda="Lo que la máquina descuenta de cada pago.">
            <InputFin id={ID_TASA} inputMode="decimal" value={b.tasa} onChange={(e) => cambiar({ tasa: e.target.value })} placeholder="3.50" /* sugerir-fijo: el formato de un porcentaje con dos decimales, no depende de nada elegido */ />
          </CampoFin>
        </CampoGuiado>
        <CampoGuiado id={ID_FIJO} guia={guia}>
          <CampoFin etiqueta={guia.etiqueta(ID_FIJO, "Cargo fijo por pago (S/)")} htmlFor={ID_FIJO} ayuda="Si no cobra uno, déjalo vacío.">
            <InputFin id={ID_FIJO} inputMode="decimal" value={b.cargoFijo} onChange={(e) => cambiar({ cargoFijo: e.target.value })} placeholder="0.00" /* sugerir-fijo: el formato de un monto en soles, no depende de nada elegido */ />
          </CampoFin>
        </CampoGuiado>
      </div>
      <div className="fin-dos-campos">
        <CampoGuiado id={ID_DIAS} guia={guia}>
          <CampoFin etiqueta={guia.etiqueta(ID_DIAS, "Deposita en (días hábiles)")} htmlFor={ID_DIAS} ayuda="Pasado ese plazo, el día queda «atrasado» y Cuentas y dinero avisa.">
            <InputFin id={ID_DIAS} inputMode="numeric" value={b.diasAbono} onChange={(e) => cambiar({ diasAbono: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="2" /* sugerir-fijo: un número de días, no depende de nada elegido */ />
          </CampoFin>
        </CampoGuiado>
        <CampoFin etiqueta="IGV">
          <div className="flex min-h-10 items-center">
            <Casilla marcada={b.igvSobreTasa} onCambio={() => cambiar({ igvSobreTasa: !b.igvSobreTasa })} etiqueta="La tasa lleva IGV" />
            <span className="ml-2 text-[13px] text-tinta">La tasa lleva IGV</span>
          </div>
        </CampoFin>
      </div>

      <CampoGuiado id="responsable" guia={guia}>
        <div>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </CampoGuiado>
      <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-3">
        <PieGuia guia={guia} listo="Todo listo para guardar." />
        <div className="ml-auto pie-acciones">
          <Boton type="button" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton peso="primario" cargando={guardando} textoCargando="Guardando…" type="button" onClick={guardar} disabled={guardando || !v.ok || !responsable.listo}>
            Guardar
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

/** El borrador arranca con la tarifa vigente de ese medio (o vacío, con IGV marcado, que es lo usual en Perú). */
function deBorrador(medio: MedioCobro, t: { tasaPct: number; igvSobreTasa: boolean; cargoFijo: number; diasAbono: number } | null): BorradorTarifa {
  return {
    medio,
    tasa: t ? String(t.tasaPct) : "",
    igvSobreTasa: t ? t.igvSobreTasa : true,
    cargoFijo: t && t.cargoFijo > 0 ? t.cargoFijo.toFixed(2) : "",
    diasAbono: t ? String(t.diasAbono) : "",
  };
}
