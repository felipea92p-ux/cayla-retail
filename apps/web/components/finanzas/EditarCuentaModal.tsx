"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin, SelectFin } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { TEXTO_TIPO_CUENTA, TIPOS_QUE_SE_AGREGAN, type CuentaDinero, type TipoCuenta } from "@/lib/cuentas-dinero-reglas";
import { cambiosDeCuenta, formInicial, leerDetalleCuenta, salidaDeCuenta, textoUsos, type DetalleCuenta, type FormCuenta } from "@/lib/cuenta-editar-reglas";

// Configuración ▸ Cuentas y cobros ▸ «Editar cuenta» (ADR-0195 F3, actualización 2026-09-25). Lo que se puede cambiar lo
// dice la base (`fn_cuenta_dinero_detalle`) y lo vuelve a exigir al guardar: el nombre y el número siempre; el tipo mientras
// nadie la usó; el saldo inicial sin conciliación vigente y con su mes abierto. Una cuenta sin uso se ELIMINA de verdad;
// una usada se archiva (sus movimientos se quedan). Todo firmado con el responsable.

type Consulta = PromiseLike<{ error: unknown }>;

/** Detalles fijos en lugar de pedirlos a la base: solo para dibujar la ventana sin sesión (rutas de prueba visual), como
 *  `CuentasDePrueba` en CampoCuenta. */
export const DetallesDePrueba = createContext<Record<string, DetalleCuenta> | null>(null);

