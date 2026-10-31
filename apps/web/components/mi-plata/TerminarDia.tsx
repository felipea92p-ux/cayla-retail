"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Check, Flag, Truck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { avisar } from "@/components/ui/Avisos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { terminarDia } from "@/lib/mi-plata-acciones";
import { EVENTO_MANDAR, decisionesCierre, faltaCuentaDeLaDevolucion, puedeCerrarLaRonda, resumenRonda, textoCierre, textoFaltaMandar, type DecisionCierre, type MiPlata } from "@/lib/mi-plata-reglas";
import { resumenDeEnvios, type EnvioMio } from "@/lib/mis-envios-reglas";
import { FichasCuenta } from "@/components/fondos/FichasCuenta";
import type { CuentaOpcion } from "@/lib/fondos-reglas";
import { FranjaFaltaMandar } from "./MandarATienda";

// Compras simple (ADR-0480): «Cerrar mi ronda» (antes «Terminé de comprar hoy», al que reemplaza desde 20261023183000; Felipe 2026-10-23).
// Arriba, la ronda abierta con su serie y número y lo que lleva. Al tocar, la cuenta de la ronda como un cuaderno (lo que tenías al
// abrirla, lo que te dieron, lo que compraste, lo que gastaste, lo que te queda) y una sola pregunta: qué haces con lo que te queda. Te lo
// quedas para la próxima ronda o lo devuelves en caja; si pusiste de tu bolsillo, no hay nada que elegir: CAYLA te lo devuelve. Lo que
// tenía lo calcula la base al tocar el botón (`terminar_dia_compras`, que conserva su nombre). Cerrada, no se reabre: se abre otra.
//
// Si todavía falta mandar algo a una tienda, lo recuerda arriba sin frenar: el fardo puede salir mañana.

type Plata = Pick<MiPlata, "tiene" | "hoy" | "ronda" | "porMandar">;

// Dos palabras cada una (opción A de docs/maquetas/mis-compras-cerrar-ronda-2026-10/, Felipe 2026-10-29: «hay mucho texto, se explican cosas que no
// son necesarias»): lo que sigue a cada elección ya lo dice el aviso al cerrar (`textoCierre`) y la bandeja de Compras.
const OPCIONES: Record<Exclude<DecisionCierre, "le_deben">, string> = {
  se_queda: "Me lo quedo",
  devuelve: "Lo devuelvo",
};

