"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Vacio } from "@/components/ui/Vacio";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin } from "@/components/finanzas/kit";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { soles } from "@/lib/compras-reglas";
import { fechaCorta, montoDentroDelTope, parsearMonto } from "@/lib/gastos-reglas";
import { leerFilaCuadre, sePuedeCuadrar, TEXTO_FALTA_CUADRE, textoResiduoCuadre, type FilaCuadre } from "@/lib/cuentas-dinero-reglas";

// Cuentas y dinero ▸ «Cuadrar depósitos» (tarea 14, ADR-0552): la vista previa de lo que ya venció en cada máquina y cuánto debería haber llegado. Confirmar lo registra como depósito
// ESTIMADO; cuando se ve el banco, `ReemplazarEstimado` lo cambia por lo que llegó. Nada se guarda sin este clic, y la base vuelve a comparar lo que se vio con lo que hay.

export function CuadrarDepositosHoja({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [filas, setFilas] = useState<FilaCuadre[] | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tokens] = useState(() => new Map<string, string>());

  const leer = useCallback(async () => {
    const { data, error } = await createClient().rpc("fn_cuadrar_depositos_vista" as never);
    if (error) {
      setFalla(traducirError(error, "leer lo que venció"));
      return;
    }
    setFalla(null);
    setFilas(((data ?? []) as Record<string, unknown>[]).map(leerFilaCuadre));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la lectura es del navegador y se dispara al abrir la hoja.
    void leer();
  }, [leer]);

  const listas = (filas ?? []).filter(sePuedeCuadrar);

  async function cuadrar() {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién lo hace (Responsable).");
      return;
    }
    setGuardando(true);
    let hechas = 0;
    for (const f of listas) {
      const token = tokens.get(f.cuentaId) ?? crypto.randomUUID();
      tokens.set(f.cuentaId, token);
      const { error } = await firmar(
        createClient().rpc("cuadrar_deposito_maquina" as never, { p_cuenta_id: f.cuentaId, p_claves: f.claves, p_neto: f.neto, p_token: token } as never),
        responsable.firma(),
      );
      responsable.despues(error);
      if (error) {
        setGuardando(false);
        avisar.error(traducirError(error, `cuadrar ${f.maquina}`));
        void leer();
        router.refresh();
        return;
      }
      hechas += 1;
    }
    setGuardando(false);
    avisar.exito(hechas === 1 ? "Depósito cuadrado" : `${hechas} depósitos cuadrados`, { detalle: "Quedan como estimados hasta que los compares con el banco." });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal variante="hoja" titulo="Cuadrar depósitos" subtitulo="Lo que cada máquina ya debió depositar, con la comisión que le toca por su tarifa." onClose={onCerrar} tamano="mediana">
      {falla && <Aviso tono="error" accion={<button type="button" className="btn-enlace" onClick={() => void leer()}>Reintentar</button>}>{falla}</Aviso>}
      {filas && filas.length === 0 && <Vacio tamano="chico" icono={<CalendarCheck />}>No hay nada vencido: cada máquina está al día.</Vacio>}
      {filas && filas.length > 0 && (
        <ul className="space-y-3">
          {filas.map((f) => (
            <li key={f.cuentaId} className="space-y-1 border-b border-sand pb-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[15px] font-medium">{f.maquina}</span>
                {f.falta ? <Chip tono="ambar">{TEXTO_FALTA_CUADRE[f.falta]}</Chip> : <span className="text-sm text-taupe">a {f.banco}</span>}
              </div>
              <p className="text-sm text-taupe">
                {f.dias === 1 ? "1 cobro" : `${f.dias} cobros`} del {fechaCorta(f.desde)}
                {f.hasta !== f.desde ? ` al ${fechaCorta(f.hasta)}` : ""}: {soles(f.bruto)} − {soles(f.comision)} de comisión = <b>{soles(f.neto)}</b>
              </p>
              {textoResiduoCuadre(f) && <p className="text-sm text-taupe">{textoResiduoCuadre(f)}</p>}
            </li>
          ))}
        </ul>
      )}
      {listas.length > 0 && (
        <>
          <p className="nota-cayla">
            Quedan como <b>estimados</b>: suben el banco sin que nadie lo haya visto. Compara con la app del banco y cámbialos por lo que llegó, desde cada movimiento.
          </p>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </>
      )}
      <div className="pie-acciones pie-hoja-fijo">
        <Boton type="button" peso="fantasma" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton type="button" peso="primario" cargando={guardando} textoCargando="Cuadrando…" disabled={guardando || listas.length === 0} onClick={cuadrar}>
          {listas.length > 1 ? `Cuadrar ${listas.length} máquinas` : "Cuadrar"}
        </Boton>
      </div>
    </Modal>
  );
}

/** En el detalle de un depósito estimado: lo que de verdad llegó. Mismos días; la diferencia queda como comisión real. */
export function ReemplazarEstimado({ movimientoId, onHecho }: { movimientoId: string; onHecho: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [monto, setMonto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [token] = useState(() => crypto.randomUUID());

  async function cambiar() {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién lo hace (Responsable).");
      return;
    }
    const m = montoDentroDelTope(parsearMonto(monto));
    if (!m.ok) return avisar.error(m.error);
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("reemplazar_deposito_estimado" as never, { p_movimiento_id: movimientoId, p_neto: m.valor, p_referencia: referencia.trim() || null, p_token: token } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "cambiar el depósito"));
    avisar.exito("Depósito real registrado", { detalle: "Reemplazó al estimado, con los mismos días." });
    onHecho();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="nota-cayla">Este depósito es estimado. Cuando lo veas en el banco, escribe lo que llegó: reemplaza a este, con los mismos días.</p>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Lo que llegó al banco" htmlFor="estimado-monto">
          <InputFin id="estimado-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </CampoFin>
        <CampoFin etiqueta="Número de operación o nota" htmlFor="estimado-ref">
          <InputFin id="estimado-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        </CampoFin>
      </div>
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="pie-acciones">
        <Boton type="button" peso="primario" cargando={guardando} textoCargando="Cambiando…" disabled={guardando} onClick={cambiar}>
          Cambiar por lo real
        </Boton>
      </div>
    </div>
  );
}
