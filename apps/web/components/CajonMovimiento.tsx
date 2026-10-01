"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  ListChecks,
  Package,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { MiniaturaPrenda, SinFoto } from "@/components/ui/PrendaCelda";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { avisar } from "@/components/ui/Avisos";
import { construirDetalleCajon, type ConsultarLink, type ContextoCajon, type DetalleBajadas, type DetalleCajon, type ItemPrenda, type TonoCifra } from "@/lib/movimientos-cajon";
import type { OperacionMovimiento } from "@/lib/movimientos-reglas";

/** Debe coincidir con `.anim-cajon-salida` en globals.css (mismo contrato que `CajonPrendaExistencias`). */
const MS_SALIDA = 240;

/* ====================================================================
   Cajón de detalle de Movimientos (diseño aprobado por Felipe, 2026-09-28)

   Reemplaza dos cosas a la vez: el modal centrado `MovimientoDetalle` (una prenda) y la expansión vertical de
   `FilaOperacion` (muchas prendas guardadas juntas, que antes abrían una lista larga debajo de la fila). Un solo
   cajón lateral, no bloqueante —la página sigue viva detrás—, con 5 formas según lo que pasó (`FormaCajon`):
   grupo (Traslado recibido), individual (Venta), cambio (Sale/Entra), interno (Bajada al piso / Retiro del piso) y
   ajuste (por conteo o manual). Solo CONSULTA: ningún botón de acá ejecuta un movimiento (sección 14 del pedido) —
   eso sigue viviendo en Cambios, Devoluciones, Bajar al piso, Ajustar, cada uno en su propia pantalla.

   También es el cajón de la fila plegada «Bajadas al piso» del día (`vista.tipo === "bajadas"`, 2026-10-01): antes esa
   fila se desplegaba hacia abajo y empujaba la lista. Es el MISMO marco —no un segundo cajón—, así que pasar de las
   bajadas a otra fila (o al revés) cambia el contenido sin cerrar ni volver a deslizar.
   ==================================================================== */

const TONO_TEXTO: Record<TonoCifra, string> = {
  verde: "text-verde-profundo",
  rojo: "text-rojo",
  ambar: "text-ambar-profundo",
  neutro: "text-tinta",
};

function Avatar({ fotoUrl }: { fotoUrl: string | null }) {
  return fotoUrl ? (
    <Image src={fotoUrl} alt="" width={85} height={99} unoptimized className="h-[99px] w-[85px] shrink-0 rounded-[10px] border border-tinta/10 bg-hueso object-cover" />
  ) : (
    <SinFoto tamano="h-[99px] w-[85px]" />
  );
}

/** Las 3 cajas separadas (Venta / Cambio / Bajada / Ajuste): cada celda con su valor grande y su etiqueta debajo. */
function TarjetasResumen({ celdas, mayusculas = false }: { celdas: DetalleCajon["resumen"]; mayusculas?: boolean }) {
  return (
    <div className="mt-6 grid grid-cols-3 gap-2.5">
      {celdas.map((c, i) => (
        <div key={i} className="flex flex-col items-center justify-center gap-1 rounded-xl border border-sand px-2 py-4 text-center">
          <span className={`font-display text-[22px] leading-tight tabular-nums ${c.tono ? TONO_TEXTO[c.tono] : "text-tinta"}`}>{c.valor}</span>
          {c.etiqueta && <span className={`text-[12.5px] text-taupe ${mayusculas ? "label-cayla text-[10.5px]" : ""}`}>{c.etiqueta}</span>}
        </div>
      ))}
    </div>
  );
}

/** La tira dividida de Traslado recibido (y grupo en general): una sola caja, separadores finos adentro. Solo la 1ª
 *  celda es número grande + etiqueta (literal a la captura); las demás, sin etiqueta, son una línea de texto sola —
 *  más chica que el número, para no competir con él. */
function TiraResumen({ celdas }: { celdas: DetalleCajon["resumen"] }) {
  return (
    <div className="mt-6 flex items-stretch divide-x divide-sand rounded-xl border border-sand">
      {celdas.map((c, i) => (
        <div key={i} className={`flex flex-auto flex-col items-center justify-center gap-1 px-3 py-4 text-center ${i === 0 ? "items-start pl-5 text-left" : ""}`}>
          <span
            className={`leading-tight tabular-nums ${c.etiqueta ? "font-display text-[26px]" : "text-[19px] font-semibold"} ${c.tono ? TONO_TEXTO[c.tono] : "text-tinta"}`}
          >
            {c.valor}
          </span>
          {c.etiqueta && <span className="text-[13px] text-taupe">{c.etiqueta}</span>}
        </div>
      ))}
    </div>
  );
}

