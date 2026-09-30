"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, esRespuestaIncierta } from "@/lib/error-escritura";
import { finDePlazo, origenDelPlazo, plazoDeAccion, type AccionDecision, type TrasladoReciente } from "@/lib/frescura-decisiones-reglas";
import { avisoDeExito, opcionesDeDecision, textoErrorDecision, textoTrasladoElegible, trasladosDeLaPrenda, type OpcionDeDecision } from "@/lib/frescura-decisiones-pantalla";
import { hrefArmarTraslado, hrefExistencias, type AccesoFrescura } from "@/lib/frescura-pantalla";
import type { FrescuraPrenda, VaraCategoria } from "@/lib/frescura-reglas";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";

// «Ya decidí» (ADR-0208, paso 4b): la encargada anota qué hizo con una prenda que estaba «Por decidir». Vive DENTRO de la hoja
// de la prenda: la misma hoja cambia de contenido, no se abre un modal encima. Cuatro toques por prenda: «Ya decidí», la opción,
// (el responsable, ya elegido si es ella) y «Anotar».
//
// Lo que guarda es solo el HECHO (`retail.anotar_decision_frescura`, de solo agregar); si sirvió, cuándo vuelve y qué se sugiere
// después lo calcula la lectura. Un mal toque se corrige sin borrar nada: «Deshacer» durante 10 segundos en el aviso, y después
// «Quitar lo anotado» en la hoja. Nada de esto le pide una explicación a quien se equivocó.
//
// Guía de foco (ADR-0284): cada campo dice su estado y el que sigue se enciende; «Falta: …» sobre el botón, tocable. Lo requerido
// es lo mismo que apaga «Anotar»: qué hiciste y (si es «La trasladé») cuál traslado, y quién anota. La nota es opcional.

/** Sin respuesta en 20 s se corta y se trata como respuesta incierta: nunca queda la hoja bloqueada (como «Ajustar inventario»). */
const TOPE_ESPERA_MS = 20_000;
/** El «Deshacer» del aviso dura 10 segundos (Norman: el error es del diseño, no de la persona). */
const DURACION_DESHACER_MS = 10_000;

type Props = {
  prenda: FrescuraPrenda;
  sede: { id: string; nombre: string };
  esLider: boolean;
  ahora: string;
  categoria: VaraCategoria | undefined;
  cayla: VaraCategoria | undefined;
  recientes: readonly TrasladoReciente[];
  acceso: AccesoFrescura;
  /** La última línea de la libreta que vio la pantalla (null si estaba vacía): la base la compara al guardar. */
  anteriorId: string | null;
  /** «No, todavía no»: volver al detalle sin anotar. */
  onVolver: () => void;
  /** Se anotó: cerrar la hoja. */
  onListo: () => void;
};

