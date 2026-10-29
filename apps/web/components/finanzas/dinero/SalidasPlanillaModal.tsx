"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin, RadiosFin, SelectFin } from "@/components/finanzas/kit";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes, hoyLima } from "@/lib/fechas-lima";
import { nombreCorto, type CuentaDinero } from "@/lib/cuentas-dinero-reglas";
import {
  TEXTO_BANCO,
  camposDeSalidas,
  filasDeSalidas,
  idCampoSalida,
  leerSalidaSuelta,
  notaAntesDelSaldo,
  queSePago,
  textoRegistrar,
  textoSuelta,
  validarSalidas,
  type AvisoPlanilla,
  type FilaSalida,
  type SalidaSuelta,
} from "@/lib/planilla-salidas-reglas";

// Finanzas ▸ Cuentas y dinero: la hoja que registra de qué banco salió un grupo de la planilla que Dynamic marcó pagado (ADR-0567).
// Una fila por banco de quien cobra, ya llena con lo que la pantalla sabe (la cuenta de Configuración, el neto de Dynamic, el día que lo
// pagó): normalmente basta con confirmar. Si alguna ya se registró a mano, se dice cuál es en vez de crear otra. Todo o nada, en una sola
// llamada (`registrar_salidas_planilla`), con el token de la hoja: un doble clic no registra dos veces.
export function SalidasPlanillaModal({ aviso, cuentas, onCerrar }: { aviso: AvisoPlanilla; cuentas: CuentaDinero[]; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const hoy = hoyLima();
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [filas, setFilas] = useState<FilaSalida[]>(() => filasDeSalidas(aviso));
  // Las «Pago de la planilla» registradas a mano y sueltas: si no hay, la hoja ni pregunta.
  const [sueltas, setSueltas] = useState<SalidaSuelta[]>([]);
  useEffect(() => {
    let vivo = true;
    createClient()
      .rpc("fn_planilla_salidas_sueltas" as never)
      .then(({ data, error }) => {
        if (vivo && !error) setSueltas(((data ?? []) as Record<string, unknown>[]).map(leerSalidaSuelta));
      });
    return () => {
      vivo = false;
    };
  }, []);

  const bancos = cuentas.filter((c) => c.tipo === "banco" && !c.archivada);
  const cambiar = (banco: FilaSalida["banco"], c: Partial<FilaSalida>) => setFilas((xs) => xs.map((f) => (f.banco === banco ? { ...f, ...c } : f)));
  const v = validarSalidas(aviso, filas, hoy);
  const guia = useGuiaCampos([
    ...camposDeSalidas(filas, hoy),
    { id: "responsable", nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién registra la salida." },
  ]);

  async function guardar() {
    if (!v.ok) return avisar.error(v.error);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("registrar_salidas_planilla" as never, { ...v.valor, p_token: token } as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "registrar la salida de la planilla"));
    avisar.exito(filas.length === 1 ? "Salida de la planilla registrada" : "Salidas de la planilla registradas", {
      detalle: v.valor.p_salidas
        .map((x) =>
          "movimiento_id" in x
            ? `${TEXTO_BANCO[x.banco]}: enlazada a la que ya estaba registrada.`
            : `${TEXTO_BANCO[x.banco]}: ${soles(x.monto)} desde ${bancos.find((c) => c.id === x.cuenta_id)?.nombre ?? "su cuenta"}.`,
        )
        .join(" "),
    });
    onCerrar();
    router.refresh();
  }

  const periodo = `del ${diaMes(aviso.tramos[0]?.fechaIni ?? null)} al ${diaMes(aviso.tramos[0]?.fechaFin ?? null)}`;
  const que = queSePago(aviso.grupo);

  return (
    <Modal
      variante="hoja"
      titulo="Registrar de qué banco salió"
      subtitulo={`${que[0].toUpperCase()}${que.slice(1)} ${periodo}. Dynamic marcó el pago el ${diaMes(aviso.pagadoEl)}. Revisa cada banco y confirma.`}
      onClose={onCerrar}
      tamano="mediana"
    >
      {filas.map((f, i) => {
        const cuenta = bancos.find((c) => c.id === f.cuentaId);
        const nota = f.modo === "nueva" ? notaAntesDelSaldo(f.fecha, cuenta) : null;
        return (
          <section key={f.banco} className="mb-5" data-guia={i === 0 ? "fin-dinero.salida-fila" : undefined}>
            <TituloGrupo nota={`${f.personas === 1 ? "1 persona" : `${f.personas} personas`} · ${soles(f.neto)} según Dynamic`} retraso={120 + i * 60}>
              Quienes cobran en {TEXTO_BANCO[f.banco]}
            </TituloGrupo>

            {sueltas.length > 0 && (
              <div className="mb-3" data-sin-cascada>
                <RadiosFin<FilaSalida["modo"]>
                  nombre={`sal-${f.banco}-modo`}
                  etiqueta={`Cómo se registra lo de ${TEXTO_BANCO[f.banco]}`}
                  valor={f.modo}
                  onValor={(modo) => cambiar(f.banco, { modo })}
                  opciones={[
                    { valor: "nueva", texto: "Registrarla ahora" },
                    { valor: "ya", texto: "Ya la registré a mano" },
                  ]}
                />
              </div>
            )}

            {f.modo === "ya" ? (
              <CampoGuiado id={idCampoSalida(f.banco, "ya")} guia={guia}>
                <CampoFin etiqueta={guia.etiqueta(idCampoSalida(f.banco, "ya"), "Cuál es")} htmlFor={idCampoSalida(f.banco, "ya")} ayuda="Se enlaza a este grupo y deja de aparecer suelta.">
                  <SelectFin
                    id={idCampoSalida(f.banco, "ya")}
                    valor={f.movimientoId}
                    onValor={(movimientoId) => cambiar(f.banco, { movimientoId })}
                    marcador="Elige la salida"
                    opciones={sueltas.map((s) => ({ valor: s.movimientoId, texto: textoSuelta(s) }))}
                  />
                </CampoFin>
              </CampoGuiado>
            ) : (
              <>
                <CampoGuiado id={idCampoSalida(f.banco, "cuenta")} guia={guia} className="mb-3">
                  <CampoFin etiqueta={guia.etiqueta(idCampoSalida(f.banco, "cuenta"), "Sale de")} htmlFor={idCampoSalida(f.banco, "cuenta")}>
                    <SelectFin
                      id={idCampoSalida(f.banco, "cuenta")}
                      valor={f.cuentaId}
                      onValor={(cuentaId) => cambiar(f.banco, { cuentaId })}
                      marcador="Elige el banco"
                      opciones={bancos.map((c) => ({ valor: c.id, texto: nombreCorto(c.nombre) }))}
                    />
                  </CampoFin>
                </CampoGuiado>
                <div className="fin-dos-campos">
                  <CampoGuiado id={idCampoSalida(f.banco, "monto")} guia={guia}>
                    <CampoFin etiqueta={guia.etiqueta(idCampoSalida(f.banco, "monto"), "Monto (S/)")} htmlFor={idCampoSalida(f.banco, "monto")} ayuda="Lo que salió del banco.">
                      <InputFin id={idCampoSalida(f.banco, "monto")} inputMode="decimal" value={f.monto} onChange={(e) => cambiar(f.banco, { monto: e.target.value })} />
                    </CampoFin>
                  </CampoGuiado>
                  <CampoGuiado id={idCampoSalida(f.banco, "fecha")} guia={guia}>
                    <CampoFin etiqueta={guia.etiqueta(idCampoSalida(f.banco, "fecha"), "Día")} htmlFor={idCampoSalida(f.banco, "fecha")}>
                      <InputFin id={idCampoSalida(f.banco, "fecha")} type="date" max={hoy} value={f.fecha} onChange={(e) => cambiar(f.banco, { fecha: e.target.value })} />
                    </CampoFin>
                  </CampoGuiado>
                </div>
                {nota && (
                  <Aviso tono="info" chico className="mt-2">
                    {nota}
                  </Aviso>
                )}
              </>
            )}
          </section>
        );
      })}

      <CampoGuiado id="responsable" guia={guia}>
        <div>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </CampoGuiado>
      <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-3" data-guia="fin-dinero.salida-botones">
        <PieGuia guia={guia} listo="Todo listo para registrar." />
        <div className="ml-auto pie-acciones">
          <Boton type="button" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            peso="primario"
            cargando={guardando}
            textoCargando="Registrando…"
            type="button"
            onClick={guardar}
            disabled={guardando || !v.ok || !responsable.listo}
            className={guia.claseConfirmar}
            title={guia.frase ?? undefined}
          >
            {textoRegistrar(filas.length)}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
