"use client";

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TablaViva, type ColumnaViva, type FiltroDeAfuera, type TablaVivaEstado } from "@/components/ui/TablaViva";
import { UMBRAL_MUESTRA_VENTAS } from "@/lib/rendimiento-reglas";
import { turnoDeHoy, type LecturaRitmo, type PersonaMeta } from "@/lib/rendimiento-meta-reglas";
import { filasPorPersona, type FilaPersonaDia, type MedidaPersona, type Tramo } from "@/lib/rendimiento-vista-reglas";
import type { Sustantivo } from "@/lib/tabla-viva-reglas";

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const NUMERO = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const PERSONA: Sustantivo = { uno: "persona", varios: "personas", genero: "f" };
const TONO: Record<LecturaRitmo, TonoChip> = { Adelante: "verde", "En ritmo": "pizarra", "Por debajo": "ambar" };
const ORDEN_LECTURA: Record<LecturaRitmo, number> = { Adelante: 3, "En ritmo": 2, "Por debajo": 1 };

/**
 * Al ordenar o filtrar, las filas viajan a su nuevo lugar y las que llegan aparecen (ADR-0610): se mide dónde estaba cada una contra la tabla, no contra la
 * pantalla, para que bajar con la rueda entre dos cambios no las haga saltar. No toca TablaViva: solo mira sus filas. Con «reducir movimiento», nada.
 */
function useFilasQueViajan(firma: string) {
  const zona = useRef<HTMLDivElement>(null);
  const antes = useRef<Map<string, number> | null>(null);
  useLayoutEffect(() => {
    const raiz = zona.current;
    if (!raiz) return;
    const base = raiz.getBoundingClientRect().top;
    const filas = [...raiz.querySelectorAll<HTMLElement>(".tv-fila[data-fila]")];
    const ahora = new Map(filas.map((f) => [f.dataset.fila ?? "", f.getBoundingClientRect().top - base]));
    const previo = antes.current;
    if (previo && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const curva = getComputedStyle(raiz).getPropertyValue("--ease-cayla") || "ease-out";
      for (const f of filas) {
        const id = f.dataset.fila ?? "";
        const era = previo.get(id);
        const es = ahora.get(id) ?? 0;
        if (era === undefined) f.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: curva });
        else if (Math.abs(era - es) > 0.5) f.animate([{ transform: `translateY(${era - es}px)` }, { transform: "none" }], { duration: 560, easing: curva });
      }
    }
    antes.current = ahora;
  }, [firma]);
  return zona;
}

