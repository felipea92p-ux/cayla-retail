"use client";

import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import {
  asignacionDeVista,
  LARGO_DETALLE_META,
  leerSoles,
  MOTIVOS_META,
  puedeEditarMeta,
  validarCambioMeta,
  type LecturaRitmo,
  type MotivoMeta,
  type PersonaMeta,
} from "@/lib/rendimiento-meta-reglas";
import { calendarioDelMes, filasConOtraMeta, hacePocoEnPalabras, medirPersona, suDiaFuerte, tramoEnPalabras, type FilaPersonaDia, type MedidaPersona, type Tramo } from "@/lib/rendimiento-vista-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const TONO: Record<LecturaRitmo, TonoChip> = { Adelante: "verde", "En ritmo": "pizarra", "Por debajo": "ambar" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

/* ====================================================================
   La fila que se abre en su lugar (ADR-0610, decisión 2: reemplaza al modal de la meta): su calendario, lo que va bien y su meta, sin salir de la tabla.
   Cambiar la meta sigue siendo `fijar_meta_persona`, con todo lo que ya pedía (ADR-0325, D-146 a D-148): el motivo queda en un historial que nadie edita; se
   manda la meta que se VIÓ, y si otra persona la cambió mientras tanto, la base lo dice en vez de pisarla; volver a la automática no pide motivo ni cifra.
   Lo nuevo es ver qué pasaría antes de guardar: su lectura y el reparto de la tienda se recalculan mientras se mueve la barra.
   ==================================================================== */

