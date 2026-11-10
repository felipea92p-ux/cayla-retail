"use client";

// Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco: el extracto del banco donde depositan las máquinas (ADR-0629, Fase B). Se sube el .txt
// que exporta la banca, o se pega la tabla copiada de la web, y se ve qué trajo. Cada lote de Vendemás se empareja con los días que cubre y,
// con un toque, se registra como su depósito (`registrar_abono_pos`, el de siempre). El extracto se lee en el navegador
// (`lib/extracto-interbank.ts`) y, desde «el banco manda» (ADR-0637), se GUARDA con «Guardar este extracto»: cada línea tal como la dijo el
// banco (`cargar_lineas_banco`, que decide qué es nuevo y qué ya estaba). Guardar no mueve plata: los depósitos se siguen registrando abajo.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { fechaCorta } from "@/lib/gastos-reglas";
import { leerLotePendiente, type LotePendiente } from "@/lib/cuentas-dinero-reglas";
import { leerExtracto, resumenExtracto, solesDeCentimos, type ExtractoLeido } from "@/lib/extracto-interbank";
import { cuentaDelArchivo, fraseDeCarga, fuenteDe, huellaDeArchivo, leerResultadoCarga, paraCargar, type ResultadoCarga } from "@/lib/banco-lineas";
import { emparejarIzipay, emparejarVendemas, leerPagoMaquina, type DepositoRegistrado, type PagoMaquina, type PropuestaIzipay, type PropuestaLote } from "@/lib/emparejar-maquinas";

/** Una máquina que deposita en este banco: su puente («Por depositar …») y su nombre. */
export type MaquinaDelBanco = { cuentaId: string; nombre: string };

type Props = {
  banco: string;
  bancoId: string;
  maquinas: readonly MaquinaDelBanco[];
  /** La base ya sabe guardar el extracto (migración 20261109232000). Si todavía no, la hoja queda como antes: lee y no guarda. */
  guardar: boolean;
};

/** Lo leído, con el texto del que salió (para su huella) y la marca de este envío: si se reintenta, la base devuelve el mismo resultado. */
type Leido = { extracto: ExtractoLeido; texto: string; token: string };

