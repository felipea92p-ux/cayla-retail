"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  ChevronRight,
  CircleHelp,
  FileText,
  Image as IconoImagen,
  Info,
  Lock,
  MapPin,
  PackageOpen,
  Palette,
  RotateCcw,
  Sprout,
  Tag,
  type LucideIcon,
} from "lucide-react";
import {
  FAMILIAS,
  alcance,
  diaLargo,
  diaLima,
  etiquetaDia,
  filtrarEventos,
  horaLima,
  nombreVariante,
  personasDe,
  resumenHistorial,
  soles,
  type Cambio,
  type Evento,
  type Familia,
  type Persona,
} from "@/lib/historial-prenda-reglas";
import { FotoDePrenda } from "@/components/ui/FotoDePrenda";
import type { LecturaHistorial } from "@/lib/historial-prenda-reglas";

/**
 * El historial de una prenda (ADR-0354): maqueta A «Hilo del tiempo», elegida por Felipe el 2026-10-06
 * (docs/maquetas/historial-prenda-2026-10/a-hilo.html). Un hilo vertical con cada guardado colgado de un nudo del color de su
 * tipo; arriba lo último, abajo cuando nació. Primero QUIÉN, después QUÉ (dibujado) y CUÁNDO; un clic abre dónde, desde qué y en
 * qué variantes. Solo cambios de la prenda: las ventas y el stock viven en Movimientos, y la nota del pie lo dice.
 *
 * Se usa en la vista rápida de la Grilla (la hoja «da vuelta la página») y en /productos/[id]/historial. Movimiento: el de la
 * excepción de la vista rápida (ADR-0136 act. 2026-10-05), en `historial-prenda.css`; el precio que cuenta, aquí.
 */

const TONO: Record<Familia, string> = {
  precio: "var(--color-ambar)",
  variantes: "var(--color-pizarra)",
  etiquetas: "var(--color-taupe)",
  ficha: "var(--color-verde)",
  fotos: "color-mix(in srgb, var(--color-tinta) 75%, transparent)",
  alta: "var(--color-rojo)",
};
const ICONO: Record<Familia, LucideIcon> = { precio: Banknote, variantes: Palette, etiquetas: Tag, ficha: FileText, fotos: IconoImagen, alta: Sprout };
const NOMBRE_FAMILIA: Record<Familia, string> = { precio: "Precio", variantes: "Colores y tallas", etiquetas: "Etiquetas", ficha: "Ficha", fotos: "Fotos", alta: "Nació" };

// Cada persona con un tono propio y estable (sale de su id): la misma cara se reconoce en toda la lista.
const TONOS_PERSONA = ["var(--color-taupe)", "var(--color-pizarra)", "var(--color-verde)", "var(--color-ambar)"];
function tonoPersona(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS_PERSONA[h % TONOS_PERSONA.length]!;
}

export function Avatar({ persona, tam = 32 }: { persona: Persona | null; tam?: number }) {
  if (!persona) {
    return (
      <span className="hp-av" data-nadie style={{ ["--hp-av" as string]: `${tam}px` }} title="Nadie quedó anotado" aria-hidden>
        ?
      </span>
    );
  }
  return (
    <span className="hp-av" style={{ ["--hp-av" as string]: `${tam}px`, ["--hp-tono-av" as string]: tonoPersona(persona.id) }} title={persona.nombre} aria-hidden>
      {persona.iniciales}
    </span>
  );
}

function Swatch({ hex, tam = 16, titulo }: { hex: string | null; tam?: number; titulo?: string }) {
  // El color de la prenda es dato (ADR-0336): llega de la base y no cambia con el tema.
  return <span className="hp-sw" data-color-dato style={{ background: hex ?? "transparent", width: tam, height: tam }} title={titulo} />;
}