export function EditarCuentaModal({ cuenta, hoy, onCerrar }: { cuenta: CuentaDinero; hoy: string; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const fijo = useContext(DetallesDePrueba)?.[cuenta.id] ?? null;
  const [leido, setLeido] = useState<DetalleCuenta | null>(null);
  const detalle = fijo ?? leido;
  const [falla, setFalla] = useState<string | null>(null);
  const [form, setForm] = useState<FormCuenta>(() =>
    fijo ? formInicial(fijo) : { nombre: cuenta.nombre, numero: cuenta.numero ?? "", tipo: cuenta.tipo, saldo: "", desde: cuenta.saldoDesde ?? "" }
  );
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  useEffect(() => {
    if (fijo) return;
    let vivo = true;
    void createClient()
      .rpc("fn_cuenta_dinero_detalle" as never, { p_cuenta_id: cuenta.id } as never)
      .then(({ data, error }) => {
        if (!vivo) return;
        const d = error ? null : leerDetalleCuenta(data);
        if (!d) {
          setFalla(error ? traducirError(error as never, "leer la cuenta") : "No se pudo leer la cuenta. Recarga la pantalla.");
          return;
        }
        setLeido(d);
        setForm(formInicial(d));
      });
    return () => {
      vivo = false;
    };
  }, [cuenta.id, fijo]);

  const cambios = detalle ? cambiosDeCuenta(detalle, form, hoy) : null;
  const hayCambios = !!cambios && cambios.ok && cambios.valor.hayCambios;
  const salida = detalle ? salidaDeCuenta(detalle) : null;
  const usos = detalle ? textoUsos(detalle.usos) : null;
  const esTarjeta = form.tipo === "tarjeta_credito";
  const poner = (x: Partial<FormCuenta>) => setForm((f) => ({ ...f, ...x }));

  async function enviar(consulta: () => Consulta, que: string, exito: string) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return;
    }
    setGuardando(true);
    const { error } = await firmar(consulta() as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return;
    }
    avisar.exito(exito);
    onCerrar();
    router.refresh();
  }

  function guardar() {
    if (!cambios) return;
    if (!cambios.ok) return avisar.error(cambios.error);
    if (!cambios.valor.hayCambios) return onCerrar();
    const { payload } = cambios.valor;
    void enviar(() => createClient().rpc("editar_cuenta_dinero" as never, payload as never), "guardar la cuenta", `${payload.p_nombre}: guardada.`);
  }

  const bloqueado = guardando || !detalle;

  return (
    <Modal variante="hoja" titulo="Editar cuenta" subtitulo={subtitulo(detalle, cuenta)} onClose={onCerrar} ancho="max-w-[520px]">
      {falla && <p className="nota-cayla mb-4">{falla}</p>}

      <CampoFin etiqueta="Nombre" htmlFor="ed-cta-nombre">
        <InputFin id="ed-cta-nombre" value={form.nombre} disabled={bloqueado} onChange={(e) => poner({ nombre: e.target.value })} />
      </CampoFin>

      {detalle?.automatica ? (
        <CampoFin etiqueta="Tipo" ayuda="Nace con su sede: solo cambia el nombre.">
          {/* Bloqueado a propósito: se ve que es un tipo, pero una cuenta automática no lo cambia. */}
          <SelectFin etiqueta="Tipo" deshabilitado valor={detalle.tipo} onValor={() => {}} opciones={[{ valor: detalle.tipo, texto: TEXTO_TIPO_CUENTA[detalle.tipo] }]} />
        </CampoFin>
      ) : (
        <>
          <div className="fin-dos-campos">
            <CampoFin
              etiqueta="Tipo"
              htmlFor="ed-cta-tipo"
              ayuda={detalle && !detalle.puedeCambiarTipo ? "Ya se usó: su tipo queda." : undefined}
            >
              <SelectFin<TipoCuenta>
                id="ed-cta-tipo"
                valor={form.tipo}
                deshabilitado={bloqueado || !detalle?.puedeCambiarTipo}
                onValor={(tipo) => poner({ tipo })}
                opciones={TIPOS_QUE_SE_AGREGAN.map((t) => ({ valor: t.tipo, texto: t.texto }))}
              />
            </CampoFin>
            <CampoFin etiqueta="Número (opcional)" htmlFor="ed-cta-numero">
              <InputFin id="ed-cta-numero" value={form.numero} disabled={bloqueado} onChange={(e) => poner({ numero: e.target.value })} placeholder="•••• 1942" />
            </CampoFin>
          </div>
          <div className="fin-dos-campos">
            <CampoFin
              etiqueta={esTarjeta ? "Lo que se debe al empezar" : "Saldo con el que empieza"}
              htmlFor="ed-cta-saldo"
              ayuda={detalle?.motivoSaldo ?? undefined}
              tono={detalle?.motivoSaldo ? "aviso" : undefined}
            >
              <InputFin
                id="ed-cta-saldo"
                inputMode="decimal"
                value={form.saldo}
                disabled={bloqueado || !detalle?.puedeCambiarSaldo}
                onChange={(e) => poner({ saldo: e.target.value })}
              />
            </CampoFin>
            <CampoFin etiqueta="Al empezar el día" htmlFor="ed-cta-desde">
              <InputFin
                id="ed-cta-desde"
                type="date"
                max={hoy}
                value={form.desde}
                disabled={bloqueado || !detalle?.puedeCambiarSaldo}
                onChange={(e) => poner({ desde: e.target.value })}
              />
            </CampoFin>
          </div>
        </>
      )}

      {/* Quién la usa: decide si se elimina o se archiva. El lugar se reserva mientras llega, para que la hoja no salte. */}
      <p className="mb-4 min-h-[2.6em] text-[12.5px] leading-snug text-taupe">
        {!detalle
          ? " "
          : detalle.automatica
            ? "El cajón, la caja fuerte y el efectivo por rendir nacen con su sede: no se eliminan ni se archivan."
            : usos
              ? `Por esta cuenta ya pasaron ${usos}. Por eso no se elimina: si deja de usarse, se archiva y su historia se queda.`
              : "Todavía no se usó: puedes cambiarle todo, o eliminarla si fue un error."}
      </p>
      {salida?.accion === "archivar" && salida.bloqueo && <p className="nota-cayla mb-4 text-[12.5px]">{salida.bloqueo}</p>}

      <ComboResponsable control={responsable} deshabilitado={guardando} />

      {confirmarEliminar ? (
        <div className="mt-4 rounded-[10px] border border-rojo/30 bg-rojo/5 px-4 py-3" role="alertdialog" aria-label="Confirmar eliminación">
          <p className="text-[13.5px]">
            <b>¿Eliminar «{detalle?.nombre}»?</b> Desaparece de Finanzas y no se puede deshacer; queda anotada en la historia de Configuración.
          </p>
          <div className="fin-botones mt-3">
            <button type="button" className="btn-cayla btn-secundario" onClick={() => setConfirmarEliminar(false)} disabled={guardando}>
              No, volver
            </button>
            <button
              type="button"
              className="btn-cayla btn-peligro"
              disabled={guardando || !responsable.listo}
              onClick={() =>
                enviar(
                  () => createClient().rpc("eliminar_cuenta_dinero" as never, { p_cuenta_id: cuenta.id } as never),
                  "eliminar la cuenta",
                  `${detalle?.nombre ?? "La cuenta"}: eliminada.`,
                )
              }
            >
              {guardando ? "Eliminando…" : "Sí, eliminar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="fin-botones mt-4">
          {salida?.accion === "eliminar" && (
            <button type="button" className="btn-cayla btn-peligro mr-auto" onClick={() => setConfirmarEliminar(true)} disabled={bloqueado}>
              Eliminar cuenta
            </button>
          )}
          {(salida?.accion === "archivar" || salida?.accion === "reactivar") && (
            <button
              type="button"
              className="btn-cayla btn-sutil mr-auto"
              disabled={bloqueado || (salida.accion === "archivar" && !!salida.bloqueo) || !responsable.listo}
              onClick={() =>
                enviar(
                  () => createClient().rpc("archivar_cuenta_dinero" as never, { p_id: cuenta.id, p_archivar: salida.accion === "archivar" } as never),
                  salida.accion === "archivar" ? "archivar la cuenta" : "reactivar la cuenta",
                  salida.accion === "archivar" ? `${cuenta.nombre}: archivada. Sus movimientos se quedan.` : `${cuenta.nombre}: activa otra vez.`,
                )
              }
            >
              {salida.accion === "archivar" ? "Archivar" : "Reactivar"}
            </button>
          )}
          <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="btn-cayla btn-primario" onClick={guardar} disabled={bloqueado || !hayCambios || !responsable.listo}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      )}
    </Modal>
  );
}

function subtitulo(d: DetalleCuenta | null, c: CuentaDinero): string {
  const tipo = TEXTO_TIPO_CUENTA[d?.tipo ?? c.tipo];
  const archivada = d?.archivada ?? c.archivada;
  return `${tipo} · cuenta contable ${c.cuentaContable}${archivada ? " · archivada" : ""}`;
}