/** Las columnas de la tabla, con lo de CADA tienda: sus colores, sus turnos y sus días. */
export function useColumnasRendimiento({
  personas,
  filas,
  colores,
  tramo,
  hoy,
  esHoy,
  personaCuentaId,
  conMeta,
  diaVivo,
  abiertaId,
}: {
  personas: readonly PersonaMeta[];
  filas: readonly FilaPersonaDia[];
  colores: ReadonlyMap<string, string>;
  tramo: Tramo;
  hoy: string;
  esHoy: boolean;
  personaCuentaId: string | null;
  conMeta: boolean;
  /** El día que se señala en el gráfico: cada fila dice lo que vendió ese día. */
  diaVivo: string | null;
  abiertaId: string | null;
}): ColumnaViva<MedidaPersona>[] {
  return useMemo(() => {
    const porId = new Map(personas.map((p) => [p.personaId, p]));
    const dias = filasPorPersona(filas);
    const inicio = `${hoy.slice(0, 7)}-01`;
    const totalTramo = filas.reduce((s, f) => (f.fecha >= tramo.desde && f.fecha <= tramo.hasta ? s + f.total : s), 0);
    const columnas: ColumnaViva<MedidaPersona>[] = [
      {
        clave: "persona",
        titulo: "Persona",
        tipo: "texto",
        principal: true,
        alinear: "izquierda",
        filtra: true,
        ancho: "minmax(170px,1.1fr)",
        valor: (m) => m.nombre,
        frase: (v) => v.map((n) => n.split(" ")[0]).join(", "),
        celda: (m, { debajo }) => {
          const p = porId.get(m.personaId);
          const turno = esHoy && p ? turnoDeHoy(p) : null;
          return (
            <span className="mesa-fila-persona" style={{ "--c": colores.get(m.personaId) } as CSSProperties}>
              <AvatarPersona personaId={m.personaId} nombre={m.nombre} tamano={32} />
              <span className="min-w-0">
                <span className="mesa-fila-nombre">
                  {/* El botón es para el teclado: su clic sube a la fila, que es la que abre (TablaViva). */}
                  <button type="button" className="mesa-fila-abrir tv-dato" aria-expanded={abiertaId === m.personaId}>
                    {m.nombre}
                  </button>
                  {p?.esEncargada && (
                    <Chip tono="pizarra" versalitas={false}>
                      Encargada
                    </Chip>
                  )}
                  {personaCuentaId === m.personaId && (
                    <Chip tono="neutro" versalitas={false}>
                      tú
                    </Chip>
                  )}
                </span>
                {turno && <span className="tv-sub">{turno}</span>}
                {debajo}
              </span>
            </span>
          );
        },
      },
    ];
    if (conMeta)
      columnas.push({
        clave: "lectura",
        titulo: "Cómo va",
        tipo: "texto",
        filtra: true,
        sinNombreEnTarjeta: true,
        ancho: "116px",
        ayuda: "10 % arriba o abajo de lo que tocaba; en Hoy y en los primeros días, con más holgura. Es para reconocer y acompañar.",
        textosOrden: { asc: "Por debajo primero", desc: "Adelante primero" },
        valor: (m) => (m.lectura ? ORDEN_LECTURA[m.lectura] : null),
        opcion: (m) => m.lectura,
        ordenOpciones: ["Adelante", "En ritmo", "Por debajo"],
        frase: (v) => v.map((l) => l.toLowerCase()).join(" o "),
        dibujarOpcion: (v) => <Chip tono={TONO[v as LecturaRitmo]}>{v}</Chip>,
        celda: (m) => (m.lectura ? <Chip tono={TONO[m.lectura]}>{m.lectura}</Chip> : <span className="tv-sub">{porId.get(m.personaId)?.base === "iguales" ? "Sin horarios" : "—"}</span>),
      });
    columnas.push(
      {
        clave: "avance",
        titulo: conMeta ? "Avance" : "De la tienda",
        tipo: "numero",
        sinNombreEnTarjeta: true,
        ancho: "minmax(150px,1.5fr)",
        ayuda: conMeta ? "Lo vendido contra su meta. La rayita es lo que tocaba hasta ahora." : "Su parte de lo vendido en la tienda.",
        // Sin meta en la tienda, la columna dice su parte de lo vendido: un dato, no una meta inventada.
        valor: (m) => (conMeta ? m.pct : m.vendido),
        celda: (m) => <CeldaAvance m={m} color={colores.get(m.personaId)} parteDe={conMeta ? null : totalTramo} />,
        suma: (v) => {
          const meta = v.reduce((s, m) => s + (m.meta ?? 0), 0);
          const vendido = v.reduce((s, m) => s + m.vendido, 0);
          return meta > 0 ? (
            <>
              <CifraAnimada valor={Math.round((vendido / meta) * 100)} /> %
            </>
          ) : null;
        },
      },
      {
        clave: "vendido",
        titulo: "Vendido",
        tipo: "monto",
        ancho: "108px",
        destacadaEnTarjeta: true,
        valor: (m) => m.vendido,
        texto: (m) => SOLES.format(m.vendido),
        celda: (m) => (
          <>
            <CifraAnimada valor={m.vendido} formato="soles-redondo" />
            {diaVivo ? (
              <span className="tv-sub mesa-dia-vivo">
                Día {Number(diaVivo.slice(8, 10))}: {SOLES.format((dias.get(m.personaId) ?? []).find((f) => f.fecha === diaVivo)?.total ?? 0)}
              </span>
            ) : (
              <span className="tv-sub">
                {NUMERO.format(m.ventas)} {plural(m.ventas, "venta", "ventas")}
              </span>
            )}
          </>
        ),
        suma: (v) => SOLES.format(v.reduce((s, m) => s + m.vendido, 0)),
      },
    );
    if (conMeta)
      columnas.push({
        clave: "meta",
        titulo: "Meta",
        tipo: "monto",
        ancho: "100px",
        seVa: 1060,
        valor: (m) => m.meta,
        texto: (m) => (m.meta !== null ? SOLES.format(m.meta) : "—"),
        resumen: (m) => (m.meta !== null ? `Meta ${SOLES.format(m.meta)}` : "Sin meta"),
        celda: (m) => {
          const p = porId.get(m.personaId);
          return (
            <>
              {m.meta !== null ? <CifraAnimada valor={m.meta} formato="soles-redondo" /> : "—"}
              {p?.metaAjustadaMes != null ? (
                <span className="tv-sub">
                  <Chip tono="ambar" versalitas={false}>
                    Ajustada
                  </Chip>
                </span>
              ) : (
                m.meta !== null && <span className="tv-sub">{p?.base === "iguales" ? "partes iguales" : "por horas"}</span>
              )}
            </>
          );
        },
        suma: (v) => SOLES.format(v.reduce((s, m) => s + (m.meta ?? 0), 0)),
      });
    columnas.push(
      {
        clave: "ticket",
        titulo: "Ticket",
        tipo: "monto",
        ancho: "100px",
        seVa: 840,
        valor: (m) => m.ticket,
        texto: (m) => (m.ticket !== null ? SOLES.format(m.ticket) : "—"),
        resumen: (m) => (m.ticket !== null ? `Ticket ${SOLES.format(m.ticket)}` : "Sin ventas"),
        celda: (m) => (
          <>
            {m.ticket !== null ? <CifraAnimada valor={m.ticket} formato="soles-redondo" /> : "—"}
            <span className={`tv-sub ${m.muestraChica && m.ventas > 0 ? "mesa-poco" : ""}`} title={m.muestraChica ? `Con menos de ${UMBRAL_MUESTRA_VENTAS} ventas, el ticket todavía se mueve mucho.` : undefined}>
              {m.ventas === 0 ? " " : m.muestraChica ? "pocas ventas" : "por venta"}
            </span>
          </>
        ),
      },
      {
        clave: "mejor",
        titulo: "Mejor día",
        tipo: "fecha",
        ancho: "112px",
        seVa: 840,
        valor: (m) => m.mejorDia?.fecha ?? null,
        resumen: (m) => (m.mejorDia ? `Mejor día: ${SOLES.format(m.mejorDia.total)}` : ""),
      },
      {
        clave: "curva",
        titulo: "Su mes",
        tipo: "texto",
        seVa: 1060,
        ordena: false,
        ancho: "84px",
        ayuda: "Lo que vendió cada día del mes. Lo elegido va en su color.",
        valor: () => null,
        celda: (m) => {
          const suyas = (dias.get(m.personaId) ?? []).filter((f) => f.fecha >= inicio && f.fecha <= hoy);
          const tope = Math.max(1, ...suyas.map((f) => f.total));
          return (
            <span className="mesa-curva" style={{ "--c": colores.get(m.personaId) } as CSSProperties} aria-hidden>
              {suyas.map((f) => (
                <i key={f.fecha} data-en={f.fecha >= tramo.desde && f.fecha <= tramo.hasta ? "" : undefined} style={{ "--h": `${Math.max(8, (f.total / tope) * 100)}%` } as CSSProperties} />
              ))}
            </span>
          );
        },
      },
    );
    return columnas;
  }, [personas, filas, colores, tramo, hoy, esHoy, personaCuentaId, conMeta, diaVivo, abiertaId]);
}