export function HistorialPrenda({
  lectura,
  nombre,
  totalVariantes,
  hrefMovimientos,
  onVolver,
  onReintentar,
}: {
  lectura: LecturaHistorial;
  /** El nombre de HOY de la prenda: es el texto de «← Volver». */
  nombre: string;
  /** Cuántas variantes tiene hoy: para decir «en las 5 variantes» en vez de listarlas. */
  totalVariantes: number;
  /** Movimientos con la prenda buscada, si la cuenta ve ese módulo; si no, la nota no ofrece el enlace. */
  hrefMovimientos: string | null;
  /** En la vista rápida: vuelve a la ficha. En la página suelta no hay a dónde volver. */
  onVolver?: () => void;
  onReintentar?: () => void;
}) {
  const hoy = diaLima(new Date().toISOString());
  const eventos = useMemo(() => (lectura.estado === "ok" ? lectura.eventos : []), [lectura]);
  const [familia, setFamilia] = useState<Familia | "todo">("todo");
  const [persona, setPersona] = useState<string | null>(null);
  const lista = useMemo(() => filtrarEventos(eventos, familia, persona), [eventos, familia, persona]);
  const cuenta = (f: Familia) => eventos.filter((e) => e.familia === f).length;
  const gente = useMemo(() => personasDe(eventos.filter((e) => e.familia !== "alta")), [eventos]);
  const recien = eventos.length > 0 && eventos.every((e) => e.familia === "alta");

  return (
    <div className="hp">
      <div>
        {onVolver && (
          <button type="button" className="hp-volver" onClick={onVolver} data-volver>
            <ArrowRight aria-hidden className="rotate-180" />
            {nombre}
          </button>
        )}
        {lectura.estado === "ok" && <p className="hp-resumen">{resumenHistorial(eventos, hoy)}</p>}
      </div>

      {lectura.estado === "ok" && !recien && eventos.length > 0 && (
        <div className="hp-barra">
          <div className="hp-pildoras" role="group" aria-label="Qué cambios ver">
            <button type="button" className="hp-pil" aria-pressed={familia === "todo"} onClick={() => setFamilia("todo")}>
              Todo <span className="hp-n">{eventos.filter((e) => e.familia !== "alta").length}</span>
            </button>
            {FAMILIAS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="hp-pil"
                aria-pressed={familia === f.id}
                disabled={cuenta(f.id) === 0}
                onClick={() => setFamilia(f.id)}
                style={{ ["--hp-tono" as string]: TONO[f.id] }}
              >
                <span className="hp-pt" />
                {f.nombre} <span className="hp-n">{cuenta(f.id)}</span>
              </button>
            ))}
          </div>
          {gente.length > 0 && (
            <div className="hp-gente" role="group" aria-label="Quién lo hizo" data-filtrando={persona ? "" : undefined}>
              <span className="label-cayla text-[10.5px] text-tinta/45">Quién</span>
              {gente.map((g) => (
                <button
                  key={g.clave}
                  type="button"
                  className="hp-per"
                  aria-pressed={persona === g.clave}
                  aria-label={`${g.persona?.nombre ?? "Sin firma"}: ${g.n} ${g.n === 1 ? "cambio" : "cambios"}`}
                  title={g.persona?.nombre ?? "Sin firma"}
                  onClick={() => setPersona((p) => (p === g.clave ? null : g.clave))}
                >
                  <Avatar persona={g.persona} tam={30} />
                  <span className="hp-b">{g.n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {lectura.estado === "leyendo" && (
        <div className="hp-esqueleto" aria-label="Leyendo el historial…">
          <span />
          <span />
          <span />
        </div>
      )}
      {lectura.estado === "error" && (
        <div className="hp-nota" role="alert">
          <Info aria-hidden />
          <span className="flex-1">No se pudo leer el historial. La prenda no cambió: solo falló la lectura.</span>
          {onReintentar && (
            <button type="button" className="btn-cayla btn-secundario min-h-9 text-[12.5px]" onClick={onReintentar}>
              <RotateCcw aria-hidden className="h-4 w-4" />
              Reintentar
            </button>
          )}
        </div>
      )}
      {lectura.estado === "ok" && (
        <Hilo key={`${familia}|${persona}`} eventos={lista} hoy={hoy} total={totalVariantes} recien={recien} hrefMovimientos={hrefMovimientos} />
      )}
    </div>
  );
}

function Hilo({ eventos, hoy, total, recien, hrefMovimientos }: { eventos: Evento[]; hoy: string; total: number; recien: boolean; hrefMovimientos: string | null }) {
  const raiz = useRef<HTMLDivElement>(null);
  // Cuándo se pintó esta lista (lo pone el efecto): lo que entra a la vista mucho después no espera la cascada.
  const pintado = useRef(0);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());

  // Cada tarjeta se anima cuando entra a la vista, UNA vez. La cascada es solo de la primera vista: lo que aparece al bajar
  // entra sin esperar su turno.
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    pintado.current = performance.now();
    const io = new IntersectionObserver(
      (entradas) => {
        for (const en of entradas) {
          if (!en.isIntersecting) continue;
          const t = en.target as HTMLElement;
          if (performance.now() - pintado.current > 900) t.style.setProperty("--hp-d", "0ms");
          t.setAttribute("data-visto", "");
          t.dispatchEvent(new CustomEvent("hp-visto"));
          io.unobserve(t);
        }
      },
      { threshold: 0.15 },
    );
    el.querySelectorAll(".hp-ev").forEach((x) => io.observe(x));
    // Respaldo: si el observador no llega a avisar (una pestaña en segundo plano, un navegador que no lo trae), nada se queda
    // invisible: a los 1,2 s aparece todo lo que falte, sin esperar su turno.
    const respaldo = window.setTimeout(() => {
      el.querySelectorAll<HTMLElement>(".hp-ev:not([data-visto])").forEach((t) => {
        t.style.setProperty("--hp-d", "0ms");
        t.setAttribute("data-visto", "");
        t.dispatchEvent(new CustomEvent("hp-visto"));
        io.unobserve(t);
      });
    }, 1200);
    return () => {
      io.disconnect();
      window.clearTimeout(respaldo);
    };
  }, [eventos]);

  const alternar = (id: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const filas: ReactNode[] = [];
  let diaPrevio = "";
  eventos.forEach((e, k) => {
    const d = etiquetaDia(e.cuando, hoy);
    if (d !== diaPrevio) {
      filas.push(
        <div key={`d-${e.id}`} className="hp-dia">
          <b>{d}</b>
          {(d === "Hoy" || d === "Ayer") && <small>{diaLargo(e.cuando)}</small>}
        </div>,
      );
      diaPrevio = d;
    }
    filas.push(<Tarjeta key={e.id} evento={e} indice={k} total={total} abierto={abiertos.has(e.id)} onAlternar={() => alternar(e.id)} />);
  });

  return (
    <div>
      {/* El hilo cuelga solo de las tarjetas: termina en el nacimiento, no detrás de las notas del pie. */}
      <div ref={raiz} className="hp-hilo">
        <span className="hp-linea" aria-hidden />
        {filas}
      </div>
      {eventos.length === 0 && <p className="hp-vacio">Nadie con ese filtro cambió esta prenda.</p>}
      {recien && (
        <div className="hp-nota">
          <Info aria-hidden />
          <span>Cuando alguien le cambie el precio, un color, una etiqueta o la ficha, aparecerá aquí arriba, con su nombre.</span>
        </div>
      )}
      <div className="hp-nota">
        <PackageOpen aria-hidden />
        <span>
          Las ventas, traslados y ajustes de stock de esta prenda no están aquí
          {hrefMovimientos ? (
            <>
              : viven en <Link href={hrefMovimientos}>Movimientos</Link>.
            </>
          ) : (
            ": viven en Movimientos."
          )}
        </span>
      </div>
    </div>
  );
}

function Tarjeta({ evento: e, indice, total, abierto, onAlternar }: { evento: Evento; indice: number; total: number; abierto: boolean; onAlternar: () => void }) {
  const Icono = ICONO[e.familia];
  const p = e.persona;
  // Las variantes que tocó el guardado, una vez cada una (el precio y la etiqueta de la misma variante no son dos).
  const conVariantes = [
    ...new Map(e.cambios.flatMap((c) => (c.k === "precio" || c.k === "costo" || c.k === "etiqueta" ? c.variantes : [])).map((v) => [nombreVariante(v), v])).values(),
  ];
  const estilo = { ["--hp-d" as string]: `${Math.min(indice, 8) * 70}ms`, ["--hp-tono" as string]: TONO[e.familia] } as CSSProperties;
  return (
    <article className={`hp-ev${e.familia === "alta" ? " hp-nacio" : ""}`} style={estilo} data-abierto={abierto ? "" : undefined}>
      <span className="hp-hora">{horaLima(e.cuando)}</span>
      <span className="hp-nudo" title={NOMBRE_FAMILIA[e.familia]}>
        <Icono aria-hidden />
      </span>
      <div
        className="hp-card"
        role="button"
        tabIndex={0}
        aria-expanded={abierto}
        onClick={onAlternar}
        onKeyDown={(k) => {
          if (k.key === "Enter" || k.key === " ") {
            k.preventDefault();
            onAlternar();
          }
        }}
      >
        <div className="hp-quien">
          <Avatar persona={p} />
          {p ? (
            <span className="hp-quien-txt">
              <b>{p.nombre}</b> {e.titulo}
              <small>
                {[p.rol, p.sede].filter(Boolean).join(" · ")}
                <span className="sm:hidden"> · {horaLima(e.cuando)}</span>
              </small>
            </span>
          ) : (
            <span className="hp-quien-txt" data-nadie>
              <b>Nadie quedó anotado</b> · {e.titulo}
              <small>
                {e.familia === "alta" ? "Nació antes de que se anotara quién crea cada prenda" : "Se guardó sin elegir quién lo hacía"}
                <span className="sm:hidden"> · {horaLima(e.cuando)}</span>
              </small>
            </span>
          )}
          <span className="hp-flecha" aria-hidden>
            <ChevronRight />
          </span>
        </div>
        <div className="hp-cambios">
          {e.cambios.map((c, j) => (
            <CambioVista key={j} cambio={c} total={total} />
          ))}
        </div>
        <div className="hp-det">
          <div>
            <dl>
              <dt>Cuándo</dt>
              <dd>
                {diaLargo(e.cuando)}, {horaLima(e.cuando)}
              </dd>
              {e.sede && (
                <>
                  <dt>Dónde</dt>
                  <dd>
                    <MapPin aria-hidden />
                    {e.sede}
                  </dd>
                </>
              )}
              {conVariantes.length > 0 && (
                <>
                  <dt>Variantes</dt>
                  <dd>
                    {conVariantes.slice(0, 12).map((v, i) => (
                      <Swatch key={i} hex={v.hex} tam={14} titulo={nombreVariante(v)} />
                    ))}
                    <span className="text-tinta/55">{alcance(conVariantes, total).replace(/^en /, "")}</span>
                  </dd>
                </>
              )}
              {!p && e.familia !== "alta" && (
                <div className="hp-porque">
                  <CircleHelp aria-hidden />
                  <span>
                    <b>¿Por qué no hay nombre?</b> Hasta el 6 de octubre de 2026, «Editar producto» no pedía «Responsable» y, en la
                    terminal de una tienda, el cambio quedaba sin firma. Desde entonces lo pide al guardar.
                  </span>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </article>
  );
}

function Precio({ antes, despues }: { antes: number | null; despues: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  // El precio cuenta del viejo al nuevo cuando la tarjeta aparece (una vez, sin rebote); sin movimiento, salta al final.
  useEffect(() => {
    const el = ref.current;
    const tarjeta = el?.closest(".hp-ev");
    if (!el || !tarjeta || antes === null || despues === null) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let marco = 0;
    const arrancar = () => {
      const espera = Number.parseInt(getComputedStyle(tarjeta).getPropertyValue("--hp-d")) || 0;
      const t0 = performance.now() + espera + 560;
      el.textContent = soles(antes);
      const paso = (t: number) => {
        const x = Math.max(0, Math.min(1, (t - t0) / 700));
        el.textContent = soles(antes + (despues - antes) * (1 - Math.pow(1 - x, 3)));
        if (x < 1) marco = requestAnimationFrame(paso);
      };
      marco = requestAnimationFrame(paso);
    };
    if (tarjeta.hasAttribute("data-visto")) return;
    tarjeta.addEventListener("hp-visto", arrancar, { once: true });
    return () => {
      tarjeta.removeEventListener("hp-visto", arrancar);
      cancelAnimationFrame(marco);
    };
  }, [antes, despues]);
  return (
    <span ref={ref} className="hp-despues tabular-nums">
      {soles(despues)}
    </span>
  );
}

function Flecha() {
  return (
    <span className="hp-a" aria-hidden>
      <ArrowRight />
    </span>
  );
}

function CambioVista({ cambio: c, total }: { cambio: Cambio; total: number }) {
  switch (c.k) {
    case "precio":
    case "costo": {
      const dif = c.antes !== null && c.despues !== null ? c.despues - c.antes : null;
      const pct = dif !== null && c.antes ? Math.round((Math.abs(dif) / c.antes) * 100) : null;
      const signo = dif !== null && dif < 0 ? "−" : "+";
      return (
        <div className="hp-cam hp-precio">
          <span className="hp-campo">{c.k === "precio" ? "Precio" : c.declarado ? "Costo declarado" : "Costo"}</span>
          <span className="hp-antes tabular-nums">{soles(c.antes)}</span>
          <Flecha />
          <Precio antes={c.antes} despues={c.despues} />
          {dif !== null && dif !== 0 && (
            <span className="hp-delta">
              {signo}
              {soles(Math.abs(dif))}
              {pct !== null && ` · ${signo}${pct} %`}
            </span>
          )}
          <span className="hp-alcance">
            {alcance(c.variantes, total)}
            {c.k === "costo" && (
              <span className="hp-privado">
                {c.variantes.length > 0 && " · "}
                <Lock aria-hidden /> solo lo ve quien ve el costo
              </span>
            )}
          </span>
        </div>
      );
    }
    case "texto":
      return (
        <div className="hp-cam" data-largo={c.largo ? "" : undefined}>
          <span className="hp-campo">{c.campo}</span>
          <span className="hp-antes">{c.antes}</span>
          {!c.largo && <Flecha />}
          <span className="hp-despues" style={{ fontWeight: 500 }}>
            {c.despues}
          </span>
        </div>
      );
    case "variantes+":
      return (
        <div className="hp-cam">
          <span className="hp-campo">{c.nuevas.length === 1 ? "Variante nueva" : "Variantes nuevas"}</span>
          <span className="hp-sws">
            {c.nuevas.map((v, i) => (
              <span key={i} className="hp-chip-color" style={{ ["--hp-j" as string]: i }}>
                <Swatch hex={v.hex} tam={20} />
                <span className="hp-mas">+</span>
                {nombreVariante(v)}
              </span>
            ))}
          </span>
          {c.nuevas[0]?.precio != null && <span className="hp-alcance">a {soles(Number(c.nuevas[0].precio))}</span>}
        </div>
      );
    case "color~":
      return (
        <div className="hp-cam">
          <span className="hp-campo">Color</span>
          <span className="hp-morph">
            <span className="hp-morph-uno">
              <Swatch hex={c.antes.hex} tam={26} />
              <Swatch hex={c.despues.hex} tam={26} />
            </span>
            <span className="hp-antes">{c.antes.nombre}</span>
            <Flecha />
            <span className="hp-despues">{c.despues.nombre}</span>
          </span>
          <span className="hp-alcance">
            Se corrigió el color {c.variantes === 1 ? "de una variante" : `de ${c.variantes} variantes`}: las prendas siguen siendo las mismas.
          </span>
        </div>
      );
    case "talla~":
      return (
        <div className="hp-cam">
          <span className="hp-campo">Talla</span>
          <span className="hp-antes">{c.antes}</span>
          <Flecha />
          <span className="hp-despues">{c.despues}</span>
          <span className="hp-alcance">Se corrigió la talla {c.variantes === 1 ? "de una variante" : `de ${c.variantes} variantes`}.</span>
        </div>
      );
    case "etiqueta":
      return (
        <div className="hp-cam">
          <span className="hp-campo">{c.puesta ? "Puso" : "Quitó"}</span>
          <span className="hp-etq" data-fuera={c.puesta ? undefined : ""}>
            <Tag aria-hidden />
            {c.nombre}
          </span>
          <span className="hp-alcance">{alcance(c.variantes, total)}</span>
        </div>
      );
    case "foto":
      return (
        <div className="hp-cam">
          <span className="hp-campo">{c.agregadas.length + c.quitadas === 1 ? "Foto" : "Fotos"}</span>
          <span className="hp-fotos">
            {c.agregadas.map((url, i) => (
              <span key={i} className="hp-foto" style={{ ["--hp-j" as string]: i }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura del bucket; si ya no existe, queda el ícono */}
                {url ? <img src={url} alt="" loading="lazy" onError={(ev) => ((ev.currentTarget.style.display = "none"))} /> : <IconoImagen aria-hidden />}
              </span>
            ))}
          </span>
          <span className="hp-alcance">
            {[c.agregadas.length ? `${c.agregadas.length === 1 ? "una agregada" : `${c.agregadas.length} agregadas`}` : null, c.quitadas ? `${c.quitadas === 1 ? "una quitada" : `${c.quitadas} quitadas`}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      );
    case "activo":
      return (
        <div className="hp-cam">
          <span className="hp-campo">Variantes</span>
          <span>
            {[c.desactivadas.length ? `desactivadas: ${c.desactivadas.map(nombreVariante).join(", ")}` : null, c.activadas.length ? `activadas: ${c.activadas.map(nombreVariante).join(", ")}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      );
    case "codigo":
      return (
        <div className="hp-cam">
          <span className="hp-campo">Código</span>
          <span>Se recalculó el código de {c.variantes === 1 ? "una variante" : `${c.variantes} variantes`} (las etiquetas viejas siguen sonando).</span>
        </div>
      );
    case "alta":
      return (
        <div className="hp-alta">
          <span className="hp-alta-mosaico">
            {/* Sin foto, como en toda la app (ADR-0333): el ícono de su categoría sobre el color con el que nació. */}
            <FotoDePrenda fotoUrl={null} colorHex={c.colores[0]?.hex ?? null} prefijo={c.prefijo} familia={c.familia} categoria={c.categoria} />
          </span>
          <div>
            <b>{c.nombre}</b>
            <p>
              {[
                c.categoria,
                c.colores.length ? `${c.colores.length} ${c.colores.length === 1 ? "color" : "colores"}` : null,
                c.tallas.length ? c.tallas.join(", ") : null,
                c.precio !== null ? soles(c.precio) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {c.colores.length > 0 && (
              <span className="hp-sws">
                {c.colores.map((x, i) => (
                  <Swatch key={i} hex={x.hex} titulo={x.nombre} />
                ))}
              </span>
            )}
          </div>
        </div>
      );
  }
}
