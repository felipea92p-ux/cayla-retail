"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin, SelectFin } from "@/components/finanzas/kit";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { fechaCorta, mesesRecientes, textoMes } from "@/lib/gastos-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { parsearParametro, type NombreParametro } from "@/lib/impuestos-reglas";

// Configuración ▸ Impuestos: la hoja que agrega una vigencia (la tasa de IGV, el tope de la planilla de movilidad o el saldo a favor). En la base solo se agregan filas.

/** Guarda un parámetro firmado con el responsable. `listo: null` guarda sin aviso ni refresco. */
export type GuardarParametro = (nombre: NombreParametro, vigenteDesde: string, valor: number | null, texto: string | null, listo: string | null) => Promise<boolean>;

export type VigenciaNueva = "igv" | "tope_planilla_movilidad" | "saldo_favor_igv";

const HOJA: Record<VigenciaNueva, { titulo: string; subtitulo: string; etiqueta: string; ayuda: string; ejemplo: string; pendiente: string; listo: (desde: string, t: string, valor: number) => string }> = {
  igv: {
    titulo: "Nueva tasa de IGV",
    subtitulo: "Desde esa fecha, los gastos con factura calculan su IGV con esta tasa. Lo registrado antes no cambia.",
    etiqueta: "Tasa (%)",
    ayuda: "El IGV con el IPM: hoy 18.",
    ejemplo: "18", // sugerir-fijo: la tasa de IGV vigente es la misma para todo, no depende de nada elegido en la hoja
    pendiente: "Escribe la tasa en %, por ejemplo 18.",
    listo: (desde, t) => `Tasa de IGV desde el ${fechaCorta(desde, true)}: ${t.trim()} %.`,
  },
  tope_planilla_movilidad: {
    titulo: "Nuevo tope de la planilla de movilidad",
    subtitulo:
      "Desde esa fecha, lo que pase este monto por persona y por día queda «no deducible», también en las planillas ya anotadas de esos días.",
    etiqueta: "Tope por persona y día (S/)",
    ayuda: "SUNAT: el 4 % de la remuneración mínima vital. Confírmalo con el contador.",
    ejemplo: "45.20", // sugerir-fijo: el formato de un monto en soles, no depende de nada elegido en la hoja
    pendiente: "Escribe el tope en soles, por ejemplo 45.20.",
    listo: (desde, t) => `Tope de la planilla desde el ${fechaCorta(desde, true)}: S/\u00a0${Number(t.replace(",", ".")).toFixed(2)} por persona y día.`,
  },
  saldo_favor_igv: {
    titulo: "Saldo a favor de IGV",
    subtitulo:
      "Lo que CAYLA traía a favor al empezar ese mes. Ese mes el IGV parte de este monto (reemplaza lo que venía calculando) y lo de antes no cambia. Si hay uno ya declarado en ese mes, este lo corrige.",
    etiqueta: "Saldo a favor (S/)",
    ayuda: "De la última declaración: «saldo a favor del periodo anterior». Pon 0 si no traía.",
    ejemplo: "0.00", // sugerir-fijo: el formato de un monto en soles, no depende de nada elegido en la hoja
    pendiente: "Escribe el saldo en soles (0 si no traía).",
    listo: (desde, _t, valor) => `Saldo a favor de IGV al empezar ${textoMes(desde.slice(0, 7))}: S/\u00a0${valor.toFixed(2)}.`,
  },
};

export function NuevaVigenciaModal({
  nombre,
  onCerrar,
  guardar,
  guardando,
  responsable,
}: {
  nombre: VigenciaNueva;
  onCerrar: () => void;
  guardar: GuardarParametro;
  guardando: boolean;
  responsable: ReturnType<typeof useResponsable>;
}) {
  const [desdeTipeado, setDesde] = useState("");
  const [valor, setValor] = useState("");
  const h = HOJA[nombre];
  const v = parsearParametro(nombre, valor);
  // El saldo de IGV rige desde el día 1 de un mes: se elige el MES y la fecha que se guarda es su día 1.
  const esMes = nombre === "saldo_favor_igv";
  const desde = esMes && /^\d{4}-(0[1-9]|1[0-2])$/.test(desdeTipeado) ? `${desdeTipeado}-01` : esMes ? "" : desdeTipeado;
  const opcionesMes = esMes ? mesesRecientes(hoyLima(), 36).map((m) => ({ valor: m, texto: textoMes(m) })) : [];
  const fechaLista = /^\d{4}-\d{2}-\d{2}$/.test(desde);
  const listo = fechaLista && v.ok;
  // Guía de foco (ADR-0284): sale de lo mismo que habilita «Agregar».
  const guia = useGuiaCampos([
    { id: "desde", nombre: esMes ? "Mes" : "Desde", requerido: true, hecho: fechaLista, pendiente: esMes ? "Elige el mes en que CAYLA traía ese saldo." : "Elige desde qué fecha rige." },
    { id: "valor", nombre: h.etiqueta, requerido: true, hecho: v.ok, pendiente: valor && !v.ok ? v.error : h.pendiente },
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién hace el cambio." },
  ]);
  return (
    <Modal variante="hoja" titulo={h.titulo} subtitulo={h.subtitulo} onClose={onCerrar}>
      <div className="fin-dos-campos" data-guia="config.nueva-tasa-campos">
        <CampoGuiado id="desde" guia={guia}>
          <CampoFin etiqueta={esMes ? "Al empezar el mes" : "Desde"} htmlFor="vigencia-desde">
            {esMes ? (
              <SelectFin id="vigencia-desde" valor={desdeTipeado} onValor={setDesde} opciones={opcionesMes} marcador="Elige el mes…" />
            ) : (
              <InputFin id="vigencia-desde" type="date" value={desdeTipeado} onChange={(e) => setDesde(e.target.value)} />
            )}
          </CampoFin>
        </CampoGuiado>
        <CampoGuiado id="valor" guia={guia}>
          <CampoFin etiqueta={h.etiqueta} htmlFor="vigencia-valor" ayuda={valor && !v.ok ? v.error : h.ayuda} tono={valor && !v.ok ? "aviso" : undefined}>
            <InputFin id="vigencia-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={h.ejemplo} />
          </CampoFin>
        </CampoGuiado>
      </div>
      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>
      <PieGuia guia={guia} listo="Todo listo para agregar." />
      <div className="fin-botones" data-guia="config.nueva-tasa-botones">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
        <Boton peso="primario" cargando={guardando}
          type="button"
          disabled={!listo || guardando || !responsable.listo}
          onClick={async () => {
            if (!v.ok) return;
            if (await guardar(nombre, desde, v.valor, null, h.listo(desde, valor, v.valor))) onCerrar();
          }}
        >
          Agregar
        </Boton>
      </div>
    </Modal>
  );
}