function CeldaAvance({ m, color, parteDe }: { m: MedidaPersona; color?: string; parteDe: number | null }) {
  if (parteDe !== null) {
    const parte = parteDe > 0 ? (m.vendido / parteDe) * 100 : 0;
    return (
      <span className="mesa-avance">
        <span className="mesa-avance-barra">
          <BarraAvance pct={parte} color={color} alto="gruesa" decorativa />
        </span>
        <b className="mesa-avance-pct">{Math.round(parte)} %</b>
      </span>
    );
  }
  if (m.pct === null) return <span className="tv-sub">{m.vendido > 0 ? "Sin meta" : "—"}</span>;
  const pct = Math.round(m.pct);
  return (
    <span className="mesa-avance">
      <span className="mesa-avance-barra">
        <BarraAvance
          pct={m.pct}
          color={color}
          alto="gruesa"
          marca={m.tocaPct !== null && m.tocaPct > 0 && m.tocaPct < 100 ? m.tocaPct : null}
          etiqueta={`Avance de ${m.nombre} contra su meta`}
          texto={`${pct} %`}
        />
        {m.pct >= 100 && (
          <span className="mesa-visto" style={{ "--c": color } as CSSProperties} title="Llegó a su meta">
            <Check aria-hidden className="h-3 w-3" />
          </span>
        )}
      </span>
      <b className="mesa-avance-pct">{pct} %</b>
    </span>
  );
}

export function TablaRendimiento({
  tabla,
  hoy,
  total,
  cola,
  deAfuera,
  abierta,
  onAbrir,
  debajoDeFila,
  ventasSinPersona,
}: {
  tabla: TablaVivaEstado<MedidaPersona>;
  hoy: string;
  /** Las personas de la tienda, aunque la búsqueda deje menos. */
  total: number;
  cola?: string;
  deAfuera: readonly FiltroDeAfuera[];
  abierta?: (m: MedidaPersona) => boolean;
  onAbrir?: (m: MedidaPersona) => void;
  debajoDeFila?: (m: MedidaPersona, i: number) => ReactNode;
  /** Lo vendido en el tramo que no tiene quien atendió: no está en ninguna fila, y se dice. */
  ventasSinPersona: number;
}) {
  const firma = tabla.visibles.map((m) => m.personaId).join(",");
  const zona = useFilasQueViajan(firma);
  return (
    <div ref={zona}>
      <TablaViva
        tabla={tabla}
        clave={(m) => m.personaId}
        etiqueta="Cómo va cada persona"
        sustantivo={PERSONA}
        hoy={hoy}
        total={total}
        cola={cola}
        suma={(v) => {
          const ventas = v.reduce((s, m) => s + m.ventas, 0);
          return `${SOLES.format(v.reduce((s, m) => s + m.vendido, 0))} en ${NUMERO.format(ventas)} ${plural(ventas, "venta", "ventas")}`;
        }}
        deAfuera={deAfuera}
        abierta={abierta}
        onAbrir={onAbrir}
        debajoDeFila={debajoDeFila}
        guia="rendimiento.tabla"
        guiaFrase="rendimiento.frase-tabla"
        guiaFila="rendimiento.fila"
      />
      {ventasSinPersona > 0 && <p className="nota-cayla mt-3">Además hay {SOLES.format(ventasSinPersona)} en ventas sin quien atendió: suman en la tienda y en ninguna persona.</p>}
    </div>
  );
}
