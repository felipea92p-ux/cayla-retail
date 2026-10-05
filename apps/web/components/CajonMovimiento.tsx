"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, FileText, History, ListChecks, X } from "lucide-react";
import { MiniaturaPrenda, SinFoto } from "@/components/ui/PrendaCelda";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { SelloTipo } from "@/components/movimientos/SelloTipo";
import { TrayectoMovimiento } from "@/components/movimientos/TrayectoMovimiento";
import type { ConsultarLink, DetalleBajadas, DetalleCajon, ItemPrenda, PasoCajon, RutaCajon, TonoCifra, VistaCajon } from "@/lib/movimientos-cajon";
import { TIPOS_VISUALES, type TipoVisual } from "@/lib/movimientos-tipos";

/** Debe coincidir con `.anim-cajon-salida` en globals.css (mismo contrato que `CajonPrendaExistencias`). */
const MS_SALIDA = 240;

/* ====================================================================
   Cajón de detalle de Movimientos (diseño aprobado por Felipe, 2026-09-28; simplificado el 2026-10-01)

   Reemplaza dos cosas a la vez: el modal centrado `MovimientoDetalle` (una prenda) y la expansión vertical de
   `FilaOperacion` (muchas prendas guardadas juntas, que antes abrían una lista larga debajo de la fila). Un solo
   cajón lateral, no bloqueante —la página sigue viva detrás—. Solo CONSULTA: ningún botón de acá ejecuta un
   movimiento (sección 14 del pedido) — eso sigue viviendo en Cambios, Devoluciones, Bajar al piso, Ajustar, cada uno
   en su propia pantalla.

   Todos se leen igual, sin saber de stock (pedido de Felipe, 2026-10-01, tras leerlos como alguien sin contexto):
   el nombre del movimiento y cuándo; UNA frase con el número grande («3 prendas llegaron desde Tienda Lima») y quién
   lo hizo; y debajo solo lo que ayuda a creerla — la prenda, la lista, lo que había y lo que hay ahora, el documento.
   Qué dice cada frase y cada línea lo decide `lib/movimientos-cajon.ts`; acá solo se pinta.

   Es un solo marco con dos contenidos: UNA operación (`ContenidoOperacion`) o un movimiento interno (una colgada en piso o una
   guardada en almacén, `ContenidoBajadas`). Pasar de uno a otro cambia el contenido sin cerrar ni volver a deslizar.

   Rediseño 2026-10-05 (ADR-0346): la cabecera lleva el sello y el color de su tipo, y después de la frase vienen la ruta (de dónde
   a dónde) y «Qué pasó» (tres pasos, solo con lo que el registro respalda). Todo lo demás —la frase con el número grande, lo
   que había y hay, la lista, el documento— sigue como lo aprobó Felipe.
   ==================================================================== */

const TONO_TEXTO: Record<TonoCifra, string> = {
  verde: "text-verde-profundo",
  rojo: "text-rojo",
  neutro: "text-tinta",
};

/** Nombre del movimiento y cuándo, en una cabecera con el color y el sello de su tipo (ADR-0346): el mismo ícono y color que
 *  la fila de la lista, así se reconoce al abrirlo. El título es el mismo texto que la lista dice para esa fila. */
function Encabezado({ titulo, cuando, tipo }: { titulo: string; cuando: string; tipo: TipoVisual }) {
  return (
    <div className="mv-cajon-cab" data-mv-tono={TIPOS_VISUALES[tipo].tono}>
      <SelloTipo tipo={tipo} tamano={56} />
      <div className="min-w-0 pr-9">
        <Dialog.Title asChild>
          <h2 className="font-display text-[26px] leading-tight text-tinta">{titulo}</h2>
        </Dialog.Title>
        <Dialog.Description className="mt-1 text-[15px] tabular-nums text-taupe">{cuando}</Dialog.Description>
      </div>
    </div>
  );
}

