"use client";

import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, Landmark, ReceiptText, Wallet } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { BotonLimpiar } from "@/components/ui/FiltrosPuestos";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { BotonVerMas } from "@/components/ui/VerMas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { celda, Encabezado, fila, Tabla, type Columna } from "@/components/ui/Tabla";
import { PlataPorCuenta } from "@/components/reportes-ventas/PlataPorCuenta";
import { solesCentimos } from "@/lib/flujo-caja-reglas";
import { nombreDeMetodo } from "@/lib/reportes-ventas-reglas";
import {
  cobradoDelFiltro,
  esMixta,
  filtrarVentas,
  hayFiltro,
  hrefEnHistorial,
  numeroDeComprobante,
  opcionesDeVentas,
  parteDeLaVenta,
  SIN_FILTRO,
  sumaDeVentas,
  totalDeLaVenta,
  type FiltroVentas,
  type PlataPorCuenta as Plata,
  type ReportePorEmpresa,
  type TipoComprobante,
  type VentaDelReporte,
} from "@/lib/reportes-por-empresa-reglas";

// «¿Dónde está la plata?» y «Venta por venta» de «CAYLA y CLAURE» (ADR-0667): del total al detalle. Tocar una fila de la plata filtra las ventas que la
// suman (esa cuenta y ese medio, de esa empresa si hay una elegida); cada venta se abre en sus prendas y lleva a Historial. Todo sale de las mismas filas
// de la base (`filtrarVentas`, lógica pura y probada): lo que suma arriba es lo que se ve abajo. Filtra en el navegador: son ~100 ventas al mes.

const POR_PAGINA = 40;
const DIA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });
const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** «14 nov · 23:15»: corto, para que la columna no corte. */
const cuando = (iso: string) => `${DIA.format(new Date(iso)).replace(".", "")} · ${HORA.format(new Date(iso))}`;
const NOMBRE_COMPROBANTE: Record<TipoComprobante, string> = { boleta: "Boleta", factura: "Factura", nota_venta: "Nota de venta" };

// Fecha · Comprobante · Cómo pagó · una columna por empresa · Venta. Pide ~880 px: bajo eso la fila se apila (`lib/tabla-corte-reglas.ts`).
const PLANTILLAS: Record<number, string> = {
  2: "sm:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.4fr)_7rem_7rem_7rem]",
  3: "sm:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.4fr)_7rem_7rem_7rem_7rem]",
};

const Rotulo = ({ children }: { children: string }) => <span className="mr-1 text-taupe sm:hidden">{children}</span>;
const monto = (n: number) => (n === 0 ? "—" : solesCentimos(n));

function ChipComprobante({ v }: { v: VentaDelReporte }) {
  if (!v.comprobante) return <Chip tono="apagado">Sin comprobante</Chip>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Chip tono={v.comprobante.tipo === "nota_venta" ? "ambar" : "pizarra"}>{NOMBRE_COMPROBANTE[v.comprobante.tipo]}</Chip>
      <span className="tabular-nums text-tinta/70">{numeroDeComprobante(v.comprobante)}</span>
    </span>
  );
}

/** «Yape → BCP Empresa · Efectivo → Cajón · Tienda Lima». */
const comoPago = (v: VentaDelReporte) => v.pagos.map((p) => `${nombreDeMetodo(p.metodo)} → ${p.variasCuentas ? "varias cuentas" : (p.cuenta ?? "sin cuenta")}`).join(" · ");

