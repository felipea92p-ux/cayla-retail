"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Ayuda } from "@/components/Ayuda";
import { Aviso, AvisoNoSeDeshace } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { BotonVerMas } from "@/components/ui/VerMas";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import {
  RPC_CANCELAR_BARRIDO,
  RPC_CONFIRMAR_BARRIDO,
  RPC_PREVISUALIZAR_BARRIDO,
  camposGuiaConfirmar,
  dondeLaTiene,
  haceCuanto,
  leerResumenBarrido,
  leerVistaBarrido,
  textoDeError,
  textoDelResultado,
  type LineaDelBarrido,
  type ResumenBarrido,
  type VistaBarrido,
} from "@/lib/barrido-piso-reglas";

/* ====================================================================
   HojaConfirmar · revisar y confirmar el barrido del piso (ADR-0690, actividad 5)

   Antes de mover nada dice lo que va a pasar, con la MISMA cuenta que aplica la base (`previsualizar_barrido_piso`):
     · lo escaneado que el sistema tenía GUARDADO pasa al piso;
     · lo que el sistema creía COLGADO y nadie escaneó vuelve al almacén (por eso se marca «se escaneó todo lo colgado»);
     · lo que no está en la tienda no se crea: queda para «Por resolver», con dónde lo tiene el sistema;
     · lo que se vendió o se movió mientras se escaneaba no se toca.
   Confirmar mueve todo o nada con traslados internos (el total de la tienda no cambia) y cierra el barrido; la marca del intento se
   elige al abrir la hoja: un doble toque no confirma dos veces. «Descartar el barrido» no mueve nada (dos toques).
   ==================================================================== */

type Fila = { clave: string; titulo: string; detalle: string };

