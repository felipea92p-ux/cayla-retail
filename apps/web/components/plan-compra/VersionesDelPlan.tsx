"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { createClient } from "@/lib/supabase/client";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { solesEnterosES } from "@/lib/plan-compra-presupuesto";
import { enteroES, type FilaPlan } from "@/lib/plan-compra-reglas";
import {
  RPC_VERSION,
  compararConHoy,
  hayCambiosSinVersion,
  leerVersionConFoto,
  notaDeLaVersion,
  numeroDeLaSiguiente,
  origenEnPalabras,
  versionDeHoy,
  type CambiosContraHoy,
  type LecturaVersiones,
  type VersionConFoto,
  type VersionDelPlan,
} from "@/lib/plan-compra-versiones";

// «Versiones del plan» (Presupuesto, spike ④): cada cambio grande del plan queda como una versión a la que se puede volver. La lista va de la más nueva a la más
// vieja; la que ES el plan de hoy lleva su marca. «Ver qué cambió» compara una versión con el plan de hoy (con lo que hay hoy en las tiendas, para que se vean decisiones y
// no ventas de por medio); «Volver a esta versión» NO borra nada: crea una versión nueva con lo que tenía la elegida (lo dice la hoja). Si el plan tiene cambios que ninguna
// versión recuerda, la lista lo dice arriba y ofrece guardarlos. La lógica (huella, comparación) es de `lib/plan-compra-versiones.ts`; esto solo la dibuja.

const fecha = (iso: string | null) => {
  if (!iso) return null;
  const { dia, hora } = diaYHoraLima(iso);
  return `${dia} · ${hora}`;
};

function Cambios({ n, cambios }: { n: number; cambios: CambiosContraHoy }) {
  if (cambios.sinCambios) return <span>Es igual al plan de hoy.</span>;
  return (
    <>
      {cambios.categorias.map((c) => (
        <span key={c.clave}>
          <b>{c.nombre}</b>:{" "}
          {c.enLaVersion === null
            ? `no estaba en la v${n} · hoy compra ${enteroES.format(c.hoy ?? 0)}`
            : c.soloSupuestos
              ? `compra lo mismo (${enteroES.format(c.hoy ?? 0)}), con otros supuestos`
              : `${enteroES.format(c.enLaVersion)} en la v${n} · ${enteroES.format(c.hoy ?? 0)} hoy`}
        </span>
      ))}
      {cambios.tope && (
        <span>
          <b>Tope</b>: {cambios.tope.enLaVersion === null ? "sin tope" : solesEnterosES(cambios.tope.enLaVersion)} en la v{n} · {cambios.tope.hoy === null ? "sin tope" : solesEnterosES(cambios.tope.hoy)} hoy
        </span>
      )}
      {cambios.precioDeLaPlata && (
        <span>
          <b>Plan con tope</b>: {cambios.precioDeLaPlata.enLaVersion !== 0 ? "sí" : "no"} en la v{n} · {cambios.precioDeLaPlata.hoy !== 0 ? "sí" : "no"} hoy
        </span>
      )}
      <span>
        Total: {solesEnterosES(cambios.inversionEnLaVersion)} en la v{n} · {solesEnterosES(cambios.inversionHoy)} hoy
      </span>
    </>
  );
}