/** `envios`: los de la ronda abierta, para verlos antes de cerrarla (Felipe 2026-10-26); `null` si no se pudieron leer. */
export function TerminarDia({ plata, envios, hoy, cuentasDevolver = [] }: { plata: Plata; envios: EnvioMio[] | null; hoy?: string; cuentasDevolver?: CuentaOpcion[] }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  const ronda = plata.ronda.abierta;
  if (!ronda) return null;
  // El último paso del camino (maqueta mis-compras-pc-mesa, Felipe 2026-10-28): una franja que dice en qué está —si falta mandar algo, qué; si
  // no, que ya se puede cerrar— y el botón que abre la cuenta de la ronda. El botón siempre se puede tocar: la hoja es la que dice «Antes, manda».
  const falta = textoFaltaMandar(plata.porMandar);
  // Sin compras todavía, «todo está mandado» no dice nada: la ronda sigue abierta y se cierra cuando termine de comprar.
  const sinCompras = !falta && ronda.compras === 0;
  return (
    <section aria-label="Tu ronda de compras" className="card-cayla flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:px-5 lg:py-3.5">
      <p className="flex items-start gap-2.5 text-[15px] text-taupe lg:items-center">
        {falta ? (
          <Truck className="mt-0.5 h-4 w-4 shrink-0 lg:mt-0" aria-hidden />
        ) : sinCompras ? (
          <Flag className="mt-0.5 h-4 w-4 shrink-0 lg:mt-0" aria-hidden />
        ) : (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-verde lg:mt-0" aria-hidden />
        )}
        <span>
          {falta ? (
            <>
              <b className="font-semibold text-tinta">Último paso: cerrar la ronda.</b> Antes, manda: {falta.titulo.replace(/^Falta mandar /, "")}.
            </>
          ) : sinCompras ? (
            <>
              <b className="font-semibold text-tinta">Tu ronda sigue abierta.</b> Ciérrala cuando termines de comprar: Compras recibe la cuenta.
            </>
          ) : (
            <>
              <b className="font-semibold text-tinta">Todo está mandado.</b> Al cerrar, Compras recibe la cuenta de la ronda.
            </>
          )}
        </span>
      </p>
      <Boton
        peso={falta ? "fantasma" : "primario"}
        className="w-full lg:w-auto lg:min-w-60"
        data-guia="mi-plata.termine"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        {/* El ícono y el texto en una fila: sueltos, el botón los apilaba (el ícono arriba y el texto abajo, a doble alto). */}
        <span className="inline-flex items-center gap-2">
          <Flag className="h-4 w-4" aria-hidden />
          Cerrar mi ronda {ronda.texto}
        </span>
      </Boton>
      {abierta && <TerminarModal plata={plata} envios={envios} hoy={hoy} cuentasDevolver={cuentasDevolver} onClose={() => setAbierta(false)} volverA={origen} />}
    </section>
  );
}

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function TerminarModal({
  plata,
  envios,
  hoy,
  cuentasDevolver,
  onClose,
  volverA,
}: {
  plata: Plata;
  envios: EnvioMio[] | null;
  hoy?: string;
  cuentasDevolver: CuentaOpcion[];
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const opciones = decisionesCierre(plata.tiene);
  const sinElegir = opciones.length === 1;
  const [decision, setDecision] = useState<DecisionCierre | null>(sinElegir ? opciones[0] : null);
  // La cuenta de CAYLA a la que devolvió (Felipe 2026-10-29): solo con «Lo devuelvo»; no llega elegida, la compradora sabe dónde entregó.
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const d = resumenRonda(plata);
  const texto = plata.ronda.abierta?.texto ?? "";
  const falta = textoFaltaMandar(plata.porMandar);
  const sePuedeCerrar = puedeCerrarLaRonda(plata.porMandar);
  const faltaCuenta = faltaCuentaDeLaDevolucion(decision, cuentasDevolver, cuentaId);

  async function confirmar() {
    if (guardando || !decision || !sePuedeCerrar || faltaCuenta) return;
    setRechazo(null);
    setGuardando(true);
    const { error } = await terminarDia({ p_decision: decision, p_cuenta_indicada_id: decision === "devuelve" ? cuentaId : null }, firmaOmitida("compra_terminar_dia"));
    setGuardando(false);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "cerrar tu ronda"), tono: "error" },
      );
    }
    const cuenta = decision === "devuelve" ? cuentasDevolver.find((c) => c.id === cuentaId)?.nombre : null;
    avisar.exito(`Cerraste tu ronda ${texto}`, { detalle: `${textoCierre({ decision, monto: Math.abs(plata.tiene) })}${cuenta ? ` Cuenta: ${cuenta}.` : ""}` });
    onClose();
    router.refresh();
  }

  // Un renglón del cuaderno: lo que fue (con su detalle entre paréntesis, en el mismo renglón) y su monto.
  const fila = (titulo: string, monto: string, detalle?: string) => (
    <li>
      <span className="min-w-0">
        {titulo}
        {detalle && <span className="text-taupe"> ({detalle})</span>}
      </span>
      <span className="whitespace-nowrap tabular-nums">{monto}</span>
    </li>
  );

  return (
    <Modal
      titulo={`Cerrar mi ronda ${texto}`}
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
      bloqueado={guardando}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <ul className="compra-cuaderno" data-guia="mi-plata.cuaderno">
            {d.antes > 0 && fila("Tenías al abrirla", soles(d.antes))}
            {d.antes < 0 && fila("Pusiste de tu bolsillo antes", `− ${soles(-d.antes)}`)}
            {fila("Te dieron", `+ ${soles(d.dieron)}`)}
            {fila("Compraste", `− ${soles(d.compraste)}`, d.compras === 1 ? "1 compra" : `${d.compras} compras`)}
            {fila("Gastaste en otras cosas", `− ${soles(d.gastaste)}`)}
            <li className="compra-cuaderno-fin">
              <span>{d.queda < 0 ? "Pusiste de tu bolsillo" : "Te queda"}</span>
              <span className="whitespace-nowrap tabular-nums">{soles(Math.abs(d.queda))}</span>
            </li>
          </ul>

          {/* Los códigos a la vista antes de cerrar, por si hay que avisarle algo a una tienda. Uno «en camino» no frena el cierre. */}
          {envios && <EnviosAntesDeCerrar envios={envios} hoy={hoy} />}

          {/* Con prendas por mandar no se cierra (Felipe 2026-10-26): la franja lleva a «Mandar a la tienda» y «Cerrar» queda apagado. */}
          {falta && (
            <FranjaFaltaMandar
              antes
              falta={falta}
              onClick={() => {
                onClose();
                // Un tick después: la hoja de cierre ya se está yendo cuando «Mandar a la tienda» se abre.
                setTimeout(() => window.dispatchEvent(new Event(EVENTO_MANDAR)), 0);
              }}
            />
          )}

          {plata.tiene < 0 ? (
            <p className="nota-cayla text-sm">CAYLA te debe {soles(-plata.tiene)}. Compras lo ve y te lo devuelve.</p>
          ) : plata.tiene === 0 ? (
            <p className="nota-cayla text-sm">No te quedó plata: no hay nada que devolver.</p>
          ) : (
            <div className="flex flex-col gap-2" data-guia="mi-plata.decision">
              <TituloSeccion nivel={3}>¿Qué haces con lo que te queda?</TituloSeccion>
              <div role="group" aria-label="¿Qué haces con lo que te queda?" className="grid grid-cols-2 gap-2">
                {(["se_queda", "devuelve"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={decision === k}
                    disabled={guardando}
                    onClick={() => {
                      setRechazo(null);
                      setDecision(k);
                    }}
                    className={`card-cayla mov-boton rounded-2xl px-3 py-4 text-center font-medium text-tinta ${decision === k ? "border-tinta ring-1 ring-inset ring-tinta" : ""}`}
                  >
                    {OPCIONES[k]}
                  </button>
                ))}
              </div>
              {decision === "devuelve" && cuentasDevolver.length > 0 && (
                <div className="mt-2 flex flex-col gap-2" data-guia="mi-plata.cuenta-devolucion">
                  <TituloSeccion nivel={3}>¿A qué cuenta?</TituloSeccion>
                  <FichasCuenta
                    etiqueta="¿A qué cuenta de CAYLA lo devuelves?"
                    cuentas={cuentasDevolver}
                    valor={cuentaId ?? ""}
                    onValor={(id) => {
                      setRechazo(null);
                      setCuentaId(id);
                    }}
                    deshabilitado={guardando}
                  />
                </div>
              )}
            </div>
          )}

          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          {!sePuedeCerrar ? (
            <p className="text-sm text-taupe">Manda las prendas a la tienda y después cierras tu ronda.</p>
          ) : (
            (!decision ? (
              <p className="text-sm text-taupe">Elige qué haces con lo que te queda.</p>
            ) : (
              faltaCuenta && <p className="text-sm text-taupe">Elige a qué cuenta de CAYLA lo devuelves.</p>
            ))
          )}
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              textoCargando="Guardando…"
              disabled={!decision || !sePuedeCerrar || faltaCuenta}
              title={!sePuedeCerrar ? "Antes, manda las prendas a la tienda" : undefined}
              data-guia="mi-plata.terminar"
            >
              Cerrar la ronda
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * Los envíos de la ronda, en UNA línea (opción A de la maqueta, Felipe 2026-10-29): con uno o dos, sus códigos para avisarle a la tienda si hace
 * falta; con más, cuántos y cuántas prendas. El chip dice cómo va. Uno «en camino» no frena el cierre y se sigue viendo en Mis envíos. Solo se lee.
 */
function EnviosAntesDeCerrar({ envios, hoy }: { envios: EnvioMio[]; hoy?: string }) {
  const resumen = resumenDeEnvios(envios, hoy);
  const vivos = envios.filter((e) => e.estado !== "anulado");
  const prendas = vivos.reduce((t, e) => t + e.prendas, 0);
  const frase =
    vivos.length === 0
      ? "Sin envíos en esta ronda"
      : vivos.length <= 2
        ? `${vivos.map((e) => `${e.numero} ${e.destino.replace(/^Tienda /, "")}`).join(" · ")} · ${prendas} ${prendas === 1 ? "prenda" : "prendas"}`
        : resumen.texto;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-sand px-3.5 py-3 text-sm" data-guia="mi-plata.cerrar-envios">
      <span className="min-w-0 text-tinta">{frase}</span>
      {resumen.chip && <Chip tono={resumen.chip.tono}>{resumen.chip.texto}</Chip>}
    </div>
  );
}
