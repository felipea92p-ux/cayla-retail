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
import { origenDelPlazo, plazoDeAccion, type AccionDecision, type TrasladoReciente } from "@/lib/frescura-decisiones-reglas";
import { opcionesDeDecision, textoErrorDecision, textoTrasladoElegible, trasladosDeLaPrenda, type OpcionDeDecision } from "@/lib/frescura-decisiones-pantalla";
import { hrefArmarTraslado, hrefExistencias, type AccesoFrescura } from "@/lib/frescura-pantalla";
import type { FrescuraPrenda, VaraCategoria } from "@/lib/frescura-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { useAnotarDecision } from "./useAnotarDecision";

// «Ya decidí» (ADR-0208, paso 4b): la encargada anota qué hizo con una prenda que estaba «Por decidir». Vive DENTRO de la hoja
// de la prenda: la misma hoja cambia de contenido, no se abre un modal encima. Cuatro toques por prenda: «Ya decidí», la opción,
// (el responsable, ya elegido si es ella) y «Anotar». Desde la actualización 2026-10-07, «La cambié de lugar» también se anota
// a un toque desde la fila, por el MISMO camino (`useAnotarDecision`): la hoja queda para elegir entre varias opciones, la nota
// y el responsable cuando no viene elegido.
//
// Lo que guarda es solo el HECHO (`retail.anotar_decision_frescura`, de solo agregar); si sirvió, cuándo vuelve y qué se sugiere
// después lo calcula la lectura. Un mal toque se corrige sin borrar nada: «Deshacer» durante 10 segundos en el aviso, y después
// «Quitar lo anotado» en la hoja. Nada de esto le pide una explicación a quien se equivocó.
//
// Guía de foco (ADR-0284): cada campo dice su estado y el que sigue se enciende; «Falta: …» sobre el botón, tocable. Lo requerido
// es lo mismo que apaga «Anotar»: qué hiciste y (si es «La trasladé») cuál traslado, y quién anota. La nota es opcional.

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
  /** La opción con que se abre (desde el botón de la fila cuando falta elegir quién anota); sin ella, ninguna marcada. */
  opcionInicial?: AccionDecision | null;
  /** «No, todavía no»: volver al detalle sin anotar. */
  onVolver: () => void;
  /** Se anotó: cerrar la hoja. */
  onListo: () => void;
};

export function FrescuraDecidir({ prenda, sede, esLider, ahora, categoria, cayla, recientes, acceso, anteriorId, opcionInicial = null, onVolver, onListo }: Props) {
  const router = useRouter();
  const anotador = useAnotarDecision(sede);
  const { responsable } = anotador;
  const [opcion, setOpcion] = useState<AccionDecision | "sacar" | null>(opcionInicial);
  const [trasladoId, setTrasladoId] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [notaAbierta, setNotaAbierta] = useState(false);
  const enviando = anotador.enviando !== null;
  const error = anotador.error;

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

  async function anotar() {
    if (opcion === null || opcion === "sacar" || !responsable.listo) return;
    if (opcion === "traslade" && trasladoElegido === null) return;
    const accion: AccionDecision = opcion;
    const listo = await anotador.anotar({
      prenda,
      anteriorId,
      accion,
      plazoDias: plazoDeAccion(accion, categoria, cayla),
      transferenciaId: accion === "traslade" ? trasladoElegido!.id : null,
      nota: nota.trim() || null,
    });
    if (listo) onListo();
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
            <button type="button" className="btn-cayla btn-enlace mt-1 text-[13px]" onClick={() => (anotador.limpiarError(), router.refresh())}>
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