export function CuadrarConExtracto(props: Props) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="btn-cayla btn-secundario btn-chico" aria-haspopup="dialog" onClick={() => setAbierto(true)} data-guia="fin-conciliacion.extracto">
        <FileUp className="h-4 w-4" aria-hidden="true" />
        Subir extracto
      </button>
      {abierto && <HojaExtracto {...props} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function HojaExtracto({ banco, bancoId, maquinas, guardar, onCerrar }: Props & { onCerrar: () => void }) {
  const [leido, setLeido] = useState<Leido | null>(null);
  const [pegado, setPegado] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  function leer(texto: string) {
    const e = leerExtracto(texto);
    if (e.lineas.length === 0) {
      setLeido(null);
      setFallo("No encontré movimientos en lo que trajiste. Sube el .txt que exporta la banca o copia la tabla entera, con sus montos.");
      return;
    }
    setFallo(null);
    // Cada lectura es un envío nuevo: volver a leer el mismo archivo y guardarlo dice «ya estaban», no repite el aviso de la primera vez.
    setLeido({ extracto: e, texto, token: crypto.randomUUID() });
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    // El .txt de Interbank viene en Latin-1 (sin tildes hoy, pero un nombre con ñ se leería mal en UTF-8).
    leer(new TextDecoder("windows-1252").decode(await f.arrayBuffer()));
  }

  return (
    <Modal
      titulo={`El extracto de ${banco}`}
      subtitulo={guardar ? "Lo que dice el banco, línea por línea. Guárdalo para verlo al lado de lo que anotaste." : "Lo que llegó de las máquinas, tal como lo dice el banco."}
      onClose={onCerrar}
      tamano="mediana"
      conCerrar
    >
      {leido ? (
        <ResumenDelExtracto leido={leido} banco={banco} bancoId={bancoId} maquinas={maquinas} guardar={guardar} onOtro={() => setLeido(null)} />
      ) : (
        <div className="space-y-4">
          <input
            ref={archivo}
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={(e) => {
              void elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Boton type="button" peso="primario" onClick={() => archivo.current?.click()}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Elegir el .txt del banco
          </Boton>
          <div className="campo space-y-2">
            <label htmlFor="extracto-pegado" className="campo-etiqueta">
              O pega la tabla de movimientos copiada de la banca
            </label>
            <textarea
              id="extracto-pegado"
              rows={5}
              value={pegado}
              onChange={(e) => setPegado(e.target.value)}
              placeholder="07/11/2026   09/11/2026   -   .   Abono QR IBK   S/ 45.90   S/ 2,793.69" // sugerir-fijo: así copia la banca una fila de la tabla, no depende de nada elegido
              className="caja-campo-input font-mono text-sm"
            />
            <Boton type="button" peso="fantasma" disabled={pegado.trim() === ""} onClick={() => leer(pegado)}>
              Leer lo pegado
            </Boton>
          </div>
          {fallo && <Aviso tono="error">{fallo}</Aviso>}
        </div>
      )}
    </Modal>
  );
}

function ResumenDelExtracto({ leido, banco, bancoId, maquinas, guardar, onOtro }: { leido: Leido; banco: string; bancoId: string; maquinas: readonly MaquinaDelBanco[]; guardar: boolean; onOtro: () => void }) {
  const { extracto } = leido;
  const resumen = resumenExtracto(extracto.lineas);
  const huecosAdentro = extracto.huecos.filter((h) => !h.enElBorde);
  const huecosBorde = extracto.huecos.filter((h) => h.enElBorde);
  // Cada máquina se reconoce por su nombre: Vendemás manda «PAGO ESTABLECIMIENTOS»; Izipay, «Abono QR IBK» y «PAGO IZIPAY».
  const vendemas = maquinas.find((m) => /vendem/i.test(m.nombre)) ?? null;
  const izipay = maquinas.find((m) => /izipay/i.test(m.nombre)) ?? null;
  const responsable = useResponsable();
  const cuantas = (t: string) => resumen.find((r) => r.tipo === t)?.cuantas ?? 0;
  const hayVendemas = cuantas("lote_vendemas") > 0;
  const hayIzipay = cuantas("qr_izipay") + cuantas("lote_izipay") > 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta">
        Del {fechaCorta(extracto.desde)} al {fechaCorta(extracto.hasta)} · {extracto.lineas.length} {extracto.lineas.length === 1 ? "movimiento" : "movimientos"}.{" "}
        <button type="button" className="btn-cayla btn-enlace" onClick={onOtro}>
          Usar otro extracto
        </button>
      </p>
      <div>
        <TituloGrupo>Qué trajo</TituloGrupo>
        <ul className="din-maq-dias mt-2" aria-label="Lo que trajo el extracto">
          {resumen.map((r) => (
            <li key={r.tipo}>
              <span className="text-sm text-tinta">
                {r.titulo} · {r.cuantas}
              </span>
              <b className="din-cuad-num">{solesDeCentimos(r.centimos)}</b>
            </li>
          ))}
        </ul>
      </div>
      {huecosAdentro.length > 0 && (
        <Aviso tono="atencion" titulo="Al extracto le faltan movimientos">
          La cadena de saldos se corta {huecosAdentro.length === 1 ? "una vez" : `${huecosAdentro.length} veces`} en medio del período (la primera, el{" "}
          {fechaCorta(huecosAdentro[0].antesDe.fecha)}). Vuelve a bajarlo completo antes de cuadrar: lo que falta no se puede emparejar.
        </Aviso>
      )}
      {huecosBorde.length > 0 && (
        <p className="nota-cayla text-sm">
          En el primer o el último día faltan movimientos de un día vecino: el banco procesa el fin de semana junto, y el extracto del período no los
          trae. Esos días se cuadran con el extracto siguiente.
        </p>
      )}
      {extracto.ignoradas > 0 && (
        <p className="din-cuad-tenue">
          {extracto.ignoradas === 1 ? "Un renglón no era un movimiento" : `${extracto.ignoradas} renglones no eran movimientos`} (títulos o totales) y no se leyó.
        </p>
      )}
      {(guardar || hayVendemas || hayIzipay) && <ComboResponsable control={responsable} />}
      {guardar && <GuardarExtracto key={leido.token} leido={leido} banco={banco} bancoId={bancoId} responsable={responsable} />}
      {hayIzipay &&
        (izipay ? (
          <IzipayDelExtracto extracto={extracto} bancoId={bancoId} maquina={izipay} responsable={responsable} />
        ) : (
          <Aviso tono="atencion">El extracto trae abonos de Izipay, pero ninguna máquina llamada Izipay deposita en este banco: revísalo en Configuración ▸ Dinero.</Aviso>
        ))}
      {hayVendemas &&
        (vendemas ? (
          <LotesDeVendemas extracto={extracto} bancoId={bancoId} maquina={vendemas} responsable={responsable} />
        ) : (
          <Aviso tono="atencion">El extracto trae lotes de Vendemás, pero ninguna máquina llamada Vendemás deposita en este banco: revísalo en Configuración ▸ Dinero.</Aviso>
        ))}
    </div>
  );
}

/**
 * «Guardar este extracto» (ADR-0637): manda cada línea leída a la base, que la guarda tal como la dijo el banco y responde cuántas eran
 * nuevas, cuántas ya estaban y cuántas se confirmaron. No registra depósitos ni mueve plata. Guardado, el botón deja su lugar al resultado:
 * para volver a guardar hay que leer el archivo otra vez (un envío nuevo).
 *
 * Una línea guardada no se borra: antes del botón se dice de qué cuenta es el archivo (en qué termina), y esa cuenta viaja a la base, que
 * rechaza la de otro banco. Un archivo que mezcla dos cuentas, o un .txt que no dice la suya, no ofrece guardar.
 */
function GuardarExtracto({ leido, banco, bancoId, responsable }: { leido: Leido; banco: string; bancoId: string; responsable: ControlResponsable }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<ResultadoCarga | null>(null);
  const deQueCuenta = cuentaDelArchivo(leido.extracto, banco);

  async function guardar() {
    if (!deQueCuenta.ok) return;
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién lo hace (Responsable).");
      return;
    }
    setGuardando(true);
    let huella: string;
    try {
      huella = await huellaDeArchivo(leido.texto);
    } catch {
      setGuardando(false);
      avisar.error("Este navegador no pudo preparar el archivo para guardarlo. Actualiza la pantalla y vuelve a leerlo.");
      return;
    }
    const { data, error } = await firmar(
      createClient().rpc(
        "cargar_lineas_banco" as never,
        { p_cuenta_id: bancoId, p_fuente: fuenteDe(leido.extracto), p_lineas: paraCargar(leido.extracto), p_huella_archivo: huella, p_token: leido.token, p_cuenta_archivo: deQueCuenta.cuenta } as never,
      ) as never,
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "guardar el extracto"));
    const resultado = leerResultadoCarga(data);
    if (!resultado) return avisar.error("El extracto se guardó, pero no llegó el resumen. Actualiza la pantalla para ver lo que dice el banco.");
    const frase = fraseDeCarga(resultado);
    avisar.exito(frase.titulo, { detalle: frase.detalle ?? undefined });
    setGuardado(resultado);
    router.refresh();
  }

  if (guardado) {
    const frase = fraseDeCarga(guardado);
    return (
      <Aviso tono="exito" chico titulo={frase.titulo} guia="fin-conciliacion.guardar-extracto">
        {frase.detalle ? `${frase.detalle} ` : ""}Ya lo ves en «El banco dice» de {banco}.
      </Aviso>
    );
  }
  if (!deQueCuenta.ok) {
    return (
      <Aviso tono="error" chico titulo="Este archivo no se puede guardar" guia="fin-conciliacion.guardar-extracto">
        {deQueCuenta.motivo}
      </Aviso>
    );
  }
  return (
    <div className="space-y-2" data-guia="fin-conciliacion.guardar-extracto">
      <p className="text-sm text-tinta">{deQueCuenta.frase}</p>
      <span>
        <Boton type="button" peso="primario" cargando={guardando} onClick={() => void guardar()}>
          Guardar este extracto
        </Boton>
      </span>
      <p className="din-cuad-tenue">Guarda cada línea tal como la dijo el banco, para compararla con lo que anotaste. No registra depósitos ni mueve plata. Una línea guardada ya no se borra.</p>
    </div>
  );
}

