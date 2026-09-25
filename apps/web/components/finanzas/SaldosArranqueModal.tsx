"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  arranquePropuesto,
  cambiosDelSistema,
  cuadreArranque,
  ladoDeCuenta,
  leerMontoArranque,
  leerPropuesta,
  lineasParaRegistrar,
  nombreDeCuenta,
  solesBalance,
  tituloCorte,
  valoresIniciales,
  type LineaPropuesta,
  type SaldoInicial,
} from "@/lib/balance-reglas";

// Los saldos de arranque (ADR-0195 F7, ADR-0198): lo que CAYLA tenía al empezar el día de arranque. El spike no dice dónde
// se cargan; viven aquí, en el propio Balance, en un modal hoja. La primera vez: lo que el sistema ya sabe viene calculado
// (y no se toca) y el líder escribe lo que solo él sabe (del contador y del banco). Solo se registra si cuadra: el capital
// se escribe, nunca se calcula. Después, cada cambio es una CORRECCIÓN: una fila nueva con motivo (nada se edita ni se
// borra), y el modal avisa cuando lo que el sistema calcula hoy para ese día ya no es lo registrado.

/** Los montos como texto de casilla (el cero, vacío: se ve el «0» gris y se escribe encima). */
const comoTexto = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, n]) => [k, n === 0 ? "" : String(n)]));

const LADOS = [
  { lado: "tiene", titulo: "Lo que tenía" },
  { lado: "debe", titulo: "Lo que debía" },
  { lado: "tuyo", titulo: "Lo que era tuyo" },
] as const;

