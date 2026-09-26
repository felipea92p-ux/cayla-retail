"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin, PieTabla, SelectFin, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { EditarCuentaModal } from "@/components/finanzas/EditarCuentaModal";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { parsearMonto, solesRedondo } from "@/lib/gastos-reglas";
import {
  MEDIOS_COBRO,
  TEXTO_MEDIO_COBRO,
  TEXTO_TIPO_CUENTA,
  TIPOS_AUTOMATICOS,
  TIPOS_QUE_SE_AGREGAN,
  nombreCorto,
  textoRecibe,
  tiposParaMedio,
  type CuentaDinero,
  type FilaMedio,
  type MedioCobro,
  type TipoCuenta,
} from "@/lib/cuentas-dinero-reglas";

// Configuración ▸ Cuentas y cobros (ADR-0195 F3), dibujada como el spike (`vista-config.js`, `cfgCuentas`): las cuentas
// de CAYLA (los cajones y cajas fuertes nacen con cada tienda; aquí se agregan bancos, billeteras, el POS y la tarjeta) y a
// qué cuenta entra cada medio de cobro en cada tienda. Como en Tiendas y caja, CADA CASILLA SE GUARDA SOLA al cambiar,
// firmada con el responsable. Cambiar a qué cuenta entra un cobro rige desde hoy: lo pasado no se mueve. Cada cuenta se
// corrige, archiva o elimina desde «Editar» (`EditarCuentaModal`, actualización 2026-09-25).

type Consulta = PromiseLike<{ error: unknown }>;