export function VersionesDelPlan({
  lectura,
  planId,
  filas,
  tope,
  precioDeLaPlata,
  conCategorias,
  onGuardar,
  onVolver,
}: {
  lectura: LecturaVersiones;
  planId: string;
  /** Las filas de hoy, para comparar contra ellas con lo que hay en las tiendas. */
  filas: readonly FilaPlan[];
  /** El tope y el precio de la plata de hoy. */
  tope: number | null;
  precioDeLaPlata: number;
  /** El plan ya tiene categorías: sin ellas no hay nada que guardar como versión. */
  conCategorias: boolean;
  /** «Guardar una versión»: abre su hoja. */
  onGuardar: () => void;
  /** «Volver a esta versión»: abre su hoja con la foto de esa versión (ya traída). */
  onVolver: (foto: VersionConFoto) => void;
}) {
  const hoy = versionDeHoy(lectura);
  const sinVersionar = hayCambiosSinVersion(lectura, conCategorias);
  // Las fotos se traen al pedirlas (pesan): una por versión, una sola vez.
  const [fotos, setFotos] = useState<Record<number, VersionConFoto | "error">>({});
  const [trayendo, setTrayendo] = useState<number | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);

  async function traer(n: number): Promise<VersionConFoto | null> {
    const guardada = fotos[n];
    if (guardada && guardada !== "error") return guardada;
    setTrayendo(n);
    const { data, error } = await createClient().rpc(RPC_VERSION as never, { p_plan_id: planId, p_numero: n } as never);
    setTrayendo(null);
    const foto = error ? null : leerVersionConFoto(data);
    setFotos((f) => ({ ...f, [n]: foto ?? "error" }));
    return foto;
  }
  async function verQueCambio(n: number) {
    if (abierta === n) return setAbierta(null);
    setAbierta(n);
    await traer(n);
  }
  async function volver(n: number) {
    const foto = await traer(n);
    if (foto) onVolver(foto);
  }

  const fila = (v: VersionDelPlan) => {
    const esDeHoy = hoy?.numero === v.numero;
    const foto = fotos[v.numero];
    const origen = origenEnPalabras(v);
    const stats =
      v.prendas !== null || v.inversion !== null
        ? [v.prendas !== null ? `${enteroES.format(v.prendas)} prendas` : null, v.inversion !== null ? solesEnterosES(v.inversion) : null, v.precioDeLaPlata !== 0 ? "con tope" : null].filter(Boolean).join(" · ")
        : null;
    return (
      <div key={v.numero} className={`pp-ver ${esDeHoy ? "pp-ver-hoy" : ""}`} data-guia={esDeHoy ? "presupuesto.version-de-hoy" : undefined}>
        <div className="pp-ver-top">
          <b>Versión {v.numero}</b>
          {esDeHoy && <Chip tono="verde" versalitas={false}>La de hoy</Chip>}
          {origen && !notaDeLaVersion(v).startsWith(origen) && (
            <Chip tono="neutro" versalitas={false}>
              {origen}
            </Chip>
          )}
          <span className="pp-ver-q">
            {[v.por, fecha(v.en)].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="pp-ver-nota">{notaDeLaVersion(v)}</div>
        {stats && <div className="pp-ver-q">{stats}</div>}
        {!esDeHoy && (
          <div className="pp-ver-acc">
            <Boton peso="fantasma" className="btn-chico" aria-expanded={abierta === v.numero} onClick={() => void verQueCambio(v.numero)} cargando={trayendo === v.numero && abierta === v.numero ? true : undefined} textoCargando="Trayendo…">
              {abierta === v.numero ? "Ocultar cambios" : "Ver qué cambió"}
            </Boton>
            <Boton peso="fantasma" className="btn-chico" aria-haspopup="dialog" onClick={() => void volver(v.numero)}>
              Volver a esta versión {/* unificar-fijo: restaura una versión del plan, no vuelve a otra pantalla (maqueta del spike ④) */}
            </Boton>
          </div>
        )}
        {abierta === v.numero && !esDeHoy && (
          <div className="pp-dif" aria-live="polite">
            {foto === "error" ? <span>No se pudo traer esa versión. Vuelve a intentarlo.</span> : foto ? <Cambios n={v.numero} cambios={compararConHoy(foto, { precioDeLaPlata, tope, filas })} /> : <span>Trayendo la versión…</span>}
            {foto && foto !== "error" && <span className="pp-dif-pie">Con lo que hay hoy en las tiendas, para comparar decisiones y no ventas.</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card-cayla p-4 sm:px-5" data-guia="presupuesto.versiones">
      {sinVersionar && (
        <div className="pp-ver pp-ver-sin">
          <div className="pp-ver-top">
            <b>El plan de hoy</b>
            <Chip tono="ambar" versalitas={false}>
              Sin guardar como versión
            </Chip>
          </div>
          <div className="pp-ver-nota">
            {lectura.versiones.length === 0 ? "Todavía no hay ninguna versión." : `Cambió después de la versión ${lectura.versiones[0].numero}.`} Guárdalo y tendrás un punto al que volver.
          </div>
        </div>
      )}
      {lectura.versiones.length === 0 && !sinVersionar && <p className="text-sm text-tinta-60">Todavía no hay versiones: aparecen cuando guardas una o usas el plan con tope.</p>}
      {lectura.versiones.map(fila)}
      <div className="pp-ver-pie">
        <Boton peso="fantasma" className="btn-chico" aria-haspopup="dialog" disabled={!sinVersionar} title={!sinVersionar ? (conCategorias ? "El plan no cambió desde la última versión" : "El plan todavía no tiene categorías") : undefined} onClick={onGuardar}>
          {sinVersionar ? `Guardar como versión ${numeroDeLaSiguiente(lectura)}` : "Guardar una versión ahora"}
        </Boton>
      </div>
    </div>
  );
}