export function SaldosArranqueModal({
  hoy,
  arranque,
  saldos,
  propuestaInicial,
  onCerrar,
}: {
  hoy: string;
  arranque: string | null;
  saldos: SaldoInicial[];
  /** La propuesta ya leída para el día de arranque (opcional): así el modal no la vuelve a pedir al abrirse. */
  propuestaInicial?: LineaPropuesta[] | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const hayArranque = arranque != null;
  const fechaInicial = arranque ?? arranquePropuesto(hoy);
  const [fecha, setFecha] = useState(fechaInicial);
  // Lo que el sistema sabe, por día (la primera vez se puede cambiar el día: cada uno se pide una sola vez).
  const [cargadas, setCargadas] = useState<Record<string, LineaPropuesta[]>>(() => (propuestaInicial ? { [fechaInicial]: propuestaInicial } : {}));
  const [fallas, setFallas] = useState<Record<string, string>>({});
  const [valores, setValores] = useState<Record<string, string>>(() => (propuestaInicial ? comoTexto(valoresIniciales(propuestaInicial, hayArranque)) : {}));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const propuesta = cargadas[fecha] ?? null;
  const falla = fallas[fecha] ?? null;

  useEffect(() => {
    if (cargadas[fecha] || fallas[fecha]) return;
    let vigente = true;
    createClient()
      .rpc("fn_saldos_iniciales_propuesta" as never, { p_fecha: fecha } as never)
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setFallas((f) => ({ ...f, [fecha]: `No se pudo calcular lo que había ese día: ${error.message}` }));
          return;
        }
        const filas = ((data ?? []) as Record<string, unknown>[]).map(leerPropuesta);
        setCargadas((c) => ({ ...c, [fecha]: filas }));
        // Lo que el líder ya escribió se respeta aunque cambie el día.
        setValores((v) => ({ ...comoTexto(valoresIniciales(filas, hayArranque)), ...v }));
      });
    return () => {
      vigente = false;
    };
  }, [fecha, cargadas, fallas, hayArranque]);

  const numeros = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of propuesta ?? []) {
      const editable = hayArranque || p.origen === "manual";
      const v = editable ? leerMontoArranque(valores[p.cuenta] ?? "") : p.monto;
      out[p.cuenta] = v ?? NaN;
    }
    return out;
  }, [propuesta, valores, hayArranque]);
  const invalidas = Object.entries(numeros).filter(([, v]) => Number.isNaN(v));
  const cuadre = cuadreArranque((propuesta ?? []).map((p) => ({ cuenta: p.cuenta, tipo: p.tipo, monto: Number.isNaN(numeros[p.cuenta]) ? 0 : numeros[p.cuenta] })));
  const lineas = propuesta ? lineasParaRegistrar(propuesta, numeros, hayArranque) : [];
  const cambios = propuesta ? cambiosDelSistema(propuesta) : [];
  const correcciones = saldos.filter((s) => s.motivo).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  const puedeGuardar =
    !!propuesta && !guardando && invalidas.length === 0 && cuadre.cuadra && lineas.length > 0 && (!hayArranque || motivo.trim().length >= 5);

  async function guardar() {
    if (!propuesta) return;
    if (invalidas.length) return avisar.error("Hay un monto que no es un número.");
    if (!cuadre.cuadra) return avisar.error("Todavía no cuadra: revisa el capital y las utilidades acumuladas con el contador.");
    if (hayArranque && motivo.trim().length < 5) return avisar.error("Di por qué se corrige.");
    if (!lineas.length) return avisar.error(hayArranque ? "No cambiaste nada." : "No hay nada que registrar.");
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc(
        "registrar_saldo_inicial" as never,
        { p_fecha: fecha, p_lineas: lineas, p_motivo: hayArranque ? motivo.trim() : null } as never,
      ),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, hayArranque ? "corregir los saldos de arranque" : "registrar los saldos de arranque"));
    avisar.exito(hayArranque ? "Saldos de arranque corregidos" : "Saldos de arranque registrados", {
      detalle: hayArranque ? "La fila anterior queda a la vista, con tu motivo." : "Desde ahora el Balance parte de aquí.",
    });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      variante="hoja"
      titulo={hayArranque ? "Corregir los saldos de arranque" : "Saldos de arranque"}
      subtitulo={
        hayArranque
          ? `Lo que CAYLA tenía al empezar el ${tituloCorte(arranque!, hoy).replace(/^(Al|Hoy,) /, "")}. Cada corrección queda escrita con su motivo; lo anterior no se borra.`
          : "Lo que CAYLA tenía el día que empezó a usar el sistema. Lo que el sistema ya sabe viene calculado; el resto lo pones tú, con el contador. Se registra una vez."
      }
      onClose={onCerrar}
      ancho="max-w-[680px]"
    >
      {!hayArranque && (
        <CampoFin
          etiqueta="Día de arranque"
          htmlFor="arr-fecha"
          ayuda="Los saldos son los de ese día al abrir, antes de vender. Lo ideal: el primer día de un mes, con el balance que te dé el contador al cierre del anterior."
        >
          <InputFin id="arr-fecha" type="date" max={hoy} value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </CampoFin>
      )}

      {falla && <p className="card-cayla border-dashed px-4 py-3 text-sm text-tinta/75">{falla}</p>}
      {!propuesta && !falla && <p className="py-6 text-center text-sm text-taupe">Calculando lo que había ese día…</p>}

      {propuesta && (
        <>
          {cambios.length > 0 && (
            <p className="fin-franja mt-0 mb-4">
              <b>Cambió lo que había al arrancar:</b> algo se registró o se anuló con fecha anterior al arranque. El sistema calcula hoy
              otra cifra para {cambios.map((c) => nombreDeCuenta(c.cuenta, c.nombre).toLowerCase()).join(", ")}.
              Si la aceptas, ajusta también lo que era tuyo para que siga cuadrando.
            </p>
          )}
          {LADOS.map(({ lado, titulo }) => {
            const filas = propuesta.filter((p) => ladoDeCuenta(p.cuenta, p.tipo) === lado);
            if (!filas.length) return null;
            return (
              <div key={lado} className="fin-arranque-grupo">
                <h4>{titulo}</h4>
                {filas.map((p) => {
                  const editable = hayArranque || p.origen === "manual";
                  const cambio = hayArranque && p.origen === "sistema" && p.vigente != null && Math.abs(p.monto - p.vigente) >= 0.005;
                  return (
                    <div key={p.cuenta} className="fin-arranque-linea">
                      <span>{p.cuenta}</span>
                      <div className="min-w-0">
                        {nombreDeCuenta(p.cuenta, p.nombre)}
                        <small>{p.origen === "sistema" ? `Lo calcula el sistema. ${p.detalle}` : p.detalle}</small>
                        {cambio && (
                          <small data-tono="aviso">
                            Hoy el sistema calcula {solesBalance(p.monto)}.{" "}
                            <button type="button" className="btn-enlace" onClick={() => setValores((v) => ({ ...v, [p.cuenta]: String(p.monto) }))}>
                              Usar esta cifra
                            </button>
                          </small>
                        )}
                      </div>
                      {editable ? (
                        <InputFin
                          inputMode="decimal"
                          aria-label={p.nombre}
                          value={valores[p.cuenta] ?? ""}
                          placeholder="0"
                          onChange={(e) => setValores((v) => ({ ...v, [p.cuenta]: e.target.value }))}
                          aria-invalid={Number.isNaN(numeros[p.cuenta])}
                        />
                      ) : (
                        <output className="pr-3 text-right font-medium">{solesBalance(p.monto)}</output>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="fin-arranque-cuadre" role="status">
            <span>
              Lo que tenía <b>{solesBalance(cuadre.tiene)}</b> · lo que debía + lo tuyo <b>{solesBalance(cuadre.debe + cuadre.tuyo)}</b>
            </span>
            {cuadre.cuadra ? (
              <span className="text-verde">Cuadra</span>
            ) : (
              <span className="text-ambar">
                {cuadre.diferencia > 0 ? "Falta explicar" : "Sobra"} {solesBalance(Math.abs(cuadre.diferencia))} en lo que era tuyo
              </span>
            )}
          </div>

          {hayArranque && (
            <CampoFin etiqueta="Por qué se corrige" htmlFor="arr-motivo" ayuda="Queda escrito junto a la fila nueva (por ejemplo: «factura de agosto registrada tarde»).">
              <InputFin id="arr-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
            </CampoFin>
          )}

          {correcciones.length > 0 && (
            <details className="mb-4 text-[12.5px] text-taupe">
              <summary className="cursor-pointer">Correcciones anteriores ({correcciones.length})</summary>
              <ul className="fin-lista mt-2">
                {correcciones.map((c) => (
                  <li key={c.id}>
                    <span>
                      {c.cuenta} · {c.motivo}
                      {c.registradoPor ? ` · ${c.registradoPor}` : ""}
                    </span>
                    <b>{solesBalance(c.monto)}</b>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={guardar} disabled={!puedeGuardar || !responsable.listo}>
          {guardando ? "Guardando…" : hayArranque ? "Guardar corrección" : "Registrar saldos de arranque"}
        </button>
      </div>
    </Modal>
  );
}