export function FrescuraDecidir({ prenda, sede, esLider, ahora, categoria, cayla, recientes, acceso, anteriorId, onVolver, onListo }: Props) {
  const router = useRouter();
  const responsable = useResponsable();
  const [opcion, setOpcion] = useState<AccionDecision | "sacar" | null>(null);
  const [trasladoId, setTrasladoId] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ texto: string; conVer: boolean } | null>(null);
  // La marca de este toque: el mismo toque enviado dos veces (un corte de red y un reintento) devuelve lo ya guardado. Se
  // renueva solo cuando la base dijo que NO (nada se guardó); tras una respuesta incierta se conserva.
  const token = useRef<string>(crypto.randomUUID());
  const enVuelo = useRef(false);

  const traslados = trasladosDeLaPrenda(recientes, prenda.productoId, prenda.colorCodigo);
  const compromiso = origenDelPlazo(categoria, cayla);
  const opciones = opcionesDeDecision(prenda, {
    sede: sede.nombre,
    esLider,
    ahora,
    diasCompromiso: { dias: compromiso.dias, sePuedeCalcular: compromiso.origen !== "sin_referencia" },
    traslados,
    puedeVerTraslados: acceso.traslados,
    puedeVerExistencias: acceso.existencias,
  });
  const elegida = opciones.find((o) => o.clave === opcion) ?? null;
  const trasladoElegido = opcion === "traslade" ? (traslados.length === 1 ? traslados[0] : (traslados.find((t) => t.id === trasladoId) ?? null)) : null;

  const guia = useGuiaCampos([
    { id: "opcion", nombre: "Qué hiciste", requerido: true, hecho: opcion !== null, pendiente: "Elige qué hiciste con la prenda." },
    ...(opcion === "traslade"
      ? [{ id: "traslado", nombre: "El traslado", requerido: true, hecho: trasladoElegido !== null, pendiente: "Elige el traslado." }]
      : []),
    { id: "nota", nombre: "Nota", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
    { id: "responsable", nombre: "Quién anota", requerido: true, hecho: responsable.listo, pendiente: "Elige quién anota." },
  ]);

  const nombreDePrenda = `${prenda.productoNombre}${prenda.colorNombre ? ` ${prenda.colorNombre}` : ""}`;

  async function anotar() {
    if (enVuelo.current || opcion === null || opcion === "sacar" || !responsable.listo) return;
    if (opcion === "traslade" && trasladoElegido === null) return;
    const accion: AccionDecision = opcion;
    const firma = responsable.firma();
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    const plazo = plazoDeAccion(accion, categoria, cayla);
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    const { data, error: errorRpc } = await firmar(
      createClient()
        .rpc("anotar_decision_frescura", {
          p_token: token.current,
          p_ubicacion_id: sede.id,
          p_producto_id: prenda.productoId,
          p_color_codigo: prenda.colorCodigo,
          p_anterior_id: anteriorId,
          p_accion: accion,
          p_plazo_dias: plazo,
          p_transferencia_id: accion === "traslade" ? trasladoElegido!.id : null,
          p_nota: nota.trim() || null,
        })
        .abortSignal(control.signal),
      firma,
    );
    window.clearTimeout(tope);
    setEnviando(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      enVuelo.current = false;
      const t = textoErrorDecision(errorRpc, sede.nombre);
      setError({ texto: t.texto, conVer: t.conVer });
      // La base dijo que no: nada se guardó, la marca queda libre. Si fue una respuesta incierta se conserva.
      if (t.nuevaMarca && !esRespuestaIncierta(errorRpc)) token.current = crypto.randomUUID();
      // Con la red caída no se refresca: un refresh sin red borra el mensaje honesto.
      if (!esFalloDeRed(errorRpc) && errorRpc.hint === "version_cambiada") router.refresh();
      return;
    }
    const r = (data ?? {}) as { id?: string; creado_en?: string };
    const vence = finDePlazo(r.creado_en ?? new Date().toISOString(), plazo);
    const aviso = avisoDeExito(accion, nombreDePrenda, vence);
    avisar.exito(aviso.titulo, {
      detalle: aviso.detalle,
      duracion: DURACION_DESHACER_MS,
      accion: r.id ? { texto: "Deshacer", onClick: () => void deshacer(r.id!, firma, sede.nombre, router.refresh) } : undefined,
    });
    router.refresh();
    onListo();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void anotar();
      }}
      className="space-y-5"
    >
      <p className="text-[13.5px] leading-relaxed text-tinta/80">Elige lo que hiciste. Solo se anota: aquí no se mueve nada de stock ni se cambia ningún precio.</p>

      <CampoGuiado id="opcion" guia={guia} titulo="Qué hiciste con ella">
        <div role="radiogroup" aria-label="Qué hiciste con la prenda" className="grid gap-2">
          {opciones.map((o) => (
            <TarjetaOpcion key={o.clave} o={o} marcada={opcion === o.clave} onElegir={() => setOpcion(o.clave)}>
              {o.clave === "traslade" && !o.deshabilitada && opcion === "traslade" && traslados.length > 1 && (
                <div role="radiogroup" aria-label="Cuál traslado" className="mt-2 grid gap-1.5">
                  {traslados.map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-hueso px-3 py-2 text-[13px]">
                      <input type="radio" name="traslado" checked={trasladoElegido?.id === t.id} onChange={() => setTrasladoId(t.id)} className="mt-0.5" />
                      <span>{textoTrasladoElegible(t, ahora)}</span>
                    </label>
                  ))}
                </div>
              )}
              {o.clave === "traslade" && !o.deshabilitada && opcion === "traslade" && traslados.length === 1 && (
                <p className="mt-2 rounded-lg bg-hueso px-3 py-2 text-[13px]">{textoTrasladoElegible(traslados[0], ahora)}</p>
              )}
              {o.clave === "traslade" && o.deshabilitada && o.motivo === "Armar el traslado" && hrefArmarTraslado(prenda) && acceso.traslados && (
                <Link href={hrefArmarTraslado(prenda)!} className="btn-cayla btn-secundario btn-chico mt-2 inline-flex">
                  Armar traslado
                </Link>
              )}
              {o.deshabilitada && o.clave === "traslade" && o.motivo && o.motivo !== "Armar el traslado" && <p className="mt-1.5 text-[12.5px] text-taupe">{o.motivo}</p>}
              {o.clave === "sacar" && opcion === "sacar" && hrefExistencias(prenda) && acceso.existencias && (
                <Link href={hrefExistencias(prenda)!} className="btn-cayla btn-secundario btn-chico mt-2 inline-flex">
                  Retirar del piso en Existencias
                </Link>
              )}
            </TarjetaOpcion>
          ))}
        </div>
      </CampoGuiado>

      {opcion !== "sacar" && (
        <>
          <CampoGuiado id="nota" guia={guia}>
            {notaAbierta ? (
              <CampoTexto
                etiqueta={guia.etiqueta("nota", "Nota (opcional)")}
                value={nota}
                maxLength={280}
                caja
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej.: la puse en la entrada, junto a la caja" // sugerir-fijo: ejemplo de dónde se movió la prenda; no depende de la acción, el producto ni la sede elegidos
              />
            ) : (
              <button type="button" className="btn-cayla btn-enlace text-[13px]" onClick={() => setNotaAbierta(true)}>
                + Agregar una nota
              </button>
            )}
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </CampoGuiado>
        </>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-hueso px-3.5 py-3 text-[13.5px] leading-relaxed">
          <p>{error.texto}</p>
          {error.conVer && (
            <button type="button" className="btn-cayla btn-enlace mt-1 text-[13px]" onClick={() => (setError(null), router.refresh())}>
              Ver
            </button>
          )}
        </div>
      )}

      {opcion === "sacar" ? (
        <p className="text-[13px] text-taupe">
          {elegida?.consecuencia} Cuando la retires, no hace falta anotar nada aquí.
        </p>
      ) : (
        <PieGuia guia={guia} listo="Todo listo para anotar." />
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-sand pt-4 sm:flex-row sm:justify-between">
        <button type="button" className="btn-cayla btn-sutil" onClick={onVolver} disabled={enviando}>
          No, todavía no
        </button>
        {opcion !== "sacar" && (
          <button
            type="submit"
            className={`btn-cayla btn-primario w-full sm:w-auto ${guia.claseConfirmar}`}
            disabled={enviando || !guia.puedeConfirmar || !responsable.listo}
            title={responsable.motivo ?? guia.frase ?? undefined}
          >
            {enviando ? "Anotando…" : "Anotar"}
          </button>
        )}
      </div>
    </form>
  );
}

