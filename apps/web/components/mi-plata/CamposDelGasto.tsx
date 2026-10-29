"use client";

import { ICONO_GASTO } from "./iconos";
import { TarjetaFoto } from "./TarjetaFoto";
import { CampoMonto, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CONCEPTOS_GASTO, type ConceptoGasto } from "@/lib/mi-plata-reglas";

// Los campos de un gasto que no es ropa: en qué gastó (con «Otro», qué fue), cuánto y la foto del papel. Son los de «Gasté en otra cosa»
// (ADR-0480) y los de corregirlo (ADR-0572): una sola pieza, para que anotar y corregir se vean y se sientan igual (ADR-0358). En PC, dos
// columnas (¿en qué gastaste? a la izquierda; cuánto y la foto, a la derecha); en el celular las cajas «desaparecen» (`contents`).

export function CamposDelGasto({
  guia,
  concepto,
  nota,
  monto,
  archivo,
  guardando,
  yaTieneFoto = false,
  alConcepto,
  alNota,
  alMonto,
  alArchivo,
}: {
  guia: GuiaCampos;
  concepto: ConceptoGasto | null;
  nota: string;
  monto: string;
  archivo: File | null;
  guardando: boolean;
  /** Al corregir: el gasto ya tiene su foto; elegir otra la cambia. */
  yaTieneFoto?: boolean;
  alConcepto: (c: ConceptoGasto) => void;
  alNota: (t: string) => void;
  alMonto: (t: string) => void;
  alArchivo: (f: File | null) => void;
}) {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <CampoGuiado id="concepto" guia={guia} titulo="¿En qué gastaste?">
          <div role="group" aria-label="¿En qué gastaste?" className="grid grid-cols-3 gap-2" data-guia="mi-plata.concepto">
            {(Object.keys(CONCEPTOS_GASTO) as ConceptoGasto[]).map((k) => {
              const Icono = ICONO_GASTO[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={concepto === k}
                  title={CONCEPTOS_GASTO[k].ejemplo}
                  disabled={guardando}
                  onClick={() => alConcepto(k)}
                  className={`card-cayla mov-boton flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-[14px] p-2 text-center text-sm text-tinta ${concepto === k ? "border-tinta bg-sand/40" : ""}`}
                >
                  <Icono className="h-5 w-5" aria-hidden />
                  {CONCEPTOS_GASTO[k].nombre}
                </button>
              );
            })}
          </div>
        </CampoGuiado>
        {concepto === "otro" && (
          <CampoGuiado id="nota" guia={guia} titulo="¿Qué fue?">
            <CampoTexto etiqueta="¿Qué fue?" caja autoComplete="off" maxLength={120} value={nota} disabled={guardando} onChange={(e) => alNota(e.target.value)} />
          </CampoGuiado>
        )}
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto fue?">
          <CampoMonto
            etiqueta="¿Cuánto fue?"
            etiquetaOculta
            data-guia="mi-plata.monto-gasto"
            inputMode="decimal"
            autoComplete="off"
            value={monto}
            disabled={guardando}
            onChange={(e) => alMonto(e.target.value)}
          />
        </CampoGuiado>
        <CampoGuiado id="foto" guia={guia} titulo="Foto del papel" ayuda="· opcional">
          <TarjetaFoto
            titulo={yaTieneFoto ? "Cambiar la foto del papel" : "Foto del papel, si te dieron"}
            ayuda={yaTieneFoto ? "Ya tiene una foto: si eliges otra, la reemplaza" : "Un taxi o un cargador pueden ir sin papel"}
            archivo={archivo}
            deshabilitada={guardando}
            onArchivo={alArchivo}
          />
        </CampoGuiado>
      </div>
    </div>
  );
}