export function ConfiguracionCuentas({ cuentas, medios, hoy }: { cuentas: CuentaDinero[]; medios: FilaMedio[]; hoy: string }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [agregar, setAgregar] = useState(false);
  const [editar, setEditar] = useState<CuentaDinero | null>(null);

  const guardar = async (hacer: () => Consulta, que: string, listo: string) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(hacer() as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return false;
    }
    avisar.exito(listo);
    router.refresh();
    return true;
  };

  const tiendas = [...new Map(medios.map((m) => [m.ubicacionId, m.ubicacionNombre])).entries()];
  const activas = cuentas.filter((c) => !c.archivada);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[13px] text-taupe">Cada casilla se guarda sola al cambiarla, a nombre de quien figure como responsable. Cada cambio queda en la historia.</p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>

      <Superficie className="anim-sube">
        <TituloDeTarjeta titulo="Cuentas de CAYLA" bajada="Cada lugar donde hay plata. Una cuenta sin movimientos se elimina; con movimientos, se archiva.">
          <button type="button" className="btn-cayla btn-primario btn-chico" onClick={() => setAgregar(true)}>
            + Agregar cuenta
          </button>
        </TituloDeTarjeta>
        <div className="fin-tabla-wrap">
          <table className="fin-tabla" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th>Cuenta contable</th>
                <th className="fin-num">Saldo hoy</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => {
                const recibe = textoRecibe(c, medios);
                const sub = [recibe, c.numero, c.saldoDesde && !TIPOS_AUTOMATICOS.includes(c.tipo) ? `desde el ${c.saldoDesde.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · ");
                return (
                  <tr key={c.id} className={c.archivada ? "fin-suave" : undefined}>
                    <td className="fin-ancha" data-l="Cuenta">
                      <b>{c.nombre}</b>
                      {sub && <span className="fin-sub">{sub}</span>}
                    </td>
                    <td data-l="Tipo">{TEXTO_TIPO_CUENTA[c.tipo]}</td>
                    <td data-l="Contable">{c.cuentaContable}</td>
                    <td className="fin-num" data-l="Saldo">
                      {c.saldo === null ? "—" : c.saldo < 0 ? `−${solesRedondo(-c.saldo)}` : solesRedondo(c.saldo)}
                    </td>
                    <td data-l="Estado">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Chip tono={c.archivada ? "apagado" : "verde"} tachado={false}>
                          {c.archivada ? "archivada" : "activa"}
                        </Chip>
                        <button type="button" className="btn-enlace text-[12px]" disabled={guardando} onClick={() => setEditar(c)} aria-label={`Editar ${c.nombre}`}>
                          Editar
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PieTabla>
          <span>Los cajones y cajas fuertes nacen con cada tienda; aquí solo se ven. Un saldo nunca se escribe: se suma de los movimientos.</span>
        </PieTabla>
      </Superficie>

      <Superficie className="anim-sube">
        <TituloDeTarjeta titulo="A qué cuenta entra cada cobro" bajada="Si cambias el Yape de una tienda a otra cuenta, desde hoy Finanzas lo cuenta ahí. Lo pasado no se mueve." />
        {tiendas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-taupe">No hay tiendas activas.</p>
        ) : (
          <div className="fin-tabla-wrap">
            <table className="fin-tabla fin-tabla-medios">
              <thead>
                <tr>
                  <th>Tienda</th>
                  {MEDIOS_COBRO.map((m) => (
                    <th key={m}>{TEXTO_MEDIO_COBRO[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tiendas.map(([id, nombre]) => (
                  <tr key={id}>
                    <td data-l="Tienda">
                      <b>{nombre}</b>
                    </td>
                    {MEDIOS_COBRO.map((m) => (
                      <td key={m} data-l={TEXTO_MEDIO_COBRO[m]}>
                        <CasillaMedio
                          medio={m}
                          tienda={nombre}
                          actual={medios.find((x) => x.ubicacionId === id && x.medio === m)?.cuentaId ?? ""}
                          cuentas={activas}
                          deshabilitada={guardando}
                          alCambiar={(cuentaId) =>
                            guardar(
                              () => createClient().rpc("guardar_medio_de_cobro" as never, { p_ubicacion_id: id, p_medio: m, p_cuenta_id: cuentaId || null } as never),
                              "cambiar a qué cuenta entra el cobro",
                              `${TEXTO_MEDIO_COBRO[m]} de ${nombre}: desde hoy entra a ${activas.find((c) => c.id === cuentaId)?.nombre ?? "ninguna cuenta"}.`,
                            )
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PieTabla>
          <span>El efectivo siempre cae al cajón de la tienda.</span>
        </PieTabla>
      </Superficie>

      {agregar && <AgregarCuentaModal hoy={hoy} onCerrar={() => setAgregar(false)} />}
      {editar && <EditarCuentaModal cuenta={editar} hoy={hoy} onCerrar={() => setEditar(null)} />}
    </>
  );
}

/** Un medio en una tienda: se guarda al elegir. Si el guardado falla, vuelve a lo de antes. */
function CasillaMedio({
  medio,
  tienda,
  actual,
  cuentas,
  deshabilitada,
  alCambiar,
}: {
  medio: MedioCobro;
  tienda: string;
  actual: string;
  cuentas: CuentaDinero[];
  deshabilitada: boolean;
  alCambiar: (cuentaId: string) => Promise<boolean>;
}) {
  const [valor, setValor] = useState(actual);
  const [antes, setAntes] = useState(actual);
  if (actual !== antes) {
    setAntes(actual);
    setValor(actual);
  }
  const tipos = tiposParaMedio(medio);
  const opciones = cuentas.filter((c) => tipos.includes(c.tipo));
  return (
    <SelectFin
      aria-label={`A qué cuenta entra ${TEXTO_MEDIO_COBRO[medio]} de ${tienda}`}
      value={valor}
      disabled={deshabilitada}
      onChange={async (e) => {
        const nuevo = e.target.value;
        setValor(nuevo);
        const ok = await alCambiar(nuevo);
        if (!ok) setValor(actual);
      }}
    >
      <option value="">Sin cuenta</option>
      {opciones.map((c) => (
        <option key={c.id} value={c.id}>
          {nombreCorto(c.nombre)}
        </option>
      ))}
    </SelectFin>
  );
}

function AgregarCuentaModal({ hoy, onCerrar }: { hoy: string; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuenta>("banco");
  const [saldo, setSaldo] = useState("0");
  const [desde, setDesde] = useState(hoy);
  const [numero, setNumero] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esTarjeta = tipo === "tarjeta_credito";

  async function agregar() {
    if (!nombre.trim()) return avisar.error("Ponle un nombre a la cuenta.");
    let s = 0;
    if (saldo.trim() !== "" && saldo.trim() !== "0") {
      const m = parsearMonto(saldo.replace(/^-/, ""));
      if (!m.ok) return avisar.error(m.error);
      // La tarjeta de crédito empieza con lo que se debe: el saldo es negativo.
      s = esTarjeta ? -m.valor : m.valor;
    }
    if (!desde || desde > hoy) return avisar.error("La fecha del saldo no puede ser futura.");
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("crear_cuenta_dinero" as never, { p_nombre: nombre.trim(), p_tipo: tipo, p_saldo_inicial: s, p_saldo_desde: desde, p_numero: numero.trim() || null } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "agregar la cuenta"));
    avisar.exito("Cuenta agregada", { detalle: "Dile en «A qué cuenta entra cada cobro» qué cobros le llegan." });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal variante="hoja" titulo="Agregar cuenta" subtitulo="Un banco, una billetera que no cae a un banco, el POS de tarjeta o la tarjeta de crédito de CAYLA." onClose={onCerrar} ancho="max-w-[520px]">
      <CampoFin etiqueta="Nombre" htmlFor="cta-nombre">
        <InputFin id="cta-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="BBVA · Cta. corriente" />
      </CampoFin>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Tipo" htmlFor="cta-tipo">
          <SelectFin id="cta-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)}>
            {TIPOS_QUE_SE_AGREGAN.map((t) => (
              <option key={t.tipo} value={t.tipo}>
                {t.texto}
              </option>
            ))}
          </SelectFin>
        </CampoFin>
        <CampoFin etiqueta="Número (opcional)" htmlFor="cta-numero">
          <InputFin id="cta-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="•••• 1942" />
        </CampoFin>
      </div>
      <div className="fin-dos-campos">
        <CampoFin etiqueta={esTarjeta ? "Lo que se debe al empezar" : "Saldo con el que empieza"} htmlFor="cta-saldo">
          <InputFin id="cta-saldo" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
        </CampoFin>
        <CampoFin etiqueta="Al empezar el día" htmlFor="cta-desde">
          <InputFin id="cta-desde" type="date" max={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </CampoFin>
      </div>
      <p className="-mt-2 mb-4 text-[12.5px] text-taupe">El saldo inicial se registra una vez; después el saldo solo cambia con movimientos, cobros y pagos desde ese día.</p>
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn-cayla btn-primario" onClick={agregar} disabled={guardando || !responsable.listo}>
          {guardando ? "Agregando…" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}