/** De dónde a dónde fue, con la prenda que viaja: el mismo trayecto de la fila. */
function BloqueRuta({ ruta, tipo }: { ruta: RutaCajon; tipo: TipoVisual }) {
  // Sin destino solo tiene sentido un ajuste o un conteo («se corrigió aquí»): un stock inicial o una carga no «van» a ninguna parte.
  const corrige = tipo === "ajuste" || tipo === "conteo";
  if (!ruta.destino && !corrige) return null;
  return (
    <section className="mt-6 border-t border-sand pt-5" data-mv-tono={TIPOS_VISUALES[tipo].tono}>
      <h3 className="mb-3 text-[15px] font-semibold text-tinta">Ruta</h3>
      <TrayectoMovimiento origen={ruta.origen} destino={ruta.destino} tipo={tipo} motivo={ruta.motivo} solo={tipo === "conteo" ? "se corrigió tras contar" : "se corrigió aquí"} />
    </section>
  );
}

/** «Qué pasó»: los pasos, con una línea que los une. Un paso que todavía falta (un traslado en camino) va hueco. */
function BloquePasos({ pasos, tipo }: { pasos: PasoCajon[]; tipo: TipoVisual }) {
  if (pasos.length === 0) return null;
  return (
    <section className="mt-6 border-t border-sand pt-5" data-mv-tono={TIPOS_VISUALES[tipo].tono}>
      <h3 className="mb-3 text-[15px] font-semibold text-tinta">Qué pasó</h3>
      <ol className="mv-pasos">
        {pasos.map((p, i) => (
          <li key={i} data-hecho={p.hecho ? "" : undefined} style={{ "--k": i } as React.CSSProperties}>
            <span aria-hidden className="mv-paso-marca">
              {p.hecho ? "✓" : i + 1}
            </span>
            <span className="text-[14.5px] leading-snug text-tinta">{p.texto}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Lo que pasó, en una frase con el número grande, y debajo dónde (en qué parte de la tienda) y quién lo hizo. */
function Hero({ cifra, frase, donde, quien }: { cifra: string; frase: string; donde?: string | null; quien: string | null }) {
  return (
    <div className="mt-6 rounded-xl border border-sand px-5 py-4">
      <p className="flex items-center gap-4">
        <span className="font-display text-[44px] leading-none tabular-nums text-tinta">{cifra}</span>
        <span className="text-balance text-[16px] leading-snug text-tinta">{frase}</span>
      </p>
      {(donde || quien) && (
        <dl className="mt-3 grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-sand pt-3 text-[14px]">
          {donde && (
            <>
              <dt className="text-taupe">Dónde</dt>
              <dd className="text-tinta">{donde}</dd>
            </>
          )}
          {quien && (
            <>
              <dt className="text-taupe">Quién</dt>
              <dd className="text-tinta">{quien}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

/** La prenda de un movimiento de UNA prenda: su foto real (en una tienda de ropa se reconoce antes por la foto que por
 *  el nombre), el nombre y talla · color. */
function BloquePrenda({ prenda }: { prenda: NonNullable<DetalleCajon["prenda"]> }) {
  return (
    <div className="mt-6 flex items-center gap-4">
      {prenda.fotoUrl ? (
        <Image src={prenda.fotoUrl} alt="" width={64} height={74} unoptimized className="h-[74px] w-16 shrink-0 rounded-[10px] border border-tinta/10 bg-hueso object-cover" />
      ) : (
        <SinFoto tamano="h-[74px] w-16" />
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 break-words text-[17px] font-semibold leading-snug text-tinta">{prenda.referencia}</p>
        {prenda.variante && <p className="mt-0.5 truncate text-[14px] text-taupe">{prenda.variante}</p>}
      </div>
    </div>
  );
}

function Seccion({ icono: Icono, titulo, children }: { icono?: typeof FileText; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-sand pt-5 pb-1">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-tinta">
        {Icono && <Icono aria-hidden className="h-[18px] w-[18px] text-tinta/70" strokeWidth={1.6} />}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Un renglón de una lista de prendas: foto, nombre (hasta dos líneas: un nombre cortado a media palabra no dice cuál es),
 *  talla · color, y a la derecha cuántas, ya dicho («3 prendas», «2 más», «5 menos»). */
function FilaPrenda({ item }: { item: ItemPrenda }) {
  return (
    <li className="flex items-center gap-3 border-b border-sand py-3 last:border-b-0">
      <MiniaturaPrenda fotoUrl={item.fotoUrl} tamano="md" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[14.5px] font-semibold leading-snug text-tinta">{item.referencia}</p>
        {item.variante && <p className="truncate text-[13px] text-taupe">{item.variante}</p>}
      </div>
      <span className={`shrink-0 whitespace-nowrap text-right text-[14px] tabular-nums ${TONO_TEXTO[item.tono]}`}>{item.cantidad}</span>
    </li>
  );
}

function ListaPrendas({ items }: { items: ItemPrenda[] }) {
  const TOPE = 6;
  const [expandido, setExpandido] = useState(false);
  const visibles = expandido ? items : items.slice(0, TOPE);
  return (
    <div className="rounded-xl border border-sand px-4">
      <ul>
        {visibles.map((it, i) => (
          <FilaPrenda key={`${it.varianteId}-${i}`} item={it} />
        ))}
      </ul>
      {!expandido && items.length > TOPE && (
        <button type="button" onClick={() => setExpandido(true)} className="flex w-full items-center justify-center gap-1 border-t border-sand py-3 text-[13.5px] text-taupe hover:text-tinta">
          Ver las {items.length - TOPE} restantes
          <ChevronDown aria-hidden className="h-4 w-4" strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}

/** Una fila de «Más información»: el documento (traslado, boleta, conteo…) o el historial de la prenda. Si se puede abrir,
 *  lleva «›»; si no, es solo una línea que dice cuál es el documento. */
function FilaEnlace({ link, onVerVenta }: { link: ConsultarLink; onVerVenta?: () => void }) {
  const Icono = link.clave === "historial" ? History : FileText;
  const abre = Boolean(link.href) || (link.onClick === "abrir_venta" && Boolean(onVerVenta));
  const cuerpo = (
    <>
      <Icono aria-hidden className="h-[18px] w-[18px] shrink-0 text-tinta/70" strokeWidth={1.6} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] text-tinta">{link.texto}</span>
        {link.detalle && <span className="block truncate text-[13px] text-taupe">{link.detalle}</span>}
      </span>
      {abre && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-tinta/50" strokeWidth={1.6} />}
    </>
  );
  const clase = "flex min-h-12 w-full items-center gap-3 border-b border-sand py-2 text-left last:border-b-0";
  if (link.onClick === "abrir_venta" && onVerVenta) {
    return (
      <button type="button" onClick={onVerVenta} className={`${clase} transition-colors hover:bg-hueso/60`}>
        {cuerpo}
      </button>
    );
  }
  return link.href ? (
    <Link href={link.href} className={`${clase} transition-colors hover:bg-hueso/60`}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

/** El cuerpo del cajón de las bajadas (las del día plegadas, o una bajada / un retiro suelto): lo mismo que dice la
 *  lista, en una frase, con cada prenda y su hora (la hora va primera, como en la lista; con una sola hora ya está arriba
 *  y no se repite). Solo lectura: quien quiera el detalle de una bajada la busca por su prenda (píldora «Piso ↔ almacén»
 *  o el buscador), donde cada bajada es su fila. */
function ContenidoBajadas({ b }: { b: DetalleBajadas }) {
  return (
    <>
      <Encabezado titulo={b.titulo} cuando={b.cuando} tipo={b.tipo} />
      <Hero cifra={b.cifra} frase={b.frase} quien={b.quien} />
      <p className="mt-3 text-[13.5px] leading-snug text-taupe">{b.nota}</p>
      {b.ruta && <BloqueRuta ruta={b.ruta} tipo={b.tipo} />}
      <BloquePasos pasos={b.pasos} tipo={b.tipo} />

      <Seccion icono={ListChecks} titulo="Prendas">
        <ul className="-mt-1">
          {b.filas.map((f) => (
            <li
              key={f.id}
              className={`grid items-center gap-3 border-b border-sand py-3 last:border-b-0 ${b.mostrarHora ? "grid-cols-[3rem_auto_minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto]"}`}
            >
              {b.mostrarHora && <span className="text-[13.5px] tabular-nums text-taupe">{f.hora}</span>}
              <MiniaturaPrenda fotoUrl={f.fotoUrl} tamano="md" />
              <div className="min-w-0">
                <p className="line-clamp-2 break-words text-[14.5px] font-semibold leading-snug text-tinta">{f.referencia}</p>
                {f.variante && <p className="truncate text-[13px] text-taupe">{f.variante}</p>}
                {f.sentido && <p className="truncate text-[12.5px] text-taupe">{f.sentido}</p>}
              </div>
              <span className="whitespace-nowrap text-right text-[14px] tabular-nums text-tinta">{f.cantidad}</span>
            </li>
          ))}
        </ul>
      </Seccion>
    </>
  );
}

/** El cuerpo del cajón de UNA operación que no es interna (venta, traslado, devolución, ajuste, cambio…): el mismo
 *  orden para todas — qué prenda (si es una), la frase, lo que había y hay en la tienda, el motivo, la lista, el
 *  documento. Cada bloque aparece solo si esa operación lo tiene. */
function ContenidoOperacion({ d, onVerVenta }: { d: DetalleCajon; onVerVenta?: () => void }) {
  return (
    <>
      <Encabezado titulo={d.titulo} cuando={d.cuando} tipo={d.tipo} />
      {d.prenda && <BloquePrenda prenda={d.prenda} />}
      <Hero cifra={d.cifra} frase={d.frase} donde={d.donde} quien={d.quien} />
      {d.ruta && <BloqueRuta ruta={d.ruta} tipo={d.tipo} />}
      <BloquePasos pasos={d.pasos} tipo={d.tipo} />

      {d.enTienda && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-sand px-5 py-3 text-[14px]">
          <span className="text-taupe">
            En toda la tienda
            <span className="block text-[12.5px] leading-tight">piso y almacén juntos</span>
          </span>
          <span className="tabular-nums text-tinta">
            Había <b>{d.enTienda.antes}</b> · ahora hay <b>{d.enTienda.despues}</b>
          </span>
        </div>
      )}
      {d.motivo && (
        <p className="mt-3 text-[13.5px] leading-snug text-taupe">
          Motivo: <span className="text-tinta">{d.motivo}</span>
        </p>
      )}

      {d.items && (
        <Seccion icono={ListChecks} titulo="Prendas">
          <ListaPrendas items={d.items} />
        </Seccion>
      )}
      {d.devolvio && (
        <Seccion icono={ArrowLeft} titulo="El cliente devolvió">
          <ListaPrendas items={d.devolvio} />
        </Seccion>
      )}
      {d.llevo && (
        <Seccion icono={ArrowRight} titulo="Se llevó">
          <ListaPrendas items={d.llevo} />
        </Seccion>
      )}

      {d.consultar.length > 0 && (
        <Seccion icono={FileText} titulo="Más información">
          <div className="rounded-xl border border-sand px-4">
            {d.consultar.map((c) => (
              <FilaEnlace key={c.clave} link={c} onVerVenta={onVerVenta} />
            ))}
          </div>
        </Seccion>
      )}
    </>
  );
}

export function CajonMovimiento({
  vista,
  onVerVenta,
  onCerrar,
}: {
  vista: VistaCajon;
  /** Solo si hay venta y quien mira ve Historial de ventas: abre `DetalleVentaModal`, ya existente. */
  onVerVenta?: () => void;
  onCerrar: () => void;
}) {
  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  const alEscape = useEscapeLibre(pedirCierre);

  return (
    <Dialog.Root open modal={false} onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={alEscape}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[29.5rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          {/* `key`: pasar de un movimiento a otro re-asienta el contenido sin cerrar/reabrir el cajón (mismo patrón que CajonPrendaExistencias). */}
          <div key={vista.detalle.clave} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={pedirCierre}
              aria-label="Cerrar"
              className="absolute right-5 top-5 z-10 rounded-full p-1.5 text-tinta transition-colors hover:bg-tinta/[0.05] hover:text-rojo"
            >
              <X aria-hidden className="h-5 w-5" strokeWidth={1.5} />
            </button>

            <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-[30px] pb-8 pt-8">
              {vista.tipo === "bajadas" ? <ContenidoBajadas b={vista.detalle} /> : <ContenidoOperacion d={vista.detalle} onVerVenta={onVerVenta} />}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
