"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, FunnelX } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Buscador } from "@/components/ui/Buscador";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { Vacio } from "@/components/ui/Vacio";
import { CabeceraDinero } from "@/components/finanzas/CabeceraDinero";
import { PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { VerPorPagar } from "@/components/finanzas/PorPagarAcciones";
import { soles } from "@/lib/compras-reglas";
import { fechaCorta, solesRedondo, type UbicacionGastos, type Ver } from "@/lib/gastos-reglas";
import { colorDeSede } from "@/lib/dinero-telar-reglas";
import { debesPulso } from "@/lib/dinero-pulso-reglas";
import { TEXTO_NATURALEZA, TONO_NATURALEZA, diasHasta, puedePagar, resumenTramos, textoUnidad, textoVence, totalPorPagar, type FilaPorPagar, type NaturalezaDeuda } from "@/lib/por-pagar-consolidado-reglas";
import { DIAS_CALENDARIO, burbujasDeDeudas, filtrarDeudas, filtrosPuestosDeuda, leerFiltrosDeuda, type FiltrosDeuda } from "@/lib/que-debes-reglas";

// Finanzas ▸ Cuentas y dinero ▸ Qué debes (ADR-0195 F4; El telar, Felipe 2026-10-23): una sola lista de todo lo que CAYLA debe
// —mercadería, gastos, activos e insumos del Taller— con cada factura como una burbuja del color de su sede y del tamaño de su
// saldo sobre un calendario de 30 días. Las cifras de cada tramo filtran, la lista se busca y se filtra por tipo, y cada filtro se ve
// puesto y se quita. Los filtros viven en la URL (?tramo=, ?tipo=, ?q=) y filtran aquí mismo, sin volver a la base. Solo lee: cada
// factura se paga con el pago que ya existe en su libro (Compras o Producción), abierto con `?pagar=<id>`; ninguna regla de pago
// vive en Finanzas.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const plural = (n: number) => `${n} ${n === 1 ? "factura" : "facturas"}`;
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// El calendario: 1000 de ancho; lo vencido a la izquierda, los 30 días en el medio y «más adelante» a la derecha.
const ANCHO = 1000;
const ALTO = 220;
const BASE = 168;
const X0 = 120;
const X1 = 880;
const xDe = (columna: number) => (columna < 0 ? 52 : columna > DIAS_CALENDARIO ? 948 : X0 + (columna * (X1 - X0)) / DIAS_CALENDARIO);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function diaMas(hoy: string, n: number): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function PorPagarConsolidado({
  filas,
  ver,
  unidades,
  esLider,
  pagaCompras,
  hoy,
  falla,
}: {
  filas: FilaPorPagar[];
  ver: Ver;
  unidades: UbicacionGastos[];
  esLider: boolean;
  /** ¿Esta cuenta registra pagos de Compras? (el líder, o el módulo Por pagar; `fn_puede_pagar_compras`). */
  pagaCompras: boolean;
  hoy: string;
  falla: string | null;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const deLaUrl = leerFiltrosDeuda(params);
  // Lo que se escribe vive aquí (la URL guarda lo buscado sin espacios sobrantes: si la caja leyera de la URL, se comería el espacio
  // entre dos palabras mientras se escribe).
  const [busqueda, setBusqueda] = useState(deLaUrl.q);
  const f: FiltrosDeuda = { ...deLaUrl, q: busqueda.trim() };
  const verTodas = !ver.ubicacionId && !ver.soloEmpresa;
  const nombre = ver.soloEmpresa ? "la empresa" : ver.ubicacionId ? (unidades.find((u) => u.id === ver.ubicacionId)?.nombre ?? "la tienda") : null;
  const tramos = resumenTramos(filas, hoy);
  const vistas = useMemo(() => filtrarDeudas(filas, f, hoy), [filas, f.tramo, f.tipo, f.q, hoy]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = totalPorPagar(vistas);
  const cuenta = { esLider, pagaCompras };
  const hayPagables = vistas.some((x) => puedePagar(x, cuenta));
  const puestos = filtrosPuestosDeuda(f);
  const tipos = (Object.keys(TEXTO_NATURALEZA) as NaturalezaDeuda[]).filter((t) => filas.some((x) => x.naturaleza === t));
  const debes = debesPulso(filas, hoy);
  const hrefPagar = (id: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("pagar", id);
    return `${ruta}?${p}`;
  };

  // Un filtro cambia la URL sin volver al servidor (la lista ya está aquí): «atrás» y compartir el enlace lo conservan.
  function poner(cambio: Partial<FiltrosDeuda>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambio)) {
      if (v) p.set(k, String(v));
      else p.delete(k);
    }
    p.delete("pagar");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${ruta}?${qs}` : ruta);
  }

  function quitar(clave: keyof FiltrosDeuda | "todo") {
    if (clave === "q" || clave === "todo") setBusqueda("");
    poner(clave === "todo" ? { tramo: null, tipo: null, q: "" } : { [clave]: null });
  }

  const burbujas = burbujasDeDeudas(vistas, hoy);
  const porId = new Map(vistas.map((x) => [x.id, x]));
  const sedesEnBurbujas = [...new Set(vistas.map((x) => x.ubicacionId))];

  return (
    <div className="space-y-6">
      <CabeceraDinero pestana="porpagar" esLider={esLider} conteos={{ porpagar: filas.length }} acciones={<VerPorPagar ver={ver} unidades={unidades} esLider={esLider} />} />

      {falla ? (
        <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>
      ) : (
        <>
          <p className="din-debes-frase anim-entra" style={{ ["--i" as string]: 0 } as CSSProperties}>
            {debes.frase}
          </p>

          <section className="fin-cifras din-cifras-dos" data-guia="fin-por-pagar.cifras">
            {tramos.map((t, i) => (
              <TarjetaCifra
                key={t.clave}
                etiqueta={t.etiqueta}
                tono={t.clave === "vencidas" && t.monto > 0 ? "text-rojo" : undefined}
                valor={solesRedondo(t.monto)}
                onClick={() => poner({ tramo: f.tramo === t.clave ? null : t.clave })}
                activa={f.tramo === t.clave}
                {...entra(i + 1)}
              >
                {plural(t.n)}
              </TarjetaCifra>
            ))}
          </section>

          {filas.length === 0 ? (
            <div {...entra(5)}>
              <Superficie>
                <Vacio icono={<Check />} titulo={`Todo pagado: ${nombre ? `${mayuscula(nombre)} no debe nada` : "CAYLA no debe nada"}`}>
                  Ninguna factura de mercadería, gasto, activo ni insumo del Taller tiene saldo. Lo pagado y lo anulado no aparecen aquí.
                </Vacio>
              </Superficie>
            </div>
          ) : (
            <>
              <Superficie className="anim-sube" guia="fin-por-pagar.burbujas">
                <TituloDeTarjeta
                  titulo="Lo que vence en 30 días"
                  bajada="Cada círculo es una factura, del color de su sede y del tamaño de lo que falta pagar. Tócalo para pagarla."
                />
                <div className="din-agenda-marco">
                  <svg className="din-agenda" viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`Calendario de pagos: ${plural(vistas.length)} por ${solesRedondo(total.saldo)}`}>
                    <rect className="din-agenda-semana" x={X0} y={14} width={xDe(7) - X0} height={BASE - 14} rx={8} />
                    <text className="din-agenda-rotulo" x={X0 + 8} y={30}>
                      esta semana
                    </text>
                    <line className="din-agenda-linea" x1={20} x2={ANCHO - 20} y1={BASE} y2={BASE} />
                    <text className="din-agenda-dia" x={xDe(-1)} y={BASE + 22} textAnchor="middle">
                      vencidas
                    </text>
                    {[0, 7, 14, 21, DIAS_CALENDARIO].map((d) => (
                      <g key={d}>
                        <line className="din-agenda-marca" x1={xDe(d)} x2={xDe(d)} y1={BASE} y2={BASE + 6} />
                        <text className="din-agenda-dia" x={xDe(d)} y={BASE + 22} textAnchor="middle">
                          {d === 0 ? "hoy" : diaMas(hoy, d)}
                        </text>
                      </g>
                    ))}
                    <text className="din-agenda-dia" x={xDe(DIAS_CALENDARIO + 1)} y={BASE + 22} textAnchor="middle">
                      después
                    </text>
                    <line className="din-agenda-hoy" x1={xDe(0)} x2={xDe(0)} y1={14} y2={BASE} />
                    {burbujas.map((b, i) => {
                      const x = porId.get(b.id)!;
                      const pagable = puedePagar(x, cuenta);
                      const ir = () => router.push(hrefPagar(x.id), { scroll: false });
                      const titulo = `${x.proveedor} · ${soles(x.saldo)} · ${textoVence(x, hoy)}${x.ubicacionId ? ` · ${textoUnidad(x)}` : ""}`;
                      return (
                        <g
                          key={b.id}
                          className="din-burbuja"
                          data-vencida={b.columna < 0 ? "" : undefined}
                          style={{ ["--i" as string]: i, ["--c" as string]: colorDeSede(x.ubicacionId, unidades) } as CSSProperties}
                          {...(pagable
                            ? {
                                role: "link",
                                tabIndex: 0,
                                "aria-label": `Pagar ${titulo}`,
                                onClick: ir,
                                onKeyDown: (e: KeyboardEvent) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    ir();
                                  }
                                },
                              }
                            : {})}
                        >
                          <title>{titulo}</title>
                          <circle cx={xDe(b.columna)} cy={BASE - b.alto} r={b.r} />
                        </g>
                      );
                    })}
                  </svg>
                </div>
                {sedesEnBurbujas.length > 0 && (
                  <ul className="din-agenda-leyenda" aria-label="De qué sede es cada color">
                    {sedesEnBurbujas.map((id) => (
                      <li key={id ?? "empresa"} style={{ ["--c" as string]: colorDeSede(id, unidades) } as CSSProperties}>
                        <i aria-hidden="true" />
                        {id ? (unidades.find((u) => u.id === id)?.nombre ?? "Tienda") : "De la empresa"}
                      </li>
                    ))}
                  </ul>
                )}
              </Superficie>

              <Superficie className="anim-sube" guia="fin-por-pagar.lista">
                <TituloDeTarjeta
                  titulo={verTodas ? "Todo lo que CAYLA debe" : `Lo que debe ${nombre}`}
                  bajada={
                    ver.ubicacionId
                      ? "Mercadería, gastos, activos e insumos del Taller. Cada factura cuenta entera para la tienda que la pidió, aunque parte de la mercadería vaya a otra."
                      : "Mercadería, gastos, activos e insumos del Taller en una sola lista."
                  }
                >
                  {pagaCompras && (
                    <Link href="/compras/por-pagar" className="btn-cayla btn-secundario btn-chico" data-guia="fin-por-pagar.varias">
                      Pagar varias de un proveedor
                    </Link>
                  )}
                </TituloDeTarjeta>
                <div className="din-filtros" data-guia="fin-por-pagar.filtros">
                  <div className="min-w-0 flex-1 sm:max-w-sm">
                    <Buscador
                      valor={busqueda}
                      onCambio={(v) => {
                        setBusqueda(v);
                        poner({ q: v.trim() });
                      }}
                      etiqueta="Buscar un proveedor o una factura"
                      placeholder="Busca un proveedor o una factura" // sugerir-fijo: dice qué se busca, no un ejemplo que dependa de lo elegido
                    />
                  </div>
                  {tipos.length > 1 &&
                    tipos.map((t) => (
                      <button key={t} type="button" className="pildora-cayla" aria-pressed={f.tipo === t} onClick={() => poner({ tipo: f.tipo === t ? null : t })}>
                        {TEXTO_NATURALEZA[t]}
                      </button>
                    ))}
                </div>
                {puestos.length > 0 && (
                  <div className="din-puestos" aria-label="Filtros puestos">
                    {puestos.map((p) => (
                      <FiltroPuesto key={p.clave} onQuitar={() => quitar(p.clave)} etiqueta={`Quitar el filtro ${p.texto}`}>
                        {p.texto}
                      </FiltroPuesto>
                    ))}
                    {puestos.length > 1 && <BotonLimpiar onClick={() => quitar("todo")}>Limpiar todo</BotonLimpiar>}
                  </div>
                )}
                {vistas.length === 0 ? (
                  <Vacio
                    icono={<FunnelX />}
                    titulo="Nada coincide con estos filtros"
                    filtros={puestos.map((p) => ({ texto: p.texto, onQuitar: () => quitar(p.clave) }))}
                  >
                    Quita un filtro para ver más.
                  </Vacio>
                ) : (
                  <div className="fin-tabla-wrap">
                    <table className="fin-tabla">
                      <thead>
                        <tr>
                          <th>Vence</th>
                          <th className="min-w-[190px]">Proveedor · factura</th>
                          <th>Tipo</th>
                          {verTodas && <th className="min-w-[110px]">Sede</th>}
                          <th className="fin-num">Total</th>
                          <th className="fin-num">Pagado</th>
                          <th className="fin-num">Saldo</th>
                          {hayPagables && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {vistas.map((x) => {
                          const vencida = diasHasta(x.vence, hoy) < 0;
                          return (
                            <tr key={`${x.origen}-${x.id}`}>
                              <td data-l="Vence" className="whitespace-nowrap">
                                {fechaCorta(x.vence)}
                                <span className={`fin-sub ${vencida ? "text-rojo-profundo" : ""}`}>{textoVence(x, hoy)}</span>
                              </td>
                              <td className="fin-ancha" data-l="Proveedor">
                                <b>{x.proveedor}</b>
                                <span className="fin-sub">{x.concepto ? `${x.documento} · ${x.concepto}` : x.documento}</span>
                              </td>
                              <td data-l="Tipo">
                                <Chip versalitas={false} tono={TONO_NATURALEZA[x.naturaleza]}>
                                  {TEXTO_NATURALEZA[x.naturaleza]}
                                </Chip>
                              </td>
                              {verTodas && (
                                <td data-l="Sede">
                                  <span className="din-sede-chip" style={{ ["--c" as string]: colorDeSede(x.ubicacionId, unidades) } as CSSProperties}>
                                    <i aria-hidden="true" />
                                    {textoUnidad(x)}
                                  </span>
                                </td>
                              )}
                              <td className="fin-num" data-l="Total">
                                {soles(x.total)}
                              </td>
                              <td className="fin-num" data-l="Pagado">
                                {soles(x.pagado)}
                              </td>
                              <td className="fin-num" data-l="Saldo">
                                <b>{soles(x.saldo)}</b>
                              </td>
                              {hayPagables && (
                                <td className="fin-num">
                                  {puedePagar(x, cuenta) && (
                                    <Link href={hrefPagar(x.id)} scroll={false} className="btn-cayla btn-secundario btn-chico" aria-label={`Pagar ${x.proveedor} ${x.documento}`} data-guia="fin-por-pagar.pagar">
                                      Pagar
                                    </Link>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <PieTabla>
                  <span>
                    {plural(total.n)} · {solesRedondo(total.saldo)} por pagar{verTodas ? "" : ` de ${nombre}`}
                    {puestos.length > 0 ? ` (de ${plural(filas.length)})` : ""}
                  </span>
                  <span>Lo pagado y lo anulado no aparecen.</span>
                </PieTabla>
              </Superficie>
            </>
          )}

          <p className="nota-cayla anim-entra" style={{ ["--i" as string]: 6 } as CSSProperties}>
            La planilla no está en esta lista porque la paga Dynamic.{" "}
            {esLider || pagaCompras
              ? "«Pagar» abre el mismo pago de Compras (o de Producción, para la tela del Taller): el pago queda en su factura."
              : "Los pagos los registra quien tiene Por pagar en Compras; aquí se ve cuándo vence cada uno."}
          </p>
        </>
      )}
    </div>
  );
}
