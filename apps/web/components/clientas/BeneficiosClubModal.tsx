"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { guardarBeneficiosClub } from "@/lib/club-avisos-acciones";
import { camposDeBeneficios } from "@/lib/club-beneficios-guia";
import {
  ANIOS_ESCALA,
  beneficiosDelBorrador,
  borradorDe,
  cambiosDeBeneficios,
  problemasBeneficios,
  type BeneficiosClub,
  type BorradorBeneficios,
} from "@/lib/club-beneficios-reglas";

// «Beneficios del club» (ADR-0288, «Actualización 2026-10-01 (g)», G-13; contrato de la tanda 1g, función 9): solo el LÍDER. Lo
// que se ajusta sin deploy: el % del cupón de cumpleaños, cuándo cuenta un año de club para el aniversario (6 compras o S/ 600 en
// compras netas, propuesto), en cuántos días se usa el vale y el vale de cada año (el del quinto se repite). Vivía como la pestaña
// «Beneficios» de Clientas en el spike del club; aquí es una hoja que se abre desde Clientas ▸ Avisos, la pantalla del club, porque
// son cinco números que se tocan pocas veces al año y no justifican una pantalla ni un módulo propios.
//
// Abre con lo VIGENTE (lo que lee la página pública del cartel, `fn_club_pagina`): si no se pudo leer, no hay formulario —un
// formulario con valores inventados los guardaría encima de los reales—. Guía de foco con la misma regla que apaga «Guardar»
// (`lib/club-beneficios-guia.ts`, probada contra `problemasBeneficios`).

const ID = { pct: "beneficios-pct", compras: "beneficios-compras", monto: "beneficios-monto", dias: "beneficios-dias", escala: "beneficios-escala-1" } as const;
const CAJA_INPUT = "h-10 w-full min-w-0 bg-transparent px-0.5 text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/55";

export function BeneficiosClubModal({
  lectura,
  onClose,
  onGuardado,
}: {
  lectura: { valores: BeneficiosClub | null; falla: string | null };
  onClose: () => void;
  onGuardado: () => void;
}) {
  return (
    <Modal
      titulo="Beneficios del club"
      subtitulo="El cupón de cumpleaños y el vale de aniversario de cada socia, para las 3 tiendas."
      onClose={onClose}
      variante="hoja"
      ancho="max-w-lg"
    >
      {(cerrar) =>
        lectura.valores ? (
          <FormularioBeneficios vigentes={lectura.valores} cerrar={cerrar} onGuardado={onGuardado} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-rojo-profundo">{lectura.falla ?? "No se pudieron leer los beneficios vigentes del club."}</p>
            <p className="text-sm text-tinta/70">Sin lo vigente no se puede editar: se guardaría encima de valores que no se ven.</p>
            <div className="flex justify-end">
              <Boton type="button" onClick={cerrar}>
                Cerrar
              </Boton>
            </div>
          </div>
        )
      }
    </Modal>
  );
}