const TONO: Record<PropuestaLote["estado"], "verde" | "ambar" | "pizarra"> = { cuadra: "verde", revisar: "ambar", sin_ventas: "pizarra", ya_registrado: "pizarra" };
const TEXTO_ESTADO: Record<PropuestaLote["estado"], string> = { cuadra: "Cuadra", revisar: "Revisar", sin_ventas: "Sin ventas por depositar", ya_registrado: "Ya registrado" };

/** Los lotes de Vendemás del extracto, cada uno con los días que cubre y su botón para registrarlo. */
function LotesDeVendemas({ extracto, bancoId, maquina, responsable }: { extracto: ExtractoLeido; bancoId: string; maquina: MaquinaDelBanco; responsable: ControlResponsable }) {
  const router = useRouter();
  const [datos, setDatos] = useState<{ pendientes: LotePendiente[]; registrados: DepositoRegistrado[] } | null>(null);
  const [falla, setFalla] = useState(false);
  const [guardando, setGuardando] = useState<number | null>(null);
  // Un token por línea: un doble clic o un reintento devuelve el mismo depósito, no uno nuevo (`registrar_abono_pos`).
  const tokens = useRef(new Map<number, string>());

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [pend, movs] = await Promise.all([
      supabase.rpc("fn_pos_pendientes" as never, { p_cuenta_id: maquina.cuentaId } as never),
      supabase.rpc("fn_movimientos_dinero" as never, { p_ubicacion_id: null, p_limite: 3000 } as never),
    ]);
    if (pend.error || movs.error) {
      setFalla(true);
      return;
    }
    const registrados = ((movs.data ?? []) as Record<string, unknown>[])
      .filter((m) => m.tipo === "abono_tarjeta" && m.estado === "vigente" && m.cuenta_origen_id === maquina.cuentaId && m.cuenta_destino_id === bancoId)
      .map((m) => ({ fecha: String(m.fecha), centimos: Math.round(Number(m.monto) * 100) }));
    setFalla(false);
    setDatos({ pendientes: ((pend.data ?? []) as Record<string, unknown>[]).map(leerLotePendiente), registrados });
  }, [maquina.cuentaId, bancoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la lectura llega una vez al abrir la sección, como el formulario del depósito
    void cargar();
  }, [cargar]);

  async function registrar(p: PropuestaLote) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién lo hace (Responsable).");
      return;
    }
    const token = tokens.current.get(p.linea.orden) ?? crypto.randomUUID();
    tokens.current.set(p.linea.orden, token);
    setGuardando(p.linea.orden);
    const { error } = await firmar(
      createClient().rpc(
        "registrar_abono_pos" as never,
        {
          p_cuenta_id: maquina.cuentaId,
          p_banco_id: bancoId,
          p_fecha: p.linea.fecha,
          p_neto: p.linea.centimos / 100,
          p_claves: p.dias.map((d) => d.clave),
          p_referencia: `Extracto: lote de ${maquina.nombre} del ${fechaCorta(p.linea.fecha)}`,
          p_token: token,
        } as never,
      ) as never,
      responsable.firma(),
    );
    setGuardando(null);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "registrar el depósito"));
    avisar.exito(`Depósito de ${maquina.nombre} registrado`, {
      detalle: p.comisionCentimos > 0 ? `La comisión real, ${solesDeCentimos(p.comisionCentimos)}, quedó como gasto bancario de la empresa.` : "Llegó completo: sin comisión.",
    });
    await cargar();
    router.refresh();
  }

  const propuestas = datos ? emparejarVendemas(extracto.lineas, datos.pendientes, datos.registrados) : [];
  return (
    <section className="space-y-3" data-guia="fin-conciliacion.vendemas" aria-label={`Lotes de ${maquina.nombre}`}>
      <TituloGrupo cuenta={propuestas.length}>{maquina.nombre}</TituloGrupo>
      {falla ? (
        <Aviso tono="error" accion={<Boton peso="fantasma" onClick={() => void cargar()}>Reintentar</Boton>}>
          No se pudo leer lo que {maquina.nombre} tiene por depositar.
        </Aviso>
      ) : !datos ? (
        <p className="din-cuad-tenue">Leyendo lo que {maquina.nombre} tiene por depositar…</p>
      ) : (
        <ul className="din-maq-lista">
          {propuestas.map((p) => (
            <li key={p.linea.orden} className="din-maq-it">
              <div className="din-maq-cab">
                <b className="text-sm font-semibold text-tinta">Llegó el {fechaCorta(p.linea.fecha)}</b>
                <span className="din-cuad-it-der">
                  <b className="din-cuad-num">{solesDeCentimos(p.linea.centimos)}</b>
                  <Chip tono={TONO[p.estado]} versalitas={false}>
                    {TEXTO_ESTADO[p.estado]}
                  </Chip>
                </span>
              </div>
              {p.dias.length > 0 && (
                <p className="din-cuad-tenue">
                  Cubre {p.dias.map((d) => `${fechaCorta(d.fecha)} · ${d.ubicacionNombre}`).join(", ")}: se cobraron {solesDeCentimos(p.brutoCentimos)}
                  {p.comisionCentimos >= 0 ? ` y la comisión es ${solesDeCentimos(p.comisionCentimos)}` : ""}.
                </p>
              )}
              {p.motivo && <p className="text-sm text-tinta">{p.motivo}</p>}
              {(p.estado === "cuadra" || (p.estado === "revisar" && p.comisionCentimos >= 0)) && (
                <span>
                  <Boton
                    type="button"
                    peso={p.estado === "cuadra" ? "primario" : "fantasma"}
                    cargando={guardando === p.linea.orden}
                    textoCargando="Registrando…"
                    disabled={guardando !== null}
                    onClick={() => void registrar(p)}
                  >
                    {p.estado === "cuadra" ? "Registrar el depósito" : "Registrar con esta comisión"}
                  </Boton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TEXTO_ORIGEN: Record<PagoMaquina["origen"], string> = { venta_pago: "venta", separacion_pago: "apartado", cambio: "cambio" };
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

/**
 * Izipay en el extracto: los QR sueltos de cada día con las ventas que los explican, los lotes de tarjeta con su tienda, y lo que no calza
 * dicho con nombre (lo que llegó sin venta y lo que se cobró y no llegó). Cada propuesta se registra con `registrar_abono_pos_pagos`.
 */
function IzipayDelExtracto({ extracto, bancoId, maquina, responsable }: { extracto: ExtractoLeido; bancoId: string; maquina: MaquinaDelBanco; responsable: ControlResponsable }) {
  const router = useRouter();
  const [pagos, setPagos] = useState<PagoMaquina[] | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const tokens = useRef(new Map<string, string>());

  // Tres días antes del extracto: el lote del lunes trae el viernes, y un QR de medianoche llega al día siguiente.
  const desde = extracto.desde ? new Date(Date.parse(`${extracto.desde}T12:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10) : null;
  const cargar = useCallback(async () => {
    if (!desde || !extracto.hasta) return;
    const { data, error } = await createClient().rpc("fn_pos_pagos_por_depositar" as never, { p_cuenta_id: maquina.cuentaId, p_desde: desde, p_hasta: extracto.hasta } as never);
    if (error) {
      setFalla(traducirError(error, "leer los pagos de la máquina"));
      return;
    }
    setFalla(null);
    setPagos(((data ?? []) as Record<string, unknown>[]).map(leerPagoMaquina));
  }, [maquina.cuentaId, desde, extracto.hasta]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la lectura llega una vez al abrir la sección, como el formulario del depósito
    void cargar();
  }, [cargar]);

  async function registrar(p: PropuestaIzipay) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién lo hace (Responsable).");
      return;
    }
    const token = tokens.current.get(p.clave) ?? crypto.randomUUID();
    tokens.current.set(p.clave, token);
    setGuardando(p.clave);
    const { error } = await firmar(
      createClient().rpc(
        "registrar_abono_pos_pagos" as never,
        {
          p_cuenta_id: maquina.cuentaId,
          p_banco_id: bancoId,
          p_fecha: p.fecha,
          p_neto: p.netoCentimos / 100,
          p_pagos: p.pagos.map((x) => ({ origen: x.origen, origen_id: x.origenId })),
          p_referencia: p.tipo === "qr" ? `Extracto: ${p.lineas.length} QR de ${maquina.nombre} del ${fechaCorta(p.fecha)}` : `Extracto: lote de tarjeta de ${maquina.nombre} del ${fechaCorta(p.fecha)}`,
          p_token: token,
        } as never,
      ) as never,
      responsable.firma(),
    );
    setGuardando(null);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "registrar el depósito"));
    const comision = p.brutoCentimos - p.netoCentimos;
    avisar.exito(`Depósito de ${maquina.nombre} registrado`, { detalle: comision > 0 ? `La comisión real, ${solesDeCentimos(comision)}, quedó como gasto bancario de la empresa.` : "Llegó completo: sin comisión." });
    await cargar();
    router.refresh();
  }

  if (falla)
    return (
      <Aviso tono="error" accion={<Boton peso="fantasma" onClick={() => void cargar()}>Reintentar</Boton>}>
        {falla}
      </Aviso>
    );
  if (!pagos) return <p className="din-cuad-tenue">Leyendo los pagos de {maquina.nombre}…</p>;
  const r = emparejarIzipay(extracto.lineas, pagos);
  const porRegistrar = r.propuestas.filter((p) => p.estado === "cuadra");
  return (
    <section className="space-y-3" data-guia="fin-conciliacion.izipay" aria-label={`Lo que llegó de ${maquina.nombre}`}>
      <TituloGrupo cuenta={porRegistrar.length}>{maquina.nombre}</TituloGrupo>
      {r.propuestas.length === 0 && r.sinVenta.length === 0 && r.sinLlegar.length === 0 && (
        <p className="din-cuad-tenue">{r.yaRegistradas.length > 0 ? "Todo lo de Izipay en este extracto ya está registrado." : `Nada de ${maquina.nombre} por registrar en este extracto.`}</p>
      )}
      <ul className="din-maq-lista">
        {r.propuestas.map((p) => (
          <li key={p.clave} className="din-maq-it">
            <div className="din-maq-cab">
              <b className="text-sm font-semibold text-tinta">
                {p.tipo === "qr" ? `${p.lineas.length} ${p.lineas.length === 1 ? "QR llegó" : "QR llegaron"} el ${fechaCorta(p.fecha)}` : `Lote de tarjeta del ${fechaCorta(p.fecha)}`}
              </b>
              <span className="din-cuad-it-der">
                <b className="din-cuad-num">{solesDeCentimos(p.netoCentimos)}</b>
                <Chip tono={TONO[p.estado]} versalitas={false}>
                  {TEXTO_ESTADO[p.estado]}
                </Chip>
              </span>
            </div>
            {p.pagos.length > 0 && (
              <p className="din-cuad-tenue">
                {[...new Set(p.pagos.map((x) => x.ubicacionNombre))].join(", ")}: se cobraron {solesDeCentimos(p.brutoCentimos)}
                {p.brutoCentimos > p.netoCentimos ? ` y la comisión es ${solesDeCentimos(p.brutoCentimos - p.netoCentimos)}` : ", sin comisión"}.
              </p>
            )}
            {p.motivo && <p className="text-sm text-tinta">{p.motivo}</p>}
            {p.estado === "cuadra" && (
              <span>
                <Boton type="button" peso="primario" cargando={guardando === p.clave} textoCargando="Registrando…" disabled={guardando !== null} onClick={() => void registrar(p)}>
                  Registrar el depósito
                </Boton>
              </span>
            )}
          </li>
        ))}
      </ul>
      {r.yaRegistradas.length > 0 && r.propuestas.length + r.sinVenta.length + r.sinLlegar.length > 0 && (
        <p className="din-cuad-tenue">
          {r.yaRegistradas.length === 1 ? "Un abono de este extracto ya tiene su depósito" : `${r.yaRegistradas.length} abonos de este extracto ya tienen su depósito`}.
        </p>
      )}
      {r.sinLlegar.length > 0 && (
        <Aviso tono="atencion" titulo={`${r.sinLlegar.length === 1 ? "Un QR se cobró y no llegó" : `${r.sinLlegar.length} QR se cobraron y no llegaron`}`}>
          {r.sinLlegar.map((x) => `${solesDeCentimos(x.montoCentimos)} · ${x.ubicacionNombre} · ${fechaCorta(x.fecha)} ${horaDe(x.hora)} (${TEXTO_ORIGEN[x.origen]})`).join("; ")}. Si
          nunca llegan, puede que el cliente no completó el pago, o que se cobró con otro medio: revísalo en la venta.
        </Aviso>
      )}
      {r.sinVenta.length > 0 && (
        <Aviso tono="atencion" titulo={`${r.sinVenta.length === 1 ? "Un abono llegó sin venta" : `${r.sinVenta.length} abonos llegaron sin venta`}`}>
          {r.sinVenta.map((l) => `${solesDeCentimos(l.centimos)} el ${fechaCorta(l.fecha)}`).join("; ")}. Casi siempre es un QR que se anotó como «Yape» u otro medio:
          corrige el pago de esa venta y vuelve a subir el extracto.
        </Aviso>
      )}
    </section>
  );
}