/** `children`: lo que va entre la plata y las ventas (las dos empresas lado a lado, que se dibujan en el servidor). */
export function DetallePorEmpresa({ r, plata, cobradoPorLaCasa, children }: { r: ReportePorEmpresa; plata: Plata; cobradoPorLaCasa: Record<string, number>; children?: ReactNode }) {
  const [filtro, setFiltro] = useState<FiltroVentas>(SIN_FILTRO);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const lista = useRef<HTMLElement>(null);

  const ventas = useMemo(() => filtrarVentas(r, filtro), [r, filtro]);
  const suma = useMemo(() => sumaDeVentas(ventas, r.empresas), [ventas, r.empresas]);
  const cobrado = useMemo(() => cobradoDelFiltro(ventas, filtro), [ventas, filtro]);
  const opciones = useMemo(() => opcionesDeVentas(plata), [plata]);
  const visibles = verTodas ? ventas : ventas.slice(0, POR_PAGINA);
  const plantilla = PLANTILLAS[r.empresas.length] ?? PLANTILLAS[2];
  const nombreEmpresa = (id: string) => r.empresas.find((e) => e.id === id)?.nombre ?? "";

  const poner = (cambio: Partial<FiltroVentas>) => {
    setFiltro((f) => ({ ...f, ...cambio }));
    setAbierta(null);
    setVerTodas(false);
  };

  const columnas: Columna[] = [
    { titulo: "Fecha" },
    { titulo: "Comprobante" },
    { titulo: "Cómo pagó" },
    ...r.empresas.map((e): Columna => ({ titulo: e.nombre, alinear: "der" })),
    { titulo: "Venta", alinear: "der" },
  ];

  return (
    <>
      <PlataPorCuenta
        plata={plata}
        empresas={r.empresas}
        cobradoPorLaCasa={cobradoPorLaCasa}
        elegida={filtro.cuenta}
        onElegir={(f) => {
          poner({ cuenta: filtro.cuenta === f.clave ? null : f.clave, metodo: null });
          lista.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      {children}

      <section ref={lista} aria-label="Venta por venta" data-guia="empresas.ventas" className="scroll-mt-24 space-y-3">
        <TituloSeccion cuenta={ventas.length} dato={solesCentimos(cobrado ?? suma.total)}>
          Venta por venta
        </TituloSeccion>
        <div className="flex flex-wrap items-center gap-2" data-guia="empresas.filtros">
          <DesplegablePildora
            icono={Building2}
            etiqueta="Empresa"
            valor={filtro.empresa ?? TODOS}
            onValor={(v) => poner({ empresa: v === TODOS ? null : v })}
            opciones={[{ valor: TODOS, texto: "Todas" }, ...r.empresas.map((e) => ({ valor: e.id, texto: e.nombre }))]}
          />
          <DesplegablePildora
            icono={Wallet}
            etiqueta="Medio"
            valor={filtro.metodo ?? TODOS}
            onValor={(v) => poner({ metodo: v === TODOS ? null : v })}
            opciones={[{ valor: TODOS, texto: "Todos" }, ...opciones.metodos.map((m) => ({ valor: m, texto: nombreDeMetodo(m) }))]}
          />
          <DesplegablePildora
            icono={Landmark}
            etiqueta="Cuenta"
            valor={filtro.cuenta ?? TODOS}
            onValor={(v) => poner({ cuenta: v === TODOS ? null : v })}
            opciones={[{ valor: TODOS, texto: "Todas" }, ...opciones.cuentas.map((c) => ({ valor: c.clave, texto: c.texto }))]}
          />
          <DesplegablePildora
            icono={ReceiptText}
            etiqueta="Comprobante"
            valor={filtro.comprobante ?? TODOS}
            onValor={(v) => poner({ comprobante: v === TODOS ? null : (v as FiltroVentas["comprobante"]) })}
            opciones={[
              { valor: TODOS, texto: "Todos" },
              { valor: "boleta", texto: "Boleta" },
              { valor: "factura", texto: "Factura" },
              { valor: "nota_venta", texto: "Nota de venta" },
              { valor: "sin", texto: "Sin comprobante" },
            ]}
          />
          <button type="button" className="pildora-cayla" aria-pressed={filtro.soloMixtas} onClick={() => poner({ soloMixtas: !filtro.soloMixtas })}>
            Solo mixtas
          </button>
          {hayFiltro(filtro) && <BotonLimpiar onClick={() => poner(SIN_FILTRO)}>Limpiar filtros</BotonLimpiar>}
        </div>

        {cobrado !== null && ventas.length > 0 && cobrado !== suma.total && (
          <p className="texto-detalle text-taupe">
            Entró así <span className="tabular-nums text-tinta">{solesCentimos(cobrado)}</span>; estas ventas suman <span className="tabular-nums">{solesCentimos(suma.total)}</span> con lo
            que se pagó de otra forma.
          </p>
        )}
        {ventas.length === 0 ? (
          <Vacio tamano="chico" icono={<ReceiptText />}>
            Ninguna venta con estos filtros.
          </Vacio>
        ) : (
          <Tabla>
            <Encabezado columnas={columnas} plantilla={plantilla} />
            {visibles.map((v) => {
              const abiertaEsta = abierta === v.id;
              const historial = hrefEnHistorial(v);
              return (
                <Fragment key={v.id}>
                  <button
                    type="button"
                    className={fila(plantilla, "w-full text-left")}
                    aria-expanded={abiertaEsta}
                    aria-current={abiertaEsta ? "true" : undefined}
                    onClick={() => setAbierta(abiertaEsta ? null : v.id)}
                  >
                    <span className={celda("izq", "tabular-nums")}>{cuando(v.creada)}</span>
                    <span className={celda("izq", "whitespace-normal")}>
                      <ChipComprobante v={v} />
                    </span>
                    <span className={celda("izq", "whitespace-normal text-tinta/80")}>
                      {comoPago(v)}
                      {esMixta(v) && (
                        <>
                          {" "}
                          <Chip tono="neutro" versalitas={false}>
                            Mixta
                          </Chip>
                        </>
                      )}
                    </span>
                    {r.empresas.map((e) => (
                      <span key={e.id} className={celda("der")}>
                        <Rotulo>{e.nombre}</Rotulo>
                        {monto(parteDeLaVenta(v, e.id))}
                      </span>
                    ))}
                    <span className={celda("der", "font-medium")}>
                      <Rotulo>Venta</Rotulo>
                      {solesCentimos(totalDeLaVenta(v))}
                    </span>
                  </button>
                  {abiertaEsta && (
                    <div className="anim-revelar space-y-3 border-t border-sand px-5 py-4" data-guia="empresas.prendas">
                      <ul className="space-y-2.5">
                        {v.prendas.map((p) => (
                          <li key={p.id} className="flex items-center gap-3">
                            <MiniaturaPrenda fotoUrl={p.foto} colorHex={p.colorHex} prefijo={p.categoriaPrefijo} familia={p.categoriaFamilia} categoria={p.categoria} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-tinta">{p.producto}</p>
                              <p className="texto-detalle truncate text-taupe">
                                {[p.talla, p.color, `${p.cantidad} ${p.cantidad === 1 ? "unid." : "unids."}`, p.codigo].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <Chip tono={r.empresas.find((e) => e.id === p.empresaId)?.casa ? "neutro" : "pizarra"} versalitas={false}>
                              {nombreEmpresa(p.empresaId)}
                            </Chip>
                            <span className="w-24 text-right tabular-nums">{solesCentimos(p.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                      <ul className="texto-detalle space-y-1 text-tinta/70">
                        {v.pagos.map((p) => (
                          <li key={p.metodo}>
                            <span className="text-tinta">{nombreDeMetodo(p.metodo)}</span> {solesCentimos(p.monto)} → {p.variasCuentas ? "varias cuentas" : (p.cuenta ?? "sin cuenta")}
                            {p.abonaA ? ` → ${p.abonaA}` : ""}
                            {Object.keys(p.partes).length > 1 &&
                              ` (${Object.entries(p.partes)
                                .map(([id, m]) => `${nombreEmpresa(id)} ${solesCentimos(m)}`)
                                .join(", ")})`}
                          </li>
                        ))}
                      </ul>
                      {historial && (
                        <EnlaceVer href={historial} guia="empresas.historial">
                          Ver en Historial
                        </EnlaceVer>
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })}
            <div className={fila(plantilla, "bg-tinta/[0.04] font-semibold")} role="row">
              <span className={celda("izq")}>
                {ventas.length} {ventas.length === 1 ? "venta" : "ventas"} · {suma.prendas} {suma.prendas === 1 ? "prenda" : "prendas"}
              </span>
              <span className={celda("izq", "hidden sm:block")} />
              <span className={celda("izq", "hidden sm:block")} />
              {r.empresas.map((e) => (
                <span key={e.id} className={celda("der")}>
                  <Rotulo>{e.nombre}</Rotulo>
                  {solesCentimos(suma.porEmpresa[e.id] ?? 0)}
                </span>
              ))}
              <span className={celda("der")}>
                <Rotulo>Venta</Rotulo>
                {solesCentimos(suma.total)}
              </span>
            </div>
          </Tabla>
        )}
        {ventas.length > POR_PAGINA && (
          <BotonVerMas abierto={verTodas} onCambiar={setVerTodas} forma="enlace" texto={`Ver las ${ventas.length}`} />
        )}
      </section>
    </>
  );
}