function FormularioBeneficios({ vigentes, cerrar, onGuardado }: { vigentes: BeneficiosClub; cerrar: () => void; onGuardado: () => void }) {
  const [borrador, setBorrador] = useState<BorradorBeneficios>(() => borradorDe(vigentes));
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposDeBeneficios(borrador, responsable.listo));
  const problemas = problemasBeneficios(borrador);
  const nuevos = beneficiosDelBorrador(borrador);
  const cambios = nuevos ? cambiosDeBeneficios(vigentes, nuevos) : [];
  const sinCambios = nuevos !== null && cambios.length === 0;

  const poner = (campo: Exclude<keyof BorradorBeneficios, "escala">) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBorrador((b) => ({ ...b, [campo]: e.target.value }));
  const ponerAnio = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBorrador((b) => ({ ...b, escala: b.escala.map((v, j) => (j === i ? e.target.value : v)) }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevos) {
      const primero = (Object.keys(ID) as (keyof typeof ID)[]).find((k) => problemas[k] !== null);
      if (primero) avisar.error(problemas[primero]!, { enfocar: ID[primero] });
      return;
    }
    if (sinCambios) {
      avisar.aviso("No cambiaste ningún beneficio.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await guardarBeneficiosClub(nuevos, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "guardar los beneficios del club"));
      return;
    }
    avisar.exito("Beneficios del club guardados", { detalle: "Los términos del club tienen una versión nueva." });
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="space-y-6">
      <p className="nota-cayla">
        <b>Cambiar un beneficio publica una versión nueva de los términos.</b> Las compras en que ya se canjeó un cupón o un vale no
        cambian.
      </p>

      <CampoGuiado id="pct" guia={guia} titulo="Cupón de cumpleaños" ayuda="Un canje en su mes, sobre toda la compra">
        <Caja id={ID.pct} etiqueta="Porcentaje de descuento del cumpleaños" valor={borrador.pct} onChange={poner("pct")} decimal fin="%" disabled={guardando} />
      </CampoGuiado>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-[13px] font-semibold text-tinta">Un año de club cuenta para el aniversario con…</legend>
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <CampoGuiado id="compras" guia={guia} titulo="Compras en el año">
            <Caja id={ID.compras} etiqueta="Compras netas en el año de club" valor={borrador.compras} onChange={poner("compras")} fin="compras" disabled={guardando} />
          </CampoGuiado>
          <CampoGuiado id="monto" guia={guia} titulo="O monto en el año">
            <Caja id={ID.monto} etiqueta="Monto en compras netas en el año de club" valor={borrador.monto} onChange={poner("monto")} decimal inicio="S/" disabled={guardando} />
          </CampoGuiado>
        </div>
        <p className="text-xs text-taupe">Basta una de las dos. Si un año no llega, su aniversario se pausa: no pierde lo acumulado.</p>
      </fieldset>

      <CampoGuiado id="dias" guia={guia} titulo="Días para usar el vale" ayuda="Desde su aniversario en el club">
        <Caja id={ID.dias} etiqueta="Días para usar el vale de aniversario" valor={borrador.dias} onChange={poner("dias")} fin="días" disabled={guardando} />
      </CampoGuiado>

      <CampoGuiado id="escala" guia={guia} titulo="Vale de aniversario de cada año" ayuda="En soles, para comprar en toda la tienda">
        <div className="grid grid-cols-5 gap-2 max-sm:grid-cols-3">
          {Array.from({ length: ANIOS_ESCALA }, (_, i) => (
            <label key={i} className="block min-w-0">
              <span className="mb-1 block text-[11px] text-taupe">{i === ANIOS_ESCALA - 1 ? `Año ${i + 1} y más` : `Año ${i + 1}`}</span>
              <span className="caja-cayla flex items-center gap-1 px-2.5">
                <span className="text-xs text-taupe" aria-hidden>
                  S/
                </span>
                <input
                  id={i === 0 ? ID.escala : undefined}
                  aria-label={i === ANIOS_ESCALA - 1 ? `Vale del año ${i + 1} en adelante, en soles` : `Vale del año ${i + 1}, en soles`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={borrador.escala[i] ?? ""}
                  onChange={ponerAnio(i)}
                  disabled={guardando}
                  className={CAJA_INPUT}
                />
              </span>
            </label>
          ))}
        </div>
      </CampoGuiado>

      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>

      {cambios.length > 0 && (
        <div className="rounded-lg border border-sand px-4 py-3">
          <p className="text-[13px] font-semibold text-tinta">Cambias</p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-tinta/75">
            {cambios.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <PieGuia guia={guia} listo={sinCambios ? "Todo en orden. Cambia un valor para guardar." : "Todo listo para guardar."} />

      <div className="pie-hoja-fijo">
        <div className="flex justify-end gap-3 pt-2">
          <Boton type="button" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            type="submit"
            peso="primario"
            cargando={guardando}
            disabled={!guia.puedeConfirmar || sinCambios}
            title={responsable.motivo ?? guia.frase ?? (sinCambios ? "No cambiaste ningún beneficio." : undefined)}
            className={sinCambios ? "" : guia.claseConfirmar}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </div>
      </div>
    </form>
  );
}

/** Una caja de número con su unidad al lado («%», «S/», «días»): la unidad no se escribe, se lee. */
function Caja({
  id,
  etiqueta,
  valor,
  onChange,
  decimal = false,
  inicio,
  fin,
  disabled,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  decimal?: boolean;
  inicio?: ReactNode;
  fin?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <span className="caja-cayla flex items-center gap-1.5 px-3">
      {inicio && (
        <span className="text-xs text-taupe" aria-hidden>
          {inicio}
        </span>
      )}
      <input id={id} aria-label={etiqueta} inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" value={valor} onChange={onChange} disabled={disabled} className={CAJA_INPUT} />
      {fin && (
        <span className="shrink-0 text-xs text-taupe" aria-hidden>
          {fin}
        </span>
      )}
    </span>
  );
}
