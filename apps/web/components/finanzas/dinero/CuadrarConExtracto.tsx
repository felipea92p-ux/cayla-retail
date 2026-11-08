"use client";

// Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco: el extracto del banco donde depositan las máquinas (ADR-0629, Fase B). Se sube el .txt
// que exporta la banca, o se pega la tabla copiada de la web, y se ve qué trajo. Cada lote de Vendemás se empareja con los días que cubre y,
// con un toque, se registra como su depósito (`registrar_abono_pos`, el de siempre). El extracto no se guarda: se lee en el navegador
// (`lib/extracto-interbank.ts`) y se cierra con la hoja.

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
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { fechaCorta } from "@/lib/gastos-reglas";
import { leerLotePendiente, type LotePendiente } from "@/lib/cuentas-dinero-reglas";
import { leerExtracto, resumenExtracto, solesDeCentimos, type ExtractoLeido } from "@/lib/extracto-interbank";
import { emparejarVendemas, type DepositoRegistrado, type PropuestaLote } from "@/lib/emparejar-maquinas";

/** Una máquina que deposita en este banco: su puente («Por depositar …») y su nombre. */
export type MaquinaDelBanco = { cuentaId: string; nombre: string };

type Props = { banco: string; bancoId: string; maquinas: readonly MaquinaDelBanco[] };

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

function HojaExtracto({ banco, bancoId, maquinas, onCerrar }: Props & { onCerrar: () => void }) {
  const [extracto, setExtracto] = useState<ExtractoLeido | null>(null);
  const [pegado, setPegado] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  function leer(texto: string) {
    const e = leerExtracto(texto);
    if (e.lineas.length === 0) {
      setExtracto(null);
      setFallo("No encontré movimientos en lo que trajiste. Sube el .txt que exporta la banca o copia la tabla entera, con sus montos.");
      return;
    }
    setFallo(null);
    setExtracto(e);
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    // El .txt de Interbank viene en Latin-1 (sin tildes hoy, pero un nombre con ñ se leería mal en UTF-8).
    leer(new TextDecoder("windows-1252").decode(await f.arrayBuffer()));
  }

  return (
    <Modal titulo={`El extracto de ${banco}`} subtitulo="Lo que llegó de las máquinas, tal como lo dice el banco. El extracto no se guarda." onClose={onCerrar} tamano="mediana" conCerrar>
      {extracto ? (
        <ResumenDelExtracto extracto={extracto} bancoId={bancoId} maquinas={maquinas} onOtro={() => setExtracto(null)} />
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

function ResumenDelExtracto({ extracto, bancoId, maquinas, onOtro }: { extracto: ExtractoLeido; bancoId: string; maquinas: readonly MaquinaDelBanco[]; onOtro: () => void }) {
  const resumen = resumenExtracto(extracto.lineas);
  const huecosAdentro = extracto.huecos.filter((h) => !h.enElBorde);
  const huecosBorde = extracto.huecos.filter((h) => h.enElBorde);
  // Vendemás se reconoce por su nombre: es la máquina cuyo lote el banco escribe «PAGO ESTABLECIMIENTOS».
  const vendemas = maquinas.find((m) => /vendem/i.test(m.nombre)) ?? null;
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
      {resumen.find((r) => r.tipo === "lote_vendemas")?.cuantas ? (
        vendemas ? (
          <LotesDeVendemas extracto={extracto} bancoId={bancoId} maquina={vendemas} />
        ) : (
          <Aviso tono="atencion">El extracto trae lotes de Vendemás, pero ninguna máquina llamada Vendemás deposita en este banco: revísalo en Configuración ▸ Dinero.</Aviso>
        )
      ) : null}
    </div>
  );
}

const TONO: Record<PropuestaLote["estado"], "verde" | "ambar" | "pizarra"> = { cuadra: "verde", revisar: "ambar", sin_ventas: "pizarra", ya_registrado: "pizarra" };
const TEXTO_ESTADO: Record<PropuestaLote["estado"], string> = { cuadra: "Cuadra", revisar: "Revisar", sin_ventas: "Sin ventas por depositar", ya_registrado: "Ya registrado" };

/** Los lotes de Vendemás del extracto, cada uno con los días que cubre y su botón para registrarlo. */
function LotesDeVendemas({ extracto, bancoId, maquina }: { extracto: ExtractoLeido; bancoId: string; maquina: MaquinaDelBanco }) {
  const router = useRouter();
  const responsable = useResponsable();
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
      <ComboResponsable control={responsable} deshabilitado={guardando !== null} />
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
