"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { avisar } from "@/components/ui/Avisos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { terminarDia } from "@/lib/mi-plata-acciones";
import { decisionesCierre, resumenDia, textoCierre, textoPorMandar, type DecisionCierre, type MiPlata } from "@/lib/mi-plata-reglas";

// Compras simple (ADR-0480, actividad 5): «Terminé de comprar hoy». La cuenta del día como un cuaderno (lo que tenías, lo que te dieron,
// lo que compraste, lo que gastaste, lo que te queda) y una sola pregunta: qué haces con lo que te queda. Te lo quedas para la próxima
// compra o lo devuelves en caja; si pusiste de tu bolsillo, no hay nada que elegir: CAYLA te lo devuelve. Lo que tenía lo calcula la base
// al tocar el botón (`terminar_dia_compras`). Se puede volver a cerrar el mismo día, si siguió comprando, hasta que Compras lo recibe.
//
// Si todavía falta mandar algo a una tienda, lo recuerda arriba sin frenar: el fardo puede salir mañana.

type Plata = Pick<MiPlata, "tiene" | "hoy" | "porMandar">;

const OPCIONES: Record<Exclude<DecisionCierre, "le_deben">, { nombre: string; detalle: string }> = {
  se_queda: { nombre: "Me lo quedo para mi próxima compra", detalle: "Sigue siendo plata de CAYLA para comprar" },
  devuelve: { nombre: "Lo devuelvo hoy", detalle: "Lo entregas en caja y Compras lo recibe" },
};

export function TerminarDia({ plata }: { plata: Plata }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  const cierre = plata.hoy.cierre;
  return (
    <section className="flex flex-col gap-2">
      {cierre && (
        <p className="nota-cayla text-sm">
          Terminaste por hoy. {textoCierre(cierre)}
        </p>
      )}
      {!cierre?.resuelto && (
        <Boton
          peso="fantasma"
          className="w-full"
          data-guia="mi-plata.termine"
          onClick={(e) => {
            origen.current = e.currentTarget;
            setAbierta(true);
          }}
        >
          <Moon className="h-4 w-4" aria-hidden />
          {cierre ? "Volver a terminar por hoy" : "Terminé de comprar hoy"}
        </Boton>
      )}
      {abierta && <TerminarModal plata={plata} onClose={() => setAbierta(false)} volverA={origen} />}
    </section>
  );
}

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function TerminarModal({ plata, onClose, volverA }: { plata: Plata; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const opciones = decisionesCierre(plata.tiene);
  const sinElegir = opciones.length === 1;
  const [decision, setDecision] = useState<DecisionCierre | null>(sinElegir ? opciones[0] : null);
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const d = resumenDia(plata);
  const falta = textoPorMandar(plata.porMandar);

  async function confirmar() {
    if (guardando || !decision) return;
    setRechazo(null);
    setGuardando(true);
    const { error } = await terminarDia({ p_decision: decision }, firmaOmitida("compra_terminar_dia"));
    setGuardando(false);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "terminar el día"), tono: "error" },
      );
    }
    avisar.exito("Listo, terminaste por hoy", { detalle: textoCierre({ decision, monto: Math.abs(plata.tiene) }) });
    onClose();
    router.refresh();
  }

  // Un renglón del cuaderno: lo que fue (con su detalle entre paréntesis, en el mismo renglón) y su monto.
  const fila = (titulo: string, monto: string, detalle?: string) => (
    <li>
      <span className="min-w-0 truncate">
        {titulo}
        {detalle && <span className="text-taupe"> ({detalle})</span>}
      </span>
      <span className="whitespace-nowrap tabular-nums">{monto}</span>
    </li>
  );

  return (
    <Modal
      titulo="Terminé de comprar hoy"
      subtitulo="Revisa tu plata y di qué haces con lo que te queda."
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
            {d.antes > 0 && fila("Te quedó de antes", soles(d.antes))}
            {d.antes < 0 && fila("Pusiste de tu bolsillo antes", `− ${soles(-d.antes)}`)}
            {fila("Te dieron hoy", `+ ${soles(d.dieron)}`)}
            {fila("Compraste", `− ${soles(d.compraste)}`, plata.hoy.compras === 1 ? "1 compra" : `${plata.hoy.compras} compras`)}
            {fila("Gastaste en otras cosas", `− ${soles(d.gastaste)}`)}
            <li className="compra-cuaderno-fin">
              <span>{d.queda < 0 ? "Pusiste de tu bolsillo" : "Te queda"}</span>
              <span className="whitespace-nowrap tabular-nums">{soles(Math.abs(d.queda))}</span>
            </li>
          </ul>

          {falta && (
            <Aviso tono="atencion" titulo="Antes, manda a la tienda" chico>
              {falta}. Puedes terminar igual y mandarlo después.
            </Aviso>
          )}

          {plata.tiene < 0 ? (
            <p className="nota-cayla text-sm">CAYLA te debe {soles(-plata.tiene)}. Compras lo ve y te lo devuelve.</p>
          ) : plata.tiene === 0 ? (
            <p className="nota-cayla text-sm">No te quedó plata: no hay nada que devolver.</p>
          ) : (
            <div className="flex flex-col gap-2" data-guia="mi-plata.decision">
              <TituloSeccion nivel={3}>¿Qué haces con lo que te queda?</TituloSeccion>
              <div role="group" aria-label="¿Qué haces con lo que te queda?" className="flex flex-col gap-2">
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
                    className={`card-cayla mov-boton grid grid-cols-[22px_minmax(0,1fr)] gap-3 rounded-2xl p-3.5 text-left ${decision === k ? "border-tinta ring-1 ring-inset ring-tinta" : ""}`}
                  >
                    {/* El círculo de una respuesta de radio (la maqueta): se llena de tinta al elegirla. */}
                    <span
                      aria-hidden
                      className={`mt-0.5 h-[22px] w-[22px] rounded-full border-taupe transition-[border-width] duration-200 ${decision === k ? "border-[7px] border-tinta" : "border-[1.5px]"}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-tinta">{OPCIONES[k].nombre}</span>
                      <span className="block text-[12.5px] text-taupe">{OPCIONES[k].detalle}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          {!decision && <p className="text-xs text-taupe">Elige qué haces con lo que te queda.</p>}
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Guardando…" disabled={!decision} data-guia="mi-plata.terminar">
              Terminar por hoy
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
