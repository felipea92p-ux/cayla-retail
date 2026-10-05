"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeftRight, Bandage, Barcode, ClipboardList, FileText, PencilLine, ShoppingBag, Trash2, Truck, Warehouse, X } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { accionesDeTalla, diagnosticoDeTalla, type ClaveAccionTalla } from "@/lib/existencias-panel-talla";
import { ritmoDePrenda, textoDeRitmo } from "@/lib/existencias-colgar-primero";
import { estadoTalla, urlEtiquetas, urlTrasladar, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import type { FilaExistencias } from "@/lib/inventario-v2";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

type Vista = "talla" | "todas" | "ficha";
type Prenda = PrendaAgrupada<FilaExistencias>;
type Icono = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

const ICONO: Record<ClaveAccionTalla, Icono> = {
  colgar: IconoPercha,
  subir: Warehouse,
  enviar: Truck,
  apartar: ShoppingBag,
  pedir: ArrowLeftRight,
  ajustar: PencilLine,
  ficha: ClipboardList,
};

const TONO_DIAGNOSTICO = { ambar: "bg-ambar/[0.10] text-ambar-profundo", pizarra: "bg-pizarra/[0.10] text-pizarra", verde: "bg-verde/[0.10] text-verde" } as const;

const CLASE_TALLA = {
  normal: "border-sand bg-crema",
  por_colgar: "border-ambar/35 bg-ambar/[0.10]",
  sin_atras: "border-sand bg-crema",
  sin_stock: "border-dashed border-sand bg-transparent text-taupe",
} as const;

const solesDe = (n: number | null | undefined) => (n == null ? null : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/* ====================================================================
   El panel de una talla (maqueta `docs/maquetas/existencias-tactil-2026-10/`, 2026-10-05)

   Reemplaza al cajón de la prenda: sale por la derecha (hoja desde abajo en el celular no, el cajón del sistema ya es de ancho
   completo ahí), sin velo, y se cierra con la ✕ o con Escape. Arriba la prenda con su precio; debajo, tres vistas —Esta talla,
   Todas (la matriz de colores y tallas) y Ficha—, el color y la talla para cambiar sin salir, y el cuerpo de la vista.

   «Esta talla»: lo que hay en piso, almacén, apartado y dañado; una frase que dice qué toca; el ritmo; las otras sedes; y siete
   acciones con lo que dicen debajo. Cada acción abre la ventana que ya existía con el permiso que ya calcula la pantalla
   (`accionesDeTalla` decide cuáles se ven y cuáles se apagan). Los pasos guiados dentro del propio panel vienen en el siguiente corte.
   ==================================================================== */
export function PanelTalla({
  colores,
  claveInicial,
  varianteInicial,
  separa,
  puedeReponer,
  puedeEnviar,
  puedeAjustar,
  enSedeActiva,
  puedeEliminar = false,
  puedeReportarDanada = false,
  onReponer,
  onSubir,
  onAjustar,
  onReportarDanada,
  onEliminar,
  onVerApartadas,
  onVerDanadas,
  puedeResolverDanadas = false,
  onCerrar,
}: {
  /** Los colores del modelo, cada uno con sus tallas (`coloresDelModelo`). */
  colores: Prenda[];
  claveInicial: string;
  varianteInicial?: string;
  separa: boolean;
  puedeReponer: boolean;
  puedeEnviar: boolean;
  puedeAjustar: boolean;
  enSedeActiva: boolean;
  puedeEliminar?: boolean;
  puedeReportarDanada?: boolean;
  onReponer: (prenda: Prenda) => void;
  onSubir: (prenda: Prenda) => void;
  onAjustar: (f: FilaExistencias) => void;
  onReportarDanada?: (prenda: Prenda) => void;
  onEliminar?: () => void;
  onVerApartadas?: () => void;
  onVerDanadas?: () => void;
  puedeResolverDanadas?: boolean;
  onCerrar: () => void;
}) {
  const [vista, setVista] = useState<Vista>("talla");
  const [clave, setClave] = useState(claveInicial);
  const [varianteId, setVarianteId] = useState<string | undefined>(varianteInicial);
  // Tocar otra talla en una tarjeta con el panel abierto le cambia la talla y el color, sin cerrarlo ni abrirlo de nuevo.
  const [pedida, setPedida] = useState({ claveInicial, varianteInicial });
  if (pedida.claveInicial !== claveInicial || pedida.varianteInicial !== varianteInicial) {
    setPedida({ claveInicial, varianteInicial });
    setClave(claveInicial);
    setVarianteId(varianteInicial);
    setVista("talla");
  }

  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  const alEscape = useEscapeLibre(pedirCierre);

  const prenda = colores.find((c) => c.clave === clave) ?? colores[0];
  if (!prenda) return null;
  const fila = prenda.tallas.find((t) => t.varianteId === varianteId) ?? prenda.tallas[0];
  const acciones = fila ? accionesDeTalla(fila, { puedeReponer, puedeEnviar, puedeAjustar }, separa) : [];
  const diag = fila ? diagnosticoDeTalla(fila, separa) : null;
  const ritmo = fila ? textoDeRitmo(ritmoDePrenda({ ...prenda, tallas: [fila], disponible: fila.disponible })) : null;
  const precio = solesDe(prenda.precio);
  const tallasDeTodos = [...new Set(colores.flatMap((c) => c.tallas.map((t) => t.talla ?? "Única")))];
  const hrefEnviar = puedeEnviar && fila ? urlTrasladar(prenda.tallas) : null;

  function elegirColor(c: Prenda) {
    setClave(c.clave);
    // Conserva la talla si el otro color la tiene; si no, la primera.
    const misma = c.tallas.find((t) => t.talla === fila?.talla);
    setVarianteId((misma ?? c.tallas[0])?.varianteId);
  }

  function alAccionar(k: ClaveAccionTalla) {
    switch (k) {
      case "colgar":
        return onReponer(prenda);
      case "subir":
        return onSubir(prenda);
      case "ajustar":
        return fila && onAjustar(fila);
      case "ficha":
        return setVista("ficha");
      default:
        return;
    }
  }

  const cifra = (valor: number | null, rotulo: string, abre?: { texto: string; onClick: () => void }) => {
    const cuerpo = (
      <>
        <b className={`font-display text-[30px] font-medium leading-none tabular-nums ${valor ? "text-tinta" : "text-taupe"}`}>{valor ?? 0}</b>
        <small className="text-xs text-taupe">{rotulo}</small>
        {abre && <small className="text-xs font-medium text-tinta underline-offset-2 group-hover:underline">{abre.texto}</small>}
      </>
    );
    const base = "grid gap-0.5 rounded-[14px] border border-sand bg-crema p-2.5 text-left";
    return abre ? (
      <button type="button" onClick={abre.onClick} className={`group ${base} transition-colors hover:border-taupe`}>
        {cuerpo}
      </button>
    ) : (
      <div className={base}>{cuerpo}</div>
    );
  };

  return (
    <Dialog.Root open modal={false} onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={alEscape}
          // Sin velo y sin cerrar al tocar afuera: las tarjetas siguen vivas y tocar otra talla le cambia la talla al panel.
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          {/* Cabecera: la prenda, su marca, categoría y precio. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-sand px-[18px] pb-2.5 pt-3">
            <div className="h-14 w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-sand/50">
              {prenda.fotoUrl ? <Image src={prenda.fotoUrl} alt="" width={92} height={112} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" colorHex={prenda.colorHex} {...categoriaDe(prenda)} />}
            </div>
            <div className="min-w-0">
              <Dialog.Title asChild>
                <h2 className="truncate font-display text-[21px] leading-tight text-tinta">{prenda.referencia}</h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p className="truncate text-[13px] text-taupe">
                  {[prenda.marca, prenda.categoria].filter(Boolean).join(" · ")}
                  {precio && <b className="font-semibold text-tinta">{prenda.marca || prenda.categoria ? " · " : ""}{precio}</b>}
                </p>
              </Dialog.Description>
            </div>
            <button type="button" onClick={pedirCierre} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-full bg-hueso text-tinta transition-colors hover:text-rojo">
              <X aria-hidden className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Vistas, color y talla. */}
          <div className="grid gap-2.5 border-b border-sand px-[18px] py-3">
            <div role="group" aria-label="Vista" className="flex gap-1.5">
              {(
                [
                  ["talla", "Esta talla"],
                  ["todas", "Todas"],
                  ["ficha", "Ficha"],
                ] as const
              ).map(([v, texto]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vista === v}
                  onClick={() => setVista(v)}
                  className="min-h-11 flex-1 rounded-xl border border-sand bg-crema text-sm transition-colors aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-papel"
                >
                  {texto}
                </button>
              ))}
            </div>
            {vista === "talla" && (
              <>
                <div role="radiogroup" aria-label="Color" className="flex flex-wrap items-center gap-2">
                  {colores.map((c) => (
                    <button
                      key={c.clave}
                      type="button"
                      role="radio"
                      aria-checked={c.clave === prenda.clave}
                      aria-label={c.color ?? "Sin color"}
                      title={c.color ?? "Sin color"}
                      onClick={() => elegirColor(c)}
                      style={{ background: c.colorHex ?? "var(--color-hueso)" }}
                      className="h-[30px] w-[30px] rounded-full border-2 border-papel shadow-[0_0_0_1px_var(--color-sand)] aria-checked:shadow-[0_0_0_2px_var(--color-tinta)]"
                    />
                  ))}
                  {prenda.color && <span className="text-sm text-taupe">{prenda.color}</span>}
                </div>
                <div role="group" aria-label="Talla" className="flex flex-wrap gap-1.5">
                  {prenda.tallas.map((t) => {
                    const sel = t.varianteId === fila?.varianteId;
                    return (
                      <button
                        key={t.varianteId}
                        type="button"
                        aria-pressed={sel}
                        onClick={() => setVarianteId(t.varianteId)}
                        className={`grid min-h-14 min-w-[52px] place-items-center content-center gap-px rounded-xl border px-1.5 py-1 leading-none aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-papel ${CLASE_TALLA[estadoTalla(t)]}`}
                      >
                        <b className="text-base font-semibold">{t.talla ?? "Única"}</b>
                        <small className={`text-[11px] tabular-nums ${sel ? "text-sand" : "text-taupe"}`}>{separa ? `${t.pisoDisponible ?? 0} · ${t.almacenDisponible ?? 0}` : t.disponible}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div key={`${vista}-${prenda.clave}`} className="anim-asentar scroll-cayla grid min-h-0 flex-1 content-start gap-3.5 overflow-y-auto px-[18px] pb-[18px] pt-3.5">
            {vista === "talla" && fila && diag && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {cifra(separa ? (fila.pisoDisponible ?? 0) : fila.disponible, separa ? "En piso" : "Disponible")}
                  {separa && cifra(fila.almacenDisponible ?? 0, "En almacén")}
                  {cifra(fila.apartado, "Apartado", fila.apartado > 0 && onVerApartadas ? { texto: "Ver apartados", onClick: onVerApartadas } : undefined)}
                  {cifra(fila.danado ?? 0, "Dañado", (fila.danado ?? 0) > 0 && onVerDanadas ? { texto: puedeResolverDanadas ? "Decidir" : "Ver cuáles", onClick: onVerDanadas } : undefined)}
                </div>
                <p className={`rounded-xl px-3 py-2.5 text-sm ${TONO_DIAGNOSTICO[diag.tono]}`}>{diag.texto}</p>
                {ritmo && <p className="text-sm text-tinta/80">{ritmo}</p>}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="label-cayla mr-1 text-[11px] text-taupe">Otras sedes</span>
                  {(fila.enRed ?? []).length === 0 && fila.enTransito === 0 && <span className="text-sm text-taupe">Ninguna tiene</span>}
                  {(fila.enRed ?? []).map((s) => (
                    <span key={s.sede} className="rounded-full border border-pizarra px-2.5 py-1 text-[13px] font-semibold text-pizarra">
                      {nombreCortoSede(s.sede)} {s.cantidad}
                    </span>
                  ))}
                  {fila.enTransito > 0 && <span className="rounded-full border border-pizarra px-2.5 py-1 text-[13px] font-semibold text-pizarra">En camino {fila.enTransito}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {acciones.map((a, i) => {
                    const Ico = ICONO[a.clave];
                    const clase = `grid min-h-[76px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                      a.sugerida ? "border-tinta bg-tinta text-papel" : "border-sand bg-papel hover:border-taupe"
                    } ${a.ok ? "" : "cursor-not-allowed opacity-50"}`;
                    const contenido = (
                      <>
                        <Ico aria-hidden className={`row-span-2 h-[22px] w-[22px] ${a.sugerida ? "text-sand" : "text-taupe"}`} strokeWidth={1.5} />
                        <b className="text-[15.5px] font-semibold">{a.texto}</b>
                        <small className={`text-xs leading-tight ${a.sugerida ? "text-sand" : "text-taupe"}`}>{a.sub}</small>
                      </>
                    );
                    if (a.clave === "enviar" && a.ok && hrefEnviar)
                      return (
                        <Link key={a.clave} href={hrefEnviar} className={clase}>
                          {contenido}
                        </Link>
                      );
                    return (
                      <button key={a.clave} type="button" aria-disabled={!a.ok} aria-keyshortcuts={String(i + 1)} onClick={() => a.ok && alAccionar(a.clave)} className={clase}>
                        {contenido}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {vista === "todas" && (
              <>
                <p className="text-[13px] text-taupe">Número grande: en piso. Debajo: en almacén. Toca una casilla para elegir esa talla y color.</p>
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-1 text-center text-sm">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-medium text-taupe">Color</th>
                        {tallasDeTodos.map((t) => (
                          <th key={t} className="text-xs font-medium text-taupe">
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {colores.map((c) => (
                        <tr key={c.clave}>
                          <th scope="row" className="whitespace-nowrap text-left text-[13px] font-normal">
                            <span aria-hidden className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: c.colorHex ?? "var(--color-hueso)" }} />
                            {c.color ?? "Sin color"}
                          </th>
                          {tallasDeTodos.map((t) => {
                            const f = c.tallas.find((x) => (x.talla ?? "Única") === t);
                            if (!f) return <td key={t} className="text-taupe/50">·</td>;
                            const sel = c.clave === prenda.clave && f.varianteId === fila?.varianteId;
                            return (
                              <td key={t}>
                                <button
                                  type="button"
                                  aria-pressed={sel}
                                  aria-label={`${c.color ?? "Sin color"} ${t}: ${f.pisoDisponible ?? 0} en piso, ${f.almacenDisponible ?? 0} en almacén`}
                                  onClick={() => {
                                    setClave(c.clave);
                                    setVarianteId(f.varianteId);
                                    setVista("talla");
                                  }}
                                  className={`grid min-h-12 w-full place-items-center rounded-lg border leading-none aria-pressed:border-tinta ${CLASE_TALLA[estadoTalla(f)]}`}
                                >
                                  <b className="text-base font-semibold tabular-nums">{estadoTalla(f) === "sin_stock" ? "—" : separa ? (f.pisoDisponible ?? 0) : f.disponible}</b>
                                  {separa && <small className="text-[11px] tabular-nums text-taupe">{f.almacenDisponible ?? 0}</small>}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {separa && puedeReponer && (
                  <button type="button" onClick={() => onReponer(prenda)} className="btn-cayla btn-primario gap-2 justify-self-start">
                    <IconoPercha aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} />
                    Colgar varias tallas y colores
                  </button>
                )}
              </>
            )}

            {vista === "ficha" && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {colores.slice(0, 3).map((c) => (
                    <div key={c.clave} className="aspect-[3/4] overflow-hidden rounded-xl bg-sand/50">
                      {c.fotoUrl ? <Image src={c.fotoUrl} alt={c.color ?? ""} width={120} height={160} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" colorHex={c.colorHex} {...categoriaDe(c)} />}
                    </div>
                  ))}
                </div>
                <dl className="divide-y divide-sand text-sm">
                  {[
                    ["Precio", precio],
                    ["Categoría", prenda.categoria],
                    ["Marca", prenda.marca],
                    ["Colores", colores.map((c) => c.color).filter(Boolean).join(" · ") || null],
                    ["Código", fila?.sku ?? null],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-2.5">
                        <dt className="text-taupe">{k}</dt>
                        <dd className="text-right text-tinta">{v}</dd>
                      </div>
                    ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  {enSedeActiva && (
                    <Link href={`/productos/${prenda.productoId}/historial`} className="btn-cayla btn-secundario gap-2">
                      <FileText aria-hidden className="h-4 w-4" />
                      Ver historial en esta sede
                    </Link>
                  )}
                  {enSedeActiva && urlEtiquetas(prenda.tallas) && (
                    <Link href={urlEtiquetas(prenda.tallas) as string} className="btn-cayla btn-secundario gap-2">
                      <Barcode aria-hidden className="h-4 w-4" />
                      Imprimir etiquetas
                    </Link>
                  )}
                  {puedeReportarDanada && onReportarDanada && prenda.tallas.some((f) => (f.pisoDisponible ?? 0) + (f.almacenDisponible ?? 0) > 0) && (
                    <button type="button" onClick={() => onReportarDanada(prenda)} className="btn-cayla btn-secundario gap-2">
                      <Bandage aria-hidden className="h-4 w-4" />
                      Reportar dañada
                    </button>
                  )}
                  {puedeEliminar && onEliminar && (
                    <button type="button" onClick={onEliminar} className="btn-cayla btn-peligro gap-2">
                      <Trash2 aria-hidden className="h-4 w-4" />
                      Eliminar el producto
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
