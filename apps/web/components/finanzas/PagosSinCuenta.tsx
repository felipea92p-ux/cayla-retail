"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { GuiaVacia, SelectFin } from "@/components/finanzas/kit";
import { useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { fechaCorta } from "@/lib/gastos-reglas";
import {
  TEXTO_ORIGEN_SIN_CUENTA,
  claseDePagoSinCuenta,
  hayCuentasPara,
  leerPagoSinCuenta,
  medioDePagoSinCuenta,
  opcionesDeCuenta,
  type PagoSinCuenta,
} from "@/lib/cuenta-sellada-reglas";

// Lo pasado (ADR-0195 F3b): lo que movió plata antes de que se sellara la cuenta —el hueco de los pagos en efectivo a
// proveedores, sobre todo— se completa UNA vez, a mano, desde aquí. No crea salidas de caja ni toca cierres ya hechos: si
// salió de un cajón ya cerrado, ese cierre ya lo absorbió. Solo el líder (la base lo exige).

export function PagosSinCuentaModal({ onClose, filasIniciales }: { onClose: () => void; /** Solo para dibujarlo sin sesión (prueba visual). */ filasIniciales?: PagoSinCuenta[] }) {
  const router = useRouter();
  const responsable = useResponsable();
  const cuentas = useCuentasParaElegir("pago", null);
  const [filas, setFilas] = useState<PagoSinCuenta[] | null>(filasIniciales ?? null);
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [hechas, setHechas] = useState<string[]>([]);

  useEffect(() => {
    if (filasIniciales) return;
    let vivo = true;
    void createClient()
      .rpc("fn_pagos_sin_cuenta" as never)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) avisar.error(traducirError(error, "leer lo que no dice su cuenta"));
        setFilas(error ? [] : ((data ?? []) as Record<string, unknown>[]).map(leerPagoSinCuenta));
      });
    return () => {
      vivo = false;
    };
  }, [filasIniciales]);

  async function guardar(p: PagoSinCuenta) {
    const cuenta = elegidas[p.clave];
    if (!cuenta) return avisar.error("Elige de qué cuenta fue.");
    if (!responsable.listo) return void (responsable.motivo && avisar.error(responsable.motivo));
    setGuardando(p.clave);
    const { error } = await firmar(createClient().rpc("asignar_cuenta_pasada" as never, { p_clave: p.clave, p_cuenta_id: cuenta } as never), responsable.firma());
    setGuardando(null);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "decir de qué cuenta fue"));
    setHechas((h) => [...h, p.clave]);
    avisar.exito("Listo: ya dice de qué cuenta fue", { detalle: `${p.detalle} · ${soles(Math.abs(p.monto))}. Los saldos ya lo cuentan.` });
    router.refresh();
  }

  const pendientes = (filas ?? []).filter((p) => !hechas.includes(p.clave));
  return (
    <Modal
      variante="hoja"
      titulo="Decir de qué cuenta fue"
      subtitulo="Lo que se guardó antes de que cada pago dijera su cuenta. Se dice una sola vez: no crea salidas de caja ni toca cierres ya hechos."
      onClose={onClose}
      ancho="max-w-[680px]"
    >
      {filas === null ? (
        <p className="fin-ayuda">Buscando…</p>
      ) : pendientes.length === 0 ? (
        <GuiaVacia sobre="Nada pendiente" titulo="Todo dice de qué cuenta es">
          Desde ahora cada cobro y cada pago sella su cuenta al guardarse.
        </GuiaVacia>
      ) : (
        <ul className="fin-sin-cuenta">
          {pendientes.map((p) => {
            const clase = claseDePagoSinCuenta(p.origen);
            const medio = medioDePagoSinCuenta(p);
            const hay = cuentas.listo && hayCuentasPara(cuentas.cuentas, clase, medio);
            return (
              <li key={p.clave}>
                <div className="fin-sin-cuenta-que">
                  <b>{p.detalle}</b>
                  <span>
                    {fechaCorta(p.fecha)} · {TEXTO_ORIGEN_SIN_CUENTA[p.origen] ?? p.origen}
                    {p.ubicacionNombre ? ` · ${p.ubicacionNombre}` : ""} · {medio}
                  </span>
                </div>
                <span className="fin-sin-cuenta-monto">{soles(Math.abs(p.monto))}</span>
                <SelectFin
                  etiqueta={`De qué cuenta fue: ${p.detalle}`}
                  valor={elegidas[p.clave] ?? ""}
                  deshabilitado={!hay}
                  onValor={(v) => setElegidas((x) => ({ ...x, [p.clave]: v }))}
                  opciones={hay ? opcionesDeCuenta(cuentas.cuentas, clase, medio) : []}
                  marcador={!cuentas.listo ? "…" : hay ? "Elige…" : "Sin cuentas para este medio"}
                />
                <button type="button" className="btn-cayla btn-secundario btn-chico" disabled={!elegidas[p.clave] || guardando !== null || !responsable.listo} onClick={() => guardar(p)}>
                  {guardando === p.clave ? "Guardando…" : "Guardar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ComboResponsable control={responsable} deshabilitado={guardando !== null} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