export function FilaAbierta({
  medida,
  persona,
  personas,
  filas,
  ubicacionId,
  ubicacionNombre,
  hoy,
  tramo,
  ahoraMin,
  metaSedeMes,
  color,
  personaCuentaId,
  esAdmin,
  cerrando,
  guiar,
  onDia,
  onCerrar,
}: {
  medida: MedidaPersona;
  /** `null`: vendió aquí pero no es del equipo. Se ve, y no tiene meta que cambiar. */
  persona: PersonaMeta | null;
  personas: readonly PersonaMeta[];
  /** Las filas de ESTA persona. */
  filas: readonly FilaPersonaDia[];
  ubicacionId: string;
  ubicacionNombre: string;
  hoy: string;
  tramo: Tramo;
  ahoraMin: number | null;
  metaSedeMes: number | null;
  color?: string;
  personaCuentaId: string | null;
  esAdmin: boolean;
  cerrando: boolean;
  guiar: boolean;
  onDia: (fecha: string) => void;
  onCerrar: () => void;
}) {
  const calendario = useMemo(() => calendarioDelMes(filas, hoy), [filas, hoy]);
  const fuerte = useMemo(() => suDiaFuerte(filas, hoy), [filas, hoy]);
  const texto = tramoEnPalabras(tramo, hoy);
  const prendasPorVenta = medida.ventas > 0 ? medida.prendas / medida.ventas : null;
  const unDia = tramo.desde === tramo.hasta;

  return (
    <div className="mesa-abierta" data-cerrando={cerrando ? "" : undefined} style={{ "--c": color } as CSSProperties}>
      <div>
        <div className="mesa-abierta-cuerpo">
          <section aria-label={`El mes de ${medida.nombre}`} data-guia={guiar ? "rendimiento.calendario" : undefined}>
            <h4 className="mesa-abierta-titulo">Su mes: toca un día</h4>
            <div className="mesa-calendario">
              {SEMANA.map((d, i) => (
                <span key={i} aria-hidden>
                  {d}
                </span>
              ))}
              {Array.from({ length: calendario.hueco }, (_, i) => (
                <span key={`h${i}`} aria-hidden />
              ))}
              {calendario.dias.map((d, i) => {
                const en = d.fecha >= tramo.desde && d.fecha <= tramo.hasta;
                const titulo = d.llego ? `${d.n} de ${MESES[Number(d.fecha.slice(5, 7)) - 1]}: ${SOLES.format(d.total)}` : "Todavía no llega";
                return (
                  <button
                    key={d.fecha}
                    type="button"
                    disabled={!d.llego}
                    title={titulo}
                    aria-label={titulo}
                    aria-pressed={unDia && d.fecha === tramo.desde}
                    data-en={en && !unDia ? "" : undefined}
                    data-fuerte={d.intensidad > 0.6 ? "" : undefined}
                    style={{ "--n": `${Math.round(d.intensidad * 86 + (d.total > 0 ? 8 : 0))}%`, "--k": i } as CSSProperties}
                    onClick={() => onDia(d.fecha)}
                  >
                    {d.n}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Lo que va bien" data-guia={guiar ? "rendimiento.va-bien" : undefined}>
            <h4 className="mesa-abierta-titulo">Lo que va bien</h4>
            <div className="mesa-va-bien">
              {medida.mejorDia ? (
                <p>
                  Su mejor día {texto === "este mes" ? "del mes" : `de ${texto}`} fue {hacePocoEnPalabras(medida.mejorDia.fecha, hoy)}, con <b>{SOLES.format(medida.mejorDia.total)}</b>.
                </p>
              ) : (
                <p>Todavía no vende {texto}.</p>
              )}
              {fuerte && (
                <p>
                  Vende más <b>{fuerte.dia}</b>: {fuerte.parte} % de lo suyo este mes.
                </p>
              )}
              {medida.ventas > 0 && (
                <p>
                  {medida.muestraChica ? (
                    <>
                      Lleva <b>{medida.ventas} ventas</b> {texto}: todavía es poco para asegurar su ticket.
                    </>
                  ) : (
                    <>
                      Su ticket es de <b>{SOLES.format(medida.ticket ?? 0)}</b>, con <b>{prendasPorVenta?.toLocaleString("es-PE", { maximumFractionDigits: 1 })}</b> prendas por venta.
                    </>
                  )}
                </p>
              )}
              {persona?.metaAjustadaMes != null && <p>Su meta del mes es ajustada: la automática sería {SOLES.format(persona.metaAutoMes ?? 0)}.</p>}
            </div>
          </section>

          {persona ? (
            <AjusteMeta
              key={persona.metaMes ?? "sin"}
              medida={medida}
              persona={persona}
              personas={personas}
              filas={filas}
              ubicacionId={ubicacionId}
              ubicacionNombre={ubicacionNombre}
              hoy={hoy}
              tramo={tramo}
              ahoraMin={ahoraMin}
              metaSedeMes={metaSedeMes}
              personaCuentaId={personaCuentaId}
              esAdmin={esAdmin}
              guiar={guiar}
              onCerrar={onCerrar}
            />
          ) : (
            <section>
              <h4 className="mesa-abierta-titulo">Su meta</h4>
              <p className="mesa-va-bien">Vendió aquí pero no es del equipo de esta tienda: no tiene meta que cambiar.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function AjusteMeta({
  medida,
  persona,
  personas,
  filas,
  ubicacionId,
  ubicacionNombre,
  hoy,
  tramo,
  ahoraMin,
  metaSedeMes,
  personaCuentaId,
  esAdmin,
  guiar,
  onCerrar,
}: {
  medida: MedidaPersona;
  persona: PersonaMeta;
  personas: readonly PersonaMeta[];
  filas: readonly FilaPersonaDia[];
  ubicacionId: string;
  ubicacionNombre: string;
  hoy: string;
  tramo: Tramo;
  ahoraMin: number | null;
  metaSedeMes: number | null;
  personaCuentaId: string | null;
  esAdmin: boolean;
  guiar: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const permiso = puedeEditarMeta({ personaFilaId: persona.personaId, personaCuentaId, esAdmin, metaSedeMes, metaAutoMes: persona.metaAutoMes });
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionNombre });
  const metaActual = persona.metaMes ?? 0;
  const ajustada = persona.metaAjustadaMes !== null;
  const [metaTexto, setMetaTexto] = useState(metaActual > 0 ? String(Math.round(metaActual)) : "");
  const [motivo, setMotivo] = useState<MotivoMeta | "">("");
  const [detalle, setDetalle] = useState("");
  const [volver, setVolver] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);

  const mes = `${hoy.slice(0, 7)}-01`;
  const mesEtiqueta = MESES[Number(hoy.slice(5, 7)) - 1];
  const metaLeida = leerSoles(metaTexto);
  const metaValida = Number.isFinite(metaLeida) && metaLeida > 0;
  const cambio = !volver && metaValida && Math.round(metaLeida) !== Math.round(metaActual);
  const hacia = volver ? (persona.metaAutoMes ?? metaActual) : metaValida ? metaLeida : metaActual;

  // Qué pasaría: su lectura con esa meta, y el reparto de la tienda.
  const lecturaNueva = useMemo(
    () =>
      medirPersona({
        personaId: medida.personaId,
        nombre: medida.nombre,
        filas: filasConOtraMeta(filas, hoy, metaActual, hacia),
        tramo,
        hoy,
        turno: persona,
        ahoraMin,
        metaMes: hacia,
      }).lectura,
    [medida.personaId, medida.nombre, filas, hoy, metaActual, hacia, tramo, persona, ahoraMin],
  );
  const reparto = useMemo(
    () => asignacionDeVista(personas.map((p) => (p.personaId === persona.personaId ? { ...p, metaMes: hacia } : p)), "mes", metaSedeMes),
    [personas, persona.personaId, hacia, metaSedeMes],
  );

  // Guía de foco (CLAUDE.md «Guía de foco»): el camino sale de lo que ya valida `validarCambioMeta`, sin reglas nuevas.
  const guia = useGuiaCampos([
    ...(volver
      ? []
      : [
          {
            id: "meta",
            nombre: "La meta del mes",
            requerido: true,
            hecho: metaValida && (metaSedeMes === null || metaLeida <= metaSedeMes) && Math.round(metaLeida) !== Math.round(metaActual),
            pendiente: "Mueve la barra o escribe la meta del mes.",
          },
          { id: "motivo", nombre: "El motivo", requerido: true, hecho: motivo !== "", pendiente: "Elige el motivo del cambio." },
          ...(motivo === "otro" ? [{ id: "detalle", nombre: "El motivo en una línea", requerido: true, hecho: detalle.trim() !== "", pendiente: "Cuenta el motivo en una línea." }] : []),
        ]),
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsable.listo, pendiente: "Elige quién hace esta operación." },
  ]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) setError(responsable.motivo);
      return;
    }
    if (!volver && !cambio) {
      setError("Primero cambia la meta.");
      return;
    }
    const v = validarCambioMeta({ metaTexto, volverAutomatica: volver, motivo, detalle, metaSedeMes });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    const { error: errorRpc } = await firmar(
      createClient().rpc("fijar_meta_persona", {
        p_persona_id: persona.personaId,
        p_ubicacion_id: ubicacionId,
        p_mes: mes,
        // Volver a la automática es una meta nula: la función lo entiende así y anota «automática» como motivo.
        p_meta: v.meta as number,
        p_motivo: v.motivo ?? "automatica",
        p_detalle: v.detalle ?? undefined,
        p_meta_esperada: persona.metaMes ?? undefined,
      }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(errorRpc);
    enVuelo.current = false;
    if (errorRpc) {
      // Las reglas de esta función vienen en castellano de CAYLA con un `hint` que empieza por «meta_».
      setError(errorRpc.hint?.startsWith("meta_") ? errorRpc.message : traducirError(errorRpc, "cambiar la meta"));
      // Si cambió mientras se editaba, se recarga para ver la vigente.
      if (errorRpc.hint === "meta_cambio_mientras_editabas") router.refresh();
      return;
    }
    avisar.exito(volver ? "Volvió a la meta automática" : "Meta cambiada", { detalle: `${persona.nombre} · ${mesEtiqueta}` });
    router.refresh();
    onCerrar();
  }

  const tope = metaSedeMes ?? Math.max(metaActual * 2, 1000);
  const minimo = Math.min(100, Math.round(metaActual / 2) || 100);
  const posicion = metaValida ? Math.min(tope, Math.max(minimo, metaLeida)) : minimo;

  if (!permiso.puede) {
    return (
      <section data-guia={guiar ? "rendimiento.meta-actual" : undefined}>
        <h4 className="mesa-abierta-titulo">Su meta de {mesEtiqueta}</h4>
        <p className="mesa-meta-cifra">{persona.metaMes !== null ? SOLES.format(persona.metaMes) : "Sin meta"}</p>
        <p className="mesa-va-bien">{permiso.motivo}.</p>
      </section>
    );
  }

  return (
    <form onSubmit={guardar} className="mesa-ajuste" aria-label={`Meta de ${persona.nombre}`} data-guia={guiar ? "rendimiento.meta-actual" : undefined}>
      <h4 className="mesa-abierta-titulo">Su meta de {mesEtiqueta}: mira qué pasaría</h4>

      {volver ? (
        <p className="nota-cayla sin-i">
          Vuelve a <b>{persona.metaAutoMes !== null ? SOLES.format(persona.metaAutoMes) : "la automática"}</b>, la que sale de sus horas programadas. Queda anotado en el historial.
        </p>
      ) : (
        <>
          <div data-guia={guiar ? "rendimiento.meta-campo" : undefined}>
            <CampoGuiado id="meta" guia={guia}>
              <CampoMonto
                etiqueta={guia.etiqueta("meta", `Meta de ${mesEtiqueta}`)}
                inputMode="decimal"
                autoComplete="off"
                value={metaTexto}
                onChange={(e) => {
                  setMetaTexto(e.target.value);
                  setError(null);
                }}
                disabled={enviando}
              />
              <input
                className="mesa-rango"
                type="range"
                min={minimo}
                max={tope}
                step={10}
                value={posicion}
                disabled={enviando}
                style={{ "--v": `${((posicion - minimo) / Math.max(1, tope - minimo)) * 100}%` } as CSSProperties}
                aria-label={`Meta de ${persona.nombre}`}
                aria-valuetext={SOLES.format(posicion)}
                onChange={(e) => {
                  setMetaTexto(e.target.value);
                  setError(null);
                }}
              />
            </CampoGuiado>
          </div>
        </>
      )}

      <p className="mesa-que-pasaria" aria-live="polite">
        {lecturaNueva ? (
          <>
            Iría <Chip tono={TONO[lecturaNueva]}>{lecturaNueva}</Chip>
          </>
        ) : (
          "Con esa meta, todavía no hay ritmo que leer."
        )}
        <span data-pasa={reparto.tipo === "pasa" ? "" : undefined}>
          {reparto.tipo === "sin_meta"
            ? "Sin meta de la tienda no hay qué repartir."
            : reparto.tipo === "cuadra"
              ? "El reparto de la tienda cuadra."
              : reparto.tipo === "faltan"
                ? `Quedan ${SOLES.format(reparto.diferencia)} sin repartir.`
                : `El reparto se pasa por ${SOLES.format(-reparto.diferencia)}.`}
        </span>
      </p>

      {!volver && (
        <>
          <div data-guia={guiar ? "rendimiento.meta-motivo" : undefined}>
            <CampoGuiado id="motivo" guia={guia}>
              <p className="campo-etiqueta">{guia.etiqueta("motivo", "Motivo del cambio")}</p>
              <div className="mesa-motivos" role="group" aria-label="Motivo del cambio">
                {MOTIVOS_META.map((m) => (
                  <button
                    key={m.valor}
                    type="button"
                    className="pildora-cayla"
                    aria-pressed={motivo === m.valor}
                    disabled={enviando}
                    onClick={() => {
                      setMotivo(m.valor);
                      setError(null);
                    }}
                  >
                    {m.valor === "otro" ? "Otro" : m.etiqueta}
                  </button>
                ))}
              </div>
            </CampoGuiado>
          </div>
          {motivo === "otro" && (
            <CampoGuiado id="detalle" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("detalle", "¿Cuál?")}
                value={detalle}
                onChange={(e) => {
                  setDetalle(e.target.value);
                  setError(null);
                }}
                maxLength={LARGO_DETALLE_META}
                placeholder="En una línea" // sugerir-fijo: pide el formato del detalle (una línea), no un ejemplo que dependa del motivo elegido
                disabled={enviando}
              />
            </CampoGuiado>
          )}
        </>
      )}

      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={enviando} />
      </CampoGuiado>

      {ajustada && (
        <button
          type="button"
          className="btn-cayla btn-enlace self-start"
          disabled={enviando}
          onClick={() => {
            setVolver((v) => !v);
            setError(null);
          }}
        >
          {volver ? "Prefiero poner una cifra" : "Volver a la meta automática"}
        </button>
      )}

      {error && (
        <Aviso tono="error" chico>
          {error}
        </Aviso>
      )}
      <PieGuia guia={guia} listo="Todo listo para guardar." />
      <div className="pie-acciones" data-guia={guiar ? "rendimiento.meta-guardar" : undefined}>
        <Boton type="button" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton type="submit" peso="primario" cargando={enviando} disabled={!responsable.listo} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
          Guardar
        </Boton>
      </div>
    </form>
  );
}