function Seccion({ icono: Icono, titulo, children }: { icono?: typeof FileText; titulo?: string; children: React.ReactNode }) {
  if (!titulo) return <section className="border-t border-sand pt-1 pb-1">{children}</section>;
  return (
    <section className="border-t border-sand pt-5 pb-1">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-tinta">
        {Icono && <Icono aria-hidden className="h-[18px] w-[18px] text-tinta/70" strokeWidth={1.6} />}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function FilaDatoUI({ icono: Icono, etiqueta, valor, subvalor }: { icono: typeof FileText; etiqueta: string; valor: React.ReactNode; subvalor?: string | null }) {
  return (
    <div className="grid grid-cols-[1.5rem_6.5rem_1fr] items-start gap-3 border-b border-sand py-3 text-[14px] last:border-b-0">
      <Icono aria-hidden className="mt-0.5 h-[17px] w-[17px] text-tinta/60" strokeWidth={1.6} />
      <span className="text-taupe">{etiqueta}</span>
      <span className="min-w-0 text-tinta">
        <span className="block">{valor}</span>
        {subvalor && <span className="mt-0.5 block text-taupe">{subvalor}</span>}
      </span>
    </div>
  );
}

/** Un renglón de la lista «Incluye N prendas»: foto/isotipo, nombre, talla·color, cifra a la derecha. */
function FilaPrenda({ item }: { item: ItemPrenda }) {
  return (
    <div className="flex items-center gap-3 border-b border-sand py-3 last:border-b-0">
      <MiniaturaPrenda fotoUrl={item.fotoUrl} tamano="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-tinta">{item.referencia}</p>
        {item.variante && <p className="truncate text-[13px] text-taupe">{item.variante}</p>}
      </div>
      <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${TONO_TEXTO[item.tono]}`}>{item.cifra}</span>
    </div>
  );
}

/** Una tarjeta de «Sale»/«Entra» (Cambio): foto grande, nombre, cifra grande a la derecha con su unidad debajo. */
function TarjetaCambio({ item }: { item: ItemPrenda }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sand p-3">
      <MiniaturaPrenda fotoUrl={item.fotoUrl} tamano="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-tinta">{item.referencia}</p>
        {item.variante && <p className="truncate text-[13px] text-taupe">{item.variante}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-display text-[22px] leading-tight tabular-nums ${TONO_TEXTO[item.tono]}`}>{item.cifra}</p>
        <p className="text-[12px] text-taupe">{item.unidades === 1 ? "unidad" : "unidades"}</p>
      </div>
    </div>
  );
}

/** Un link de Consultar: solo lectura. `estilo`: "caja" = todos juntos en una sola caja con divisores (Traslado,
 *  Bajada, Cambio); "plana" = fila simple con línea abajo, sin caja (Venta, literal a su captura) — cada forma pinta
 *  la que le corresponde a la SUYA (ver `CajonMovimiento`). */
function FilaConsultar({ link, estilo, onVerVenta }: { link: ConsultarLink; estilo: "caja" | "plana"; onVerVenta?: () => void }) {
  const IconoFinal = link.iconoFinal === "externo" ? ExternalLink : ChevronRight;
  const clase = `flex h-12 items-center gap-3 text-[14.5px] text-tinta transition-colors hover:bg-hueso/60 ${estilo === "caja" ? "border-b border-sand px-4 last:border-b-0" : "border-b border-sand last:border-b-0"}`;
  const contenido = (
    <>
      <FileText aria-hidden className="h-[18px] w-[18px] shrink-0 text-tinta/70" strokeWidth={1.6} />
      <span className="min-w-0 flex-1 truncate underline decoration-tinta/25 underline-offset-2">{link.texto}</span>
      <IconoFinal aria-hidden className="h-4 w-4 shrink-0 text-tinta/50" strokeWidth={1.6} />
    </>
  );
  if (link.onClick === "abrir_venta") {
    return (
      <button type="button" onClick={onVerVenta} className={clase}>
        {contenido}
      </button>
    );
  }
  return link.href ? (
    <Link href={link.href} className={clase}>
      {contenido}
    </Link>
  ) : null;
}

async function copiarReferencia(texto: string) {
  const copiado = await navigator.clipboard?.writeText(texto).then(
    () => true,
    () => false
  );
  if (copiado) avisar.exito("Copiado", { detalle: texto });
}

function CajaReferencia({ referencia, onVerVenta, referenciaEsVenta }: { referencia: DetalleCajon["referencia"]; onVerVenta?: () => void; referenciaEsVenta: boolean }) {
  if (!referencia) return null;
  const cuerpo = (
    <>
      <FileText aria-hidden className="h-[18px] w-[18px] shrink-0 text-tinta/70" strokeWidth={1.6} />
      <span className="min-w-0 flex-1 truncate text-[14.5px] text-tinta underline decoration-tinta/25 underline-offset-2">{referencia.texto}</span>
    </>
  );
  return (
    <div className="flex h-12 items-center gap-3 rounded-xl border border-sand px-4">
      {referencia.href && !referenciaEsVenta ? (
        <Link href={referencia.href} className="flex min-w-0 flex-1 items-center gap-3">
          {cuerpo}
        </Link>
      ) : referenciaEsVenta && onVerVenta ? (
        <button type="button" onClick={onVerVenta} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {cuerpo}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{cuerpo}</span>
      )}
      {referencia.icono === "copiar" ? (
        <button type="button" onClick={() => copiarReferencia(referencia.texto)} aria-label="Copiar referencia" className="shrink-0 text-tinta/50 hover:text-tinta">
          <Copy aria-hidden className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : (
        referencia.href && <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-tinta/50" strokeWidth={1.6} />
      )}
    </div>
  );
}

/** El cuerpo del cajón de las bajadas del día, pensado para leerse sin saber de stock: el nombre de la fila, cuándo, UNA
 *  frase con el número grande («10 prendas pasaron del almacén al piso de venta»), quién lo hizo, y cada prenda con su
 *  hora (la hora va primera, como en la lista) y cuántas. Solo lectura: quien quiera el detalle de una bajada la busca
 *  por su prenda (píldora «Piso ↔ almacén» o el buscador), donde cada bajada es su fila. */
function ContenidoBajadas({ b }: { b: DetalleBajadas }) {
  return (
    <>
      <div className="pr-9">
        <Dialog.Title asChild>
          <h2 className="font-display text-[26px] leading-tight text-tinta">{b.titulo}</h2>
        </Dialog.Title>
        <Dialog.Description className="mt-1 text-[15px] tabular-nums text-taupe">{b.cuando}</Dialog.Description>
      </div>

      <div className="mt-6 rounded-xl border border-sand px-5 py-4">
        <p className="flex items-center gap-4">
          <span className="font-display text-[44px] leading-none tabular-nums text-tinta">{b.cifra}</span>
          <span className="text-balance text-[16px] leading-snug text-tinta">{b.frase}</span>
        </p>
        {b.quien && (
          <p className="mt-3 border-t border-sand pt-3 text-[14px] text-taupe">
            Por <span className="text-tinta">{b.quien}</span>
          </p>
        )}
      </div>
      <p className="mt-3 text-[13.5px] leading-snug text-taupe">{b.nota}</p>

      <Seccion icono={ListChecks} titulo="Prendas">
        <ul className="-mt-1">
          {b.filas.map((f) => (
            <li key={f.id} className="grid grid-cols-[3rem_auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-sand py-3 last:border-b-0">
              <span className="text-[13.5px] tabular-nums text-taupe">{f.hora}</span>
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

/** El cuerpo del cajón de UNA operación (las 5 formas): encabezado, resumen, secciones y «Consultar». Vive aparte del
 *  marco para que el mismo cajón pueda mostrar otro contenido (las bajadas del día) sin cerrarse ni volver a deslizarse. */
function ContenidoOperacion({ d, referenciaEsVenta, onVerVenta }: { d: DetalleCajon; referenciaEsVenta: boolean; onVerVenta?: () => void }) {
  return (
    <>
      {/* Encabezado: foto real solo en «individual» (Venta); isotipo en cambio/interno/ajuste; ninguno en «grupo» (Traslado). */}
      {d.forma === "individual" ? (
        <div className="flex items-center gap-5 pr-9">
          <Avatar fotoUrl={d.fotoUrl} />
          <div className="min-w-0">
            <Dialog.Title asChild>
              <h2 className="font-display text-[26px] leading-tight text-tinta">{d.titulo}</h2>
            </Dialog.Title>
            {d.subtitulo && <Dialog.Description className="mt-1 text-[15px] text-taupe">{d.subtitulo}</Dialog.Description>}
          </div>
        </div>
      ) : d.forma === "grupo" ? (
        <div className="pr-9">
          <Dialog.Title asChild>
            <h2 className="font-display text-[26px] leading-tight text-tinta">{d.titulo}</h2>
          </Dialog.Title>
          {d.subtitulo && <Dialog.Description className="mt-1 text-[15px] text-taupe">{d.subtitulo}</Dialog.Description>}
        </div>
      ) : (
        <div className="flex items-center gap-4 pr-9">
          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[10px] border border-tinta/10 bg-hueso">
            <SinFoto tamano="h-9 w-9" />
          </span>
          <div className="min-w-0">
            <Dialog.Title asChild>
              <h2 className="font-display text-[24px] leading-tight text-tinta">{d.titulo}</h2>
            </Dialog.Title>
            {d.subtitulo && <Dialog.Description className="mt-1 text-[15px] text-taupe">{d.subtitulo}</Dialog.Description>}
          </div>
        </div>
      )}

      {d.forma === "grupo" ? <TiraResumen celdas={d.resumen} /> : <TarjetasResumen celdas={d.resumen} mayusculas={d.forma === "ajuste"} />}

      {/* Referencia: solo grupo/ajuste la ponen ARRIBA del cuerpo (así en las capturas); individual/cambio la
          llevan como una fila más de «Movimiento»/«Referencia» — ver más abajo. */}
      {(d.forma === "grupo" || d.forma === "ajuste") && d.referencia && (
        <div className="mt-6">
          <p className="mb-2 text-[15px] font-semibold text-tinta">Referencia</p>
          <CajaReferencia referencia={d.referencia} referenciaEsVenta={false} />
        </div>
      )}
      {d.forma === "cambio" && d.referencia && (
        <div className="mt-6">
          <p className="mb-2 text-[15px] font-semibold text-tinta">Referencia</p>
          <CajaReferencia referencia={d.referencia} referenciaEsVenta={referenciaEsVenta} onVerVenta={onVerVenta} />
        </div>
      )}

      {d.forma === "interno" && d.notaDetalle && (
        <Seccion icono={ClipboardList} titulo="Detalle">
          <p className="text-[14px] text-taupe">{d.notaDetalle}</p>
        </Seccion>
      )}

      {(d.forma === "grupo" || d.forma === "interno") && d.items && (
        <Seccion icono={ListChecks} titulo="Incluye">
          <p className="-mt-2 mb-3 text-[13.5px] text-taupe">
            {d.items.length} {d.items.length === 1 ? "prenda distinta" : "prendas distintas"}
          </p>
          <ListaPrendas items={d.items} />
        </Seccion>
      )}

      {d.forma === "cambio" && (
        <>
          <Seccion icono={ArrowLeft} titulo="Sale">
            <div className="grid gap-2">{d.sale?.map((it) => <TarjetaCambio key={it.varianteId} item={it} />)}</div>
          </Seccion>
          <Seccion icono={ArrowRight} titulo="Entra">
            <div className="grid gap-2">{d.entra?.map((it) => <TarjetaCambio key={it.varianteId} item={it} />)}</div>
          </Seccion>
        </>
      )}

      {d.forma === "individual" && d.filaMovimiento && (
        <Seccion>
          <FilaDatoUI icono={ArrowLeftRight} etiqueta="Movimiento" valor={d.filaMovimiento.valor} subvalor={d.filaMovimiento.subvalor} />
          {d.referencia && <FilaDatoUI icono={FileText} etiqueta="Referencia" valor={referenciaValor(d.referencia, referenciaEsVenta, onVerVenta)} />}
          {d.stock && (
            <FilaDatoUI
              icono={Package}
              etiqueta="Stock"
              valor={
                <>
                  Antes: <b>{d.stock.antes}</b>
                  <br />
                  Después: <b>{d.stock.despues}</b>
                </>
              }
            />
          )}
          <FilaDatoUI icono={Calendar} etiqueta="Fecha y hora" valor={d.fechaHora} />
          {d.realizadoPor && <FilaDatoUI icono={UserRound} etiqueta="Realizado por" valor={d.realizadoPor} />}
        </Seccion>
      )}

      {d.forma === "ajuste" && (
        <>
          {d.motivo && (
            <Seccion icono={FileText} titulo="Motivo">
              <p className="text-[14px] text-tinta">{d.motivo}</p>
            </Seccion>
          )}
          {d.stock && (
            <Seccion icono={Package} titulo="Stock">
              <p className="text-[14px] text-tinta">
                Antes: <b>{d.stock.antes}</b>
                <br />
                Después: <b>{d.stock.despues}</b>
              </p>
            </Seccion>
          )}
          {d.realizadoPor && (
            <Seccion icono={UserRound} titulo="Realizado por">
              <p className="text-[14px] text-tinta">{d.realizadoPor}</p>
            </Seccion>
          )}
        </>
      )}

      {(d.forma === "grupo" || d.forma === "interno") && (
        <Seccion icono={Calendar} titulo="Fecha y hora">
          <p className="text-[14px] text-tinta">{d.fechaHora}</p>
        </Seccion>
      )}

      {d.notaImpacto && (
        <Seccion icono={BarChart3} titulo={d.forma === "cambio" ? "Stock" : "Impacto"}>
          {d.forma === "cambio" ? (
            <p className="flex items-center gap-2 rounded-lg bg-verde/10 px-3 py-2.5 text-[13.5px] text-verde-profundo">
              <CheckCircle2 aria-hidden className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
              {d.notaImpacto}
            </p>
          ) : (
            <p className="text-[14px] text-taupe">{d.notaImpacto}</p>
          )}
        </Seccion>
      )}

      <Seccion icono={Search} titulo="Consultar">
        {d.forma === "individual" ? (
          <div>
            {d.consultar.map((c) => (
              <FilaConsultar key={c.clave} link={c} estilo="plana" onVerVenta={onVerVenta} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-sand">
            {d.consultar.map((c) => (
              <FilaConsultar key={c.clave} link={c} estilo="caja" onVerVenta={onVerVenta} />
            ))}
          </div>
        )}
      </Seccion>
    </>
  );
}

/** Qué muestra el cajón: UNA operación (las 5 formas) o las bajadas plegadas de un día. */
export type VistaCajon = { tipo: "operacion"; operacion: OperacionMovimiento } | { tipo: "bajadas"; detalle: DetalleBajadas };

export function CajonMovimiento({
  vista,
  contexto,
  onVerVenta,
  onCerrar,
}: {
  vista: VistaCajon;
  contexto: ContextoCajon;
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

  const d = vista.tipo === "operacion" ? construirDetalleCajon(vista.operacion, contexto) : null;
  const referenciaEsVenta = Boolean(d?.referencia && vista.tipo === "operacion" && vista.operacion.filas[0]?.venta && d.forma !== "grupo");

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
          <div key={vista.tipo === "bajadas" ? vista.detalle.clave : d?.clave} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={pedirCierre}
              aria-label="Cerrar"
              className="absolute right-5 top-5 z-10 rounded-full p-1.5 text-tinta transition-colors hover:bg-tinta/[0.05] hover:text-rojo"
            >
              <X aria-hidden className="h-5 w-5" strokeWidth={1.5} />
            </button>

            <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-[30px] pb-8 pt-8">
              {vista.tipo === "bajadas" ? <ContenidoBajadas b={vista.detalle} /> : d && <ContenidoOperacion d={d} referenciaEsVenta={referenciaEsVenta} onVerVenta={onVerVenta} />}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function referenciaValor(r: NonNullable<DetalleCajon["referencia"]>, esVenta: boolean, onVerVenta?: () => void) {
  if (esVenta && onVerVenta) {
    return (
      <button type="button" onClick={onVerVenta} className="text-left underline decoration-tinta/25 underline-offset-2 hover:text-rojo">
        {r.texto}
      </button>
    );
  }
  return r.href ? (
    <Link href={r.href} className="underline decoration-tinta/25 underline-offset-2 hover:text-rojo">
      {r.texto}
    </Link>
  ) : (
    r.texto
  );
}

function ListaPrendas({ items }: { items: ItemPrenda[] }) {
  const TOPE = 6;
  const [expandido, setExpandido] = useState(false);
  const visibles = expandido ? items : items.slice(0, TOPE);
  return (
    <div className="rounded-xl border border-sand px-4">
      {visibles.map((it) => (
        <FilaPrenda key={it.varianteId} item={it} />
      ))}
      {!expandido && items.length > TOPE && (
        <button type="button" onClick={() => setExpandido(true)} className="flex w-full items-center justify-center gap-1 py-3 text-[13.5px] text-taupe hover:text-tinta">
          y {items.length - TOPE} más
          <ChevronDown aria-hidden className="h-4 w-4" strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}