export function HojaConfirmar({
  barridoId,
  esperan,
  recientes,
  firma,
  listo,
  quien,
  onHecho,
  onClose,
}: {
  barridoId: string;
  /** Lecturas o apartados de ESTE celular que todavía no subieron: confirmar ahora los dejaría fuera. */
  esperan: number;
  /** Quiénes más escanearon hace un momento: su celular puede tener lecturas sin subir (desde aquí no se ven). */
  recientes: string | null;
  firma: () => Firma | null;
  listo: boolean;
  /** El nombre de quien está elegido (firma el barrido). */
  quien: string | null;
  /** El barrido se confirmó o se descartó: la pantalla se pone al día. */
  onHecho: () => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [token] = useState(() => crypto.randomUUID());
  const [vista, setVista] = useState<VistaBarrido | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [todo, setTodo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResumenBarrido | null>(null);
  const [descartar, setDescartar] = useState(false);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const guia = useGuiaCampos(camposGuiaConfirmar({ responsableListo: listo, todoEscaneado: todo }));

  // La cuenta se vuelve a leer al abrir, cuando lo de este celular termina de subir y cuando la base dice que cambió (barrido_cambio):
  // lo que se confirma es siempre lo que se ve (la huella lo hace cumplir en la base).
  const [vuelta, setVuelta] = useState(0);
  const [cambio, setCambio] = useState(false);
  const todoSubido = esperan === 0;
  useEffect(() => {
    let vivo = true;
    void supabase
      .rpc(RPC_PREVISUALIZAR_BARRIDO as never, { p_barrido_id: barridoId } as never)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) setFallo(textoDeError(error, "revisar el barrido"));
        else setVista(leerVistaBarrido(data));
      });
    return () => {
      vivo = false;
    };
  }, [supabase, barridoId, vuelta, todoSubido]);

  async function confirmar() {
    setEnviando(true);
    setFallo(null);
    const { data, error } = await firmar(
      supabase.rpc(
        RPC_CONFIRMAR_BARRIDO as never,
        { p_barrido_id: barridoId, p_token: token, p_todo_escaneado: todo, p_huella: vista?.huella ?? null } as never
      ),
      firma(),
    );
    setEnviando(false);
    if (error) {
      if (error.hint === "barrido_cambio") {
        // No se movió nada: se muestra la cuenta nueva y se confirma otra vez, mirándola.
        setCambio(true);
        setFallo(null);
        // Sin la cuenta vieja a la vista (ni su huella): «Confirmar» se apaga hasta que llega la nueva.
        setVista(null);
        setVuelta((n) => n + 1);
        return;
      }
      setFallo(textoDeError(error, "confirmar el barrido"));
      return;
    }
    setResultado(leerResumenBarrido((data as { resumen?: unknown } | null)?.resumen));
  }

  async function descartarBarrido() {
    setEnviando(true);
    const { error } = await firmar(supabase.rpc(RPC_CANCELAR_BARRIDO as never, { p_barrido_id: barridoId } as never), firma());
    setEnviando(false);
    if (error) {
      setFallo(textoDeError(error, "descartar el barrido"));
      setDescartar(false);
      return;
    }
    onHecho();
    onClose();
  }

  if (resultado) {
    return (
      <Modal titulo="Barrido confirmado" subtitulo={textoDelResultado(resultado)} conCerrar onClose={() => { onHecho(); onClose(); }}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TarjetaCifra etiqueta="En el piso" valor={resultado.despues.piso.toLocaleString("es-PE")}>
              Antes {resultado.antes.piso.toLocaleString("es-PE")}
            </TarjetaCifra>
            <TarjetaCifra etiqueta="En el almacén" valor={resultado.despues.almacen.toLocaleString("es-PE")}>
              Antes {resultado.antes.almacen.toLocaleString("es-PE")}
            </TarjetaCifra>
          </div>
          {resultado.prendasNoCargadas + resultado.aparte > 0 && (
            <p className="nota-cayla">
              {(resultado.prendasNoCargadas + resultado.aparte).toLocaleString("es-PE")} quedaron por resolver: no se movieron.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <BotonVer href="/inventario/movimientos">Ver en Movimientos</BotonVer>
          </div>
        </div>
      </Modal>
    );
  }

  const r = vista?.resumen;
  const grupos: { clave: string; titulo: string; porQue?: string; filas: Fila[] }[] = vista
    ? [
        { clave: "piso", titulo: "Pasan al piso", filas: filas(vista.lineas.filter((l) => l.alPiso > 0), (l) => `${l.alPiso} · estaban en el almacén`) },
        { clave: "almacen", titulo: "Vuelven al almacén", filas: filas(vista.lineas.filter((l) => l.alAlmacen > 0), (l) => `${l.alAlmacen} · nadie las escaneó colgadas`) },
        { clave: "no", titulo: "No están en la tienda", filas: filas(vista.lineas.filter((l) => l.noCargadas > 0), (l) => `${l.noCargadas} · ${dondeLaTiene(l)}`) },
        {
          clave: "movio",
          titulo: "Se quedan como están",
          porQue: "Alguien las vendió, trasladó o ajustó mientras se escaneaba: la cuenta ya no calza. Se corrigen en el próximo barrido.",
          filas: filas(vista.lineas.filter((l) => l.motivo === "se_movio"), () => "Se corrige en el próximo barrido"),
        },
        {
          clave: "duenos",
          titulo: "Se quedan como están · CAYLA y CLAURE",
          porQue: "En la misma fila hay prendas de CAYLA y de CLAURE, y el sistema no adivina de quién son las que se mueven. Muévelas en Existencias, eligiendo el dueño.",
          filas: filas(vista.lineas.filter((l) => l.motivo === "dos_duenos"), (l) => `${l.escaneadas} escaneadas · el sistema tiene ${l.piso} en el piso y ${l.almacen} en el almacén · se mueve en Existencias, eligiendo el dueño`),
        },
      ]
    : [];

  return (
    <Modal titulo="Revisar el barrido" subtitulo="Esto es lo que va a cambiar. Nada se mueve hasta que confirmes." tamano="ancha" onClose={onClose}>
      <div className="space-y-4">
        {fallo && <Aviso tono="error">{fallo}</Aviso>}
        {cambio && (
          <Aviso tono="atencion" titulo="La cuenta cambió">
            Alguien escaneó o quitó prendas mientras revisabas. Esta es la cuenta nueva: no se movió nada.
          </Aviso>
        )}
        {recientes && esperan === 0 && (
          <Aviso tono="atencion" titulo={`${recientes} ${recientes.includes(" y ") ? "escanearon" : "escaneó"} hace un momento`}>
            Espera a que su celular diga «Todo guardado» antes de confirmar.
          </Aviso>
        )}
        {esperan > 0 && (
          <Aviso tono="atencion" titulo="Falta subir lo de este celular">
            {esperan.toLocaleString("es-PE")} {esperan === 1 ? "lectura todavía no subió" : "lecturas todavía no subieron"}: confirma cuando diga «Todo guardado».
          </Aviso>
        )}
        {vista?.conteoAbierto && (
          <Aviso tono="atencion" titulo={`Hay un ${vista.conteoAbierto} abierto`}>
            Ciérralo o cancélalo en Conteo antes de confirmar.
          </Aviso>
        )}
        {!vista && !fallo && <p className="texto-detalle text-taupe">Revisando el barrido…</p>}

        {r && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TarjetaCifra etiqueta="Pasan al piso" valor={r.prendasAlPiso.toLocaleString("es-PE")} />
              <TarjetaCifra etiqueta="Vuelven al almacén" valor={r.prendasAlAlmacen.toLocaleString("es-PE")} />
              <TarjetaCifra etiqueta="No están en la tienda" valor={(r.prendasNoCargadas + r.aparte).toLocaleString("es-PE")} />
              <TarjetaCifra etiqueta="Se quedan como están" ayuda={<Ayuda titulo="Se quedan como están">Prendas que el barrido no mueve: cambiaron mientras se escaneaba, o mezclan dueños. Abajo dice cuáles.</Ayuda>} valor={(r.lineasSeMovieron + r.lineasDosDuenos).toLocaleString("es-PE")} />
            </div>
            <p className="texto-detalle text-taupe">
              Quedan {r.despues.piso.toLocaleString("es-PE")} en el piso y {r.despues.almacen.toLocaleString("es-PE")} en el almacén. El total de la tienda no
              cambia{vista?.ultimaLectura ? ` · última lectura ${haceCuanto(vista.ultimaLectura, new Date())}` : ""}.
            </p>

            <ul className="space-y-2">
              {grupos
                .filter((g) => g.filas.length > 0)
                .map((g) => (
                  <li key={g.clave} className="vd-placa rounded-[var(--radius-tarjeta,1rem)] p-3 sm:p-4">
                    <p className="text-[15px] text-tinta">
                      {g.titulo} · {g.filas.length.toLocaleString("es-PE")} {g.filas.length === 1 ? "talla" : "tallas"}
                      {g.porQue && (
                        <>
                          {" "}
                          <Ayuda titulo={g.titulo}>{g.porQue}</Ayuda>
                        </>
                      )}
                    </p>
                    <BotonVerMas
                      forma="enlace"
                      className="mt-1"
                      abierto={abiertos.has(g.clave)}
                      texto="Ver cuáles"
                      onCambiar={(a) =>
                        setAbiertos((s) => {
                          const n = new Set(s);
                          if (a) n.add(g.clave);
                          else n.delete(g.clave);
                          return n;
                        })
                      }
                    />
                    {abiertos.has(g.clave) && (
                      <ul className="mt-2 divide-y divide-tinta/10">
                        {g.filas.map((f) => (
                          <li key={f.clave} className="py-2">
                            <p className="text-sm text-tinta">{f.titulo}</p>
                            <p className="texto-detalle text-taupe">{f.detalle}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
            </ul>

            <CampoGuiado id="todo" guia={guia} titulo="Todo escaneado">
              {/* La etiqueta envuelve la casilla: tocar el texto la marca (en el celular se toca el texto, no el cuadradito). */}
              <label className="flex cursor-pointer items-start gap-3">
                <Casilla marcada={todo} onCambio={() => setTodo((t) => !t)} etiqueta="Se escaneó todo lo colgado" />
                <span className="text-[15px] text-tinta">Se escaneó todo lo colgado. Lo que nadie escaneó está guardado y vuelve al almacén.</span>
              </label>
            </CampoGuiado>
            <CampoGuiado id="responsable" guia={guia} titulo="Quién confirma">
              <p className="text-sm text-tinta">{quien ?? "Elige quién confirma arriba, en «Quién escanea»."}</p>
            </CampoGuiado>
          </>
        )}

        <PieGuia guia={guia} listo="Listo para confirmar." />
        {descartar ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-tinta">¿Descartar el barrido? No se mueve nada; lo escaneado queda en el historial.</span>
            <Boton peso="primario" className="btn-chico" cargando={enviando} textoCargando="Descartando…" onClick={() => void descartarBarrido()}>
              Sí, descartar
            </Boton>
            <Boton peso="fantasma" className="btn-chico" disabled={enviando} onClick={() => setDescartar(false)}>
              No
            </Boton>
          </div>
        ) : (
          <>
            <AvisoNoSeDeshace />
            <div className="pie-acciones pie-hoja-fijo">
              <Boton peso="peligro" className="mr-auto" disabled={enviando} onClick={() => setDescartar(true)}>
                Descartar el barrido
              </Boton>
              <Boton peso="fantasma" onClick={onClose} disabled={enviando}>
                Cancelar
              </Boton>
              <Boton
                peso="primario"
                cargando={enviando}
                textoCargando="Confirmando…"
                confirma={guia}
                disabled={enviando || !vista || esperan > 0 || Boolean(vista?.conteoAbierto) || vista?.resumen.escaneadas === 0}
                onClick={() => void confirmar()}
              >
                Confirmar barrido
              </Boton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function filas(lineas: LineaDelBarrido[], detalle: (l: LineaDelBarrido) => string): Fila[] {
  return lineas.map((l) => ({ clave: l.varianteId, titulo: l.prenda, detalle: detalle(l) }));
}
