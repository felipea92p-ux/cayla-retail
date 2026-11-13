"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Aviso } from "@/components/ui/Aviso";
import { BarraDeAbajo } from "@/components/ui/BarraDeAbajo";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { Chip } from "@/components/ui/Chip";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { campoEtiqueta, campoTexto } from "@/components/ui/Modal";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ContarCajonHoja } from "@/components/caja/ContarCajonHoja";
import { useDetalleCierre } from "@/components/CierreCajaDetalle";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { estadoApertura, hayConteo, montoEscrito, textoFaltas, type ConteoCajon } from "@/lib/caja-apertura-reglas";
import { estadoCierre, rachaDeCierres } from "@/lib/historial-cierres-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { CierreCaja } from "@/lib/caja";

const money = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyEntero = (n: number) => "S/ " + n.toLocaleString("es-PE", { maximumFractionDigits: 0 });

function cuando(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const TONO_CIERRE = { cuadro: "verde", falto: "rojo", sobro: "ambar" } as const;
const NOMBRE_CIERRE = { cuadro: "Cuadró", falto: "Faltó", sobro: "Sobró" } as const;
const primerNombre = (n: string | null) => (n ? n.split(" ")[0] : "—");

type Abierta = { monto: number; diferencia: number | null; responsable: string };

/**
 * Caja cerrada: «Abrir caja» a pantalla completa (Felipe 2026-11-03; maqueta elegida: `docs/maquetas/caja-abrir-v2-2026-11/`, «2 · Hoja con
 * resumen»). El TOTAL del cajón siempre se escribe; contar billetes y monedas es una ayuda opcional escondida tras un enlace (`ContarCajonHoja`).
 * Si el último cierre dejó un monto (`esperado`), se dice quién lo cerró y se compara; si no coincide, se pide el motivo y el líder lo ve en
 * Inicio. El candado real está en `abrir_caja` (ADR-0186): esto solo lo explica antes de enviar. Al abrir, un momento de «Caja abierta» con
 * «Ir a vender» y «Ver la caja»; la pantalla de servidor recién cambia al tablero cuando se elige.
 */
export function AbrirCajaPantalla({
  ubicacionId,
  ubicacionEtiqueta,
  ultimo,
  recientes,
  ayer,
  meta,
  horaCierre,
  puedeVender,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  ultimo: CierreCaja | null;
  /** Los últimos cierres de la sede, el más reciente primero. */
  recientes: CierreCaja[];
  /** Lo vendido ayer en la sede; `null` si la base no lo pudo leer. */
  ayer: { total: number; ventas: number } | null;
  meta: number | null;
  horaCierre: string | null;
  puedeVender: boolean;
}) {
  const router = useRouter();
  const esperado = ultimo?.montoFondo ?? null;
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [conteo, setConteo] = useState<ConteoCajon>({});
  const [contando, setContando] = useState(false);
  // El detalle de un cierre anterior, al tocarlo (la misma hoja de «Historial de cierres»).
  const { abrir: verCierre, modal: detalleCierre } = useDetalleCierre();
  const [loading, setLoading] = useState(false);
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  // Abrir caja guarda en la tienda: pide Responsable (ADR-0161).
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta });

  const { monto, diferencia, pideMotivo, ilegible, listo, falta } = estadoApertura({ texto, esperado, motivo });
  // Un solo envío a la vez: el estado `loading` se apaga con el siguiente render, y dos clics en el mismo instante lo pasaban (/chaos, 2026-11-03).
  const enCurso = useRef(false);
  // TODO lo que falta, junto: el monto, la explicación de la diferencia y el responsable.
  const faltas = textoFaltas(falta, !responsable.listo);
  const puedeAbrir = listo && responsable.listo && !loading;
  const nombreResponsable = [...responsable.lista.elegibles, ...responsable.lista.enPausa].find((p) => p.personaId === responsable.elegidoId)?.nombre ?? responsable.firmaDeRespaldo ?? "—";

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeAbrir || monto === null || enCurso.current) return;
    enCurso.current = true;
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("abrir_caja", {
        p_ubicacion_id: ubicacionId,
        p_monto_apertura: monto,
        // `undefined` no viaja en el JSON; escrito así para que `pnpm datos:comparar` lo coteje con producción.
        p_motivo_diferencia: pideMotivo ? motivo.trim() : undefined,
      }),
      responsable.firma(),
    );
    setLoading(false);
    responsable.despues(error);
    if (error) {
      enCurso.current = false;
      avisar.error(traducirError(error, "abrir la caja"));
      return;
    }
    avisar.exito("Caja abierta", {
      detalle: pideMotivo ? `Con ${money(monto)}. La diferencia de ${money(Math.abs(diferencia!))} quedó registrada para el líder.` : `Con ${money(monto)} de apertura.`,
    });
    // Un momento propio de «Caja abierta»: la pantalla de servidor sigue en «caja cerrada» hasta que se elige a dónde ir.
    setAbierta({ monto, diferencia, responsable: nombreResponsable });
  }

  if (abierta) {
    return (
      <div className="pantalla-en-vidrio">
        <CajaAbierta abierta={abierta} horaCierre={horaCierre} meta={meta} puedeVender={puedeVender} alVer={() => router.refresh()} />
      </div>
    );
  }

  const cifras = [
    ayer ? { clave: "ayer", etiqueta: "Ayer", valor: moneyEntero(ayer.total) } : null,
    meta ? { clave: "meta", etiqueta: "Meta", valor: moneyEntero(meta) } : null,
    horaCierre ? { clave: "cierre", etiqueta: "Cierras", valor: horaCierre } : null,
  ].filter((c): c is { clave: string; etiqueta: string; valor: string } => c !== null);
  const serie = [...recientes].reverse();
  const botonAbrir = (
    <Boton
      peso="primario"
      cargando={loading}
      textoCargando="Abriendo…"
      type="submit"
      disabled={loading || !puedeAbrir}
      title={responsable.motivo ?? undefined}
      className="w-full !h-14 !text-base"
    >
      {monto !== null && listo ? `Abrir caja con ${money(monto)}` : "Abrir caja"}
    </Boton>
  );

  return (
    <div className="pantalla-en-vidrio">
    <form data-guia="caja.abrir" onSubmit={abrir} onKeyDown={enterNoGuarda} className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)]">
      {/* ---- A la izquierda: cuánto hay en el cajón ---- */}
      <section className="card-cayla anim-sube flex min-w-0 flex-col p-6" style={{ "--i": 1 } as CSSProperties}>
        <p className="label-cayla text-[11px] text-taupe-profundo">Abrir caja</p>
        <h2 className="font-display mt-2 text-[clamp(30px,3.2vw,42px)] leading-[1.05] text-tinta">{ultimo ? "¿Cuánto hay en el cajón?" : "¿Con cuánto abres?"}</h2>

        {ultimo ? (
          <div data-guia="caja.ultimo-cierre" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-tinta/10 bg-tinta/[0.04] px-4 py-3">
            <AvatarPersona personaId={null} nombre={ultimo.cerradaPorNombre ?? "—"} tamano={40} />
            <div className="min-w-[11rem] flex-1">
              <p className="truncate text-[15px] font-semibold text-tinta">{ultimo.cerradaPorNombre ? `Cerró ${ultimo.cerradaPorNombre}` : "Último cierre"}</p>
              <p className="text-sm text-tinta/65">Último cierre · {cuando(ultimo.cerradaEn)}</p>
            </div>
            {esperado !== null && (
              <div className="w-full sm:w-auto sm:text-right">
                <p className="label-cayla text-[11px] text-taupe-profundo">Debería haber</p>
                <p className="font-display text-3xl leading-none tabular-nums text-tinta">{money(esperado)}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-tinta/65">Escribe el efectivo del cajón.</p>
        )}

        <label className="sr-only" htmlFor="apertura-monto">
          Total en el cajón
        </label>
        <div className="caja-cayla caja-campo caja-campo-alta mt-5 !h-[104px]">
          <span aria-hidden className="font-display text-[44px] leading-none text-tinta/55">S/</span>
          <input
            id="apertura-monto"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="0.00"
            value={texto}
            readOnly={loading}
            aria-invalid={ilegible || undefined}
            onChange={(e) => setTexto(e.target.value)}
            className="font-display w-full self-stretch py-0 !text-[44px] tabular-nums sm:!text-[64px]"
          />
        </div>

        <div className="mt-3.5 flex min-h-8 flex-wrap items-center gap-2.5">
          {esperado !== null && monto !== esperado && (
            <Boton type="button" className="btn-chico" onClick={() => setTexto(montoEscrito(esperado))}>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" aria-hidden />
                Igual al cierre · {money(esperado)}
              </span>
            </Boton>
          )}
          {monto !== null && diferencia !== null && (
            <Chip tono={diferencia === 0 ? "verde" : diferencia < 0 ? "rojo" : "ambar"} versalitas={false}>
              {diferencia === 0 ? "Cuadra con el cierre" : `${diferencia < 0 ? "Faltan" : "Sobran"} ${money(Math.abs(diferencia))}`}
            </Chip>
          )}
        </div>

        {ilegible && (
          <Aviso tono="error" chico className="mt-2">
            No se entiende el monto. Escribe solo el número, como 258.50.
          </Aviso>
        )}

        {pideMotivo && (
          <div className="mt-3 space-y-1.5">
            <label className={campoEtiqueta} htmlFor="apertura-motivo">
              ¿Qué pasó? <span className="normal-case tracking-normal text-tinta/60">· obligatorio</span>
            </label>
            <input
              id="apertura-motivo"
              autoComplete="off"
              // sugerir-fijo: el motivo de una diferencia no depende de nada elegido antes (no hay categoría ni familia): es una frase libre.
              placeholder="Ej.: se usó para dar vuelto"
              value={motivo}
              readOnly={loading}
              onChange={(e) => setMotivo(e.target.value)}
              className={campoTexto}
            />
          </div>
        )}

        <button type="button" onClick={() => setContando(true)} className="btn-cayla btn-enlace mt-3 inline-flex !h-8 items-center self-start">
          Contar billetes y monedas
        </button>

        {serie.length > 1 && (
          <div data-guia="caja.cierres-anteriores" className="mt-auto pt-6">
            <TituloGrupo>Cierres anteriores</TituloGrupo>
            {/* Cada cierre abre su detalle (Felipe 2026-11-08): el mismo de «Historial de cierres», con lo cobrado por medio de
                pago, cómo cuadró el efectivo y los movimientos del turno. Las siete en fila solo desde 1400 px: a 1024 cada tarjeta
                quedaba de 72 px (y a 1280, de 96) y el monto de cuatro cifras y «Ver detalle» se salían del borde. Va en rem
                (87.5rem): escrito en px, Tailwind lo ordena antes que `sm:` y pierde. */}
            <ol className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 min-[87.5rem]:grid-cols-7">
              {serie.map((c) => {
                const estado = estadoCierre(c.diferencia);
                const dia = diaYHoraLima(c.cerradaEn).dia;
                return (
                  <li key={c.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => verCierre(c)}
                      aria-label={`Ver el detalle del cierre del ${dia}: ${NOMBRE_CIERRE[estado].toLowerCase()}`}
                      className="group flex h-full w-full min-w-0 flex-col gap-0.5 rounded-2xl border border-tinta/10 bg-tinta/[0.04] px-3.5 py-3 text-left transition-colors duration-200 ease-cayla hover:border-tinta/25 hover:bg-tinta/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
                    >
                      <span className="label-cayla text-[11px] text-taupe-profundo">{dia}</span>
                      <b className="font-display text-[23px] font-medium leading-tight tabular-nums text-tinta">{(c.montoFondo ?? c.montoCierreReal).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                      <span className="truncate text-xs text-tinta/65">Cerró {primerNombre(c.cerradaPorNombre)}</span>
                      <span className="mt-1.5 self-start"><Chip tono={TONO_CIERRE[estado]} versalitas={false}>{NOMBRE_CIERRE[estado].toLowerCase()}</Chip></span>
                      {/* Dice que la tarjeta se toca (Felipe 2026-11-08). Las palabras de la tabla del historial, en tinta y no en rojo:
                          son siete por pantalla y el rojo de un «ver» es para dos como mucho (ADR-0358, `enlace`). */}
                      <span aria-hidden className="mt-auto flex items-center gap-0.5 whitespace-nowrap pt-2 text-[13px] font-semibold text-tinta/70 transition-colors duration-200 ease-cayla group-hover:text-tinta">
                        Ver detalle
                        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 ease-cayla group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2.5 text-sm text-tinta/65">{rachaDeCierres(serie).texto}</p>
          </div>
        )}
      </section>

      {/* ---- A la derecha: el resumen y abrir ---- */}
      <aside className="card-cayla anim-sube flex min-w-0 flex-col p-6" style={{ "--i": 2 } as CSSProperties}>
        <p className="label-cayla text-[11px] text-taupe-profundo">Resumen</p>
        <dl className="mt-1.5 text-sm" data-guia="caja.resumen">
          <Fila etiqueta="Contaste" valor={monto === null ? "—" : money(monto)} fuerte />
          {esperado !== null && <Fila etiqueta="Diferencia" valor={diferencia === null ? "—" : diferencia === 0 ? "Ninguna" : `${diferencia < 0 ? "−" : "+"} ${money(Math.abs(diferencia))}`} />}
          <Fila etiqueta="Responsable" valor={nombreResponsable === "—" ? "—" : primerNombre(nombreResponsable)} />
        </dl>

        {cifras.length > 0 && (
          <ul className="mt-3.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${cifras.length}, minmax(0, 1fr))` }}>
            {cifras.map((c) => (
              <li key={c.clave} className="rounded-2xl bg-tinta/[0.06] px-3.5 py-3">
                <span className="label-cayla block text-[11px] text-taupe-profundo">{c.etiqueta}</span>
                <span className="font-display mt-1 block text-2xl leading-none tabular-nums text-tinta">{c.valor.replace("S/ ", "")}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto space-y-3.5 pt-5">
          <ComboResponsable control={responsable} deshabilitado={loading} />
          <div className="hidden sm:block">
            {botonAbrir}
            {faltas && !loading && <p className="mt-2 text-center text-sm text-tinta/65">Falta: <b className="font-semibold text-tinta">{faltas}</b></p>}
          </div>
        </div>
      </aside>

      {/* En el celular el botón no se queda al fondo de una página larga: la Isla lo trae a la mano (ADR-0479). */}
      <BarraDeAbajo pegada className="flex-col items-stretch p-2.5 sm:hidden">
        {faltas && !loading && <p className="px-1.5 text-center text-sm text-tinta/70">Falta: <b className="font-semibold text-tinta">{faltas}</b></p>}
        {botonAbrir}
      </BarraDeAbajo>

      {contando && (
        <ContarCajonHoja
          inicial={conteo}
          onClose={() => setContando(false)}
          onUsar={(total, c) => {
            setConteo(c);
            setTexto(hayConteo(c) ? montoEscrito(total) : texto);
            setContando(false);
          }}
        />
      )}
    </form>
    {/* Fuera del formulario: lo de la hoja no es parte de abrir la caja. */}
    {detalleCierre}
    </div>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-tinta/[0.08] py-3 first:border-t-0">
      <dt className={fuerte ? "font-semibold text-tinta" : "text-tinta/70"}>{etiqueta}</dt>
      <dd className={`tabular-nums ${fuerte ? "font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}

/** El momento de «Caja abierta»: lo abierto, quién y con cuánto, y a dónde seguir. */
function CajaAbierta({ abierta, horaCierre, meta, puedeVender, alVer }: { abierta: Abierta; horaCierre: string | null; meta: number | null; puedeVender: boolean; alVer: () => void }) {
  const hora = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  // En el celular la persona llega aquí desde el fondo de una página larga: «Caja abierta» se lleva a la vista.
  const raiz = useRef<HTMLElement>(null);
  // La pantalla nueva es otra cosa, no un bloque que se acortó: se suelta la reserva de PaginaEstable (ADR-0185) y se lleva la vista aquí (como el cobro de Vender).
  useLayoutEffect(() => {
    soltarPaginaEstable();
    raiz.current?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <section ref={raiz} role="status" className="card-cayla anim-sube flex min-h-[56vh] flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="grid h-28 w-28 place-items-center rounded-full bg-verde/15 text-verde" aria-hidden>
        <Check className="h-14 w-14" />
      </span>
      <h2 className="font-display mt-3 text-[clamp(44px,6vw,72px)] leading-none text-tinta">Caja abierta</h2>
      <p className="text-base text-tinta/70">
        Abriste con <b className="text-tinta">{money(abierta.monto)}</b> · {abierta.responsable}
        {abierta.diferencia ? (
          <>
            <br />
            Diferencia de <b className="text-tinta">{money(Math.abs(abierta.diferencia))}</b> registrada.
          </>
        ) : null}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Chip tono="verde" versalitas={false}>Abierta {hora}</Chip>
        {horaCierre && <Chip versalitas={false}>Cierras {horaCierre}</Chip>}
        {meta && <Chip versalitas={false}>Meta {moneyEntero(meta)}</Chip>}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        {puedeVender && (
          <BotonEnlace /* unificar-fijo: es el paso que sigue al abrir la caja, la acción principal de esa pantalla, no un «ver» suelto */ href="/vender" peso="primario" className="!h-[52px] px-8" onClick={alVer}>
            <ShoppingBag className="h-4 w-4" aria-hidden />
            Ir a vender
          </BotonEnlace>
        )}
        <Boton type="button" className="!h-[52px] px-8" onClick={alVer}>
          Ver la caja
        </Boton>
      </div>
    </section>
  );
}