/** Una opción como tarjeta: el título, lo que pasa si la eliges, y lo que necesite debajo. Un botón de radio de verdad por dentro. */
function TarjetaOpcion({ o, marcada, onElegir, children }: { o: OpcionDeDecision; marcada: boolean; onElegir: () => void; children?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${marcada ? "border-tinta bg-hueso" : "border-sand bg-papel"} ${o.deshabilitada ? "opacity-70" : ""}`}>
      <label className={`flex min-h-[44px] items-start gap-2.5 ${o.deshabilitada ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input type="radio" name="accion" value={o.clave} checked={marcada} disabled={o.deshabilitada} onChange={onElegir} className="mt-1" />
        <span>
          <span className="block text-[15px] font-semibold leading-tight">{o.titulo}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-taupe">{o.consecuencia}</span>
        </span>
      </label>
      {children}
    </div>
  );
}

/** «Deshacer» del aviso: agrega una anulación sin nota. Después de esto no hay otro deshacer: quitar lo anotado no se quita. */
async function deshacer(id: string, firma: Firma | null, sede: string, refrescar: () => void) {
  const { error } = await firmar(createClient().rpc("anular_decision_frescura", { p_token: crypto.randomUUID(), p_decision_id: id, p_nota: null }), firma);
  if (error) avisar.error(textoErrorDecision(error, sede).texto);
  else avisar.exito("Quitado: la prenda vuelve a «Por decidir» si sigue quieta");
  refrescar();
}

/** «Quitar lo anotado»: la confirmación en el mismo lugar, con una nota opcional. Agrega una anulación; no borra nada. */
export function FrescuraQuitar({ decisionId, sede, onNo, onListo }: { decisionId: string; sede: { id: string; nombre: string }; onNo: () => void; onListo: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string>(crypto.randomUUID());
  const enVuelo = useRef(false);
  const guia = useGuiaCampos([
    { id: "nota", nombre: "Qué pasó", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
    { id: "responsable", nombre: "Quién lo quita", requerido: true, hecho: responsable.listo, pendiente: "Elige quién lo quita." },
  ]);

  async function quitar() {
    if (enVuelo.current || !responsable.listo) return;
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    const { error: errorRpc } = await firmar(
      createClient().rpc("anular_decision_frescura", { p_token: token.current, p_decision_id: decisionId, p_nota: nota.trim() || null }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      enVuelo.current = false;
      const t = textoErrorDecision(errorRpc, sede.nombre);
      setError(t.texto);
      if (t.nuevaMarca && !esRespuestaIncierta(errorRpc)) token.current = crypto.randomUUID();
      if (!esFalloDeRed(errorRpc) && errorRpc.hint === "version_cambiada") router.refresh();
      return;
    }
    avisar.exito("Quitado: la prenda vuelve a «Por decidir» si sigue quieta");
    router.refresh();
    onListo();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void quitar();
      }}
      className="space-y-4 rounded-xl border border-sand bg-papel px-3.5 py-3.5"
    >
      <p className="text-[14px] font-semibold leading-snug">¿Quitar lo anotado?</p>
      <p className="text-[13px] leading-relaxed text-taupe">Vuelve a «Por decidir» si sigue quieta, y lo que se había anotado queda en el historial.</p>
      <CampoGuiado id="nota" guia={guia}>
        <CampoTexto etiqueta={guia.etiqueta("nota", "¿Qué pasó? (opcional)")} value={nota} maxLength={280} caja onChange={(e) => setNota(e.target.value)} />
      </CampoGuiado>
      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={enviando} />
      </CampoGuiado>
      {error && (
        <p role="alert" className="rounded-lg bg-hueso px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <PieGuia guia={guia} listo="Todo listo para quitarlo." />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-cayla btn-sutil" onClick={onNo} disabled={enviando}>
          No
        </button>
        <button type="submit" className={`btn-cayla btn-secundario ${guia.claseConfirmar}`} disabled={enviando || !guia.puedeConfirmar || !responsable.listo} title={responsable.motivo ?? guia.frase ?? undefined}>
          {enviando ? "Quitando…" : "Quitar"}
        </button>
      </div>
    </form>
  );
}
