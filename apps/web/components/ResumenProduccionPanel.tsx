import Link from "next/link";
import { soles } from "@/lib/compras-reglas";
import { cantidadTexto } from "@/lib/insumos-reglas";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { ETIQUETA_ESTADO_MODELO, type CifrasResumen, type Decision, type EstadoModelo, type FilaModelo, type FilaTela } from "@/lib/produccion-decisiones";

// Resumen de Producción (ADR-0133, F6): «¿qué necesita mi decisión hoy?». Cada tarjeta nace de datos que ya existen y lleva su evidencia; desaparece sola
// cuando el dato cambia. Solo hechos y cuentas sobre datos medidos. El rojo de la pantalla (máximo 2) lo lleva únicamente la cifra de «Por pagar» cuando hay algo
// vencido; las tarjetas usan ámbar y tinta. Es un componente de servidor: no tiene estado, solo enlaces a la pantalla donde se resuelve cada cosa.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const TONO_ESTADO: Record<EstadoModelo, TonoChip> = { producir_ya: "ambar", en_produccion: "neutro", vigilar: "neutro", alcanza: "verde", sobrestock: "neutro", sin_ritmo: "apagado" };

const BORDE_SEVERIDAD: Record<Decision["severidad"], string> = { 3: "border-l-ambar", 2: "border-l-ambar/45", 1: "border-l-tinta/20" };

const ICONO: Record<Decision["tipo"], string> = {
  entrega: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  insumo: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  recibir: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  pago: "M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  producir: "M3 17l6-6 4 4 8-8M15 7h6v6",
  sobrestock: "M10 5v14M14 5v14",
  minimo: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
};

export function ResumenProduccionPanel({ decisiones, cifras, modelos, telas, falloRed }: { decisiones: Decision[]; cifras: CifrasResumen; modelos: FilaModelo[]; telas: FilaTela[]; falloRed: string | null }) {
  const maxDias = 60; // la escala de la barra: hasta el techo de «alta cobertura» de Inventario

  return (
    <div className="space-y-6">
      <div className="anim-entra flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Producción</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">¿Qué necesita mi decisión hoy?</h1>
          <p className="mt-1 max-w-xl text-sm text-tinta/65">Lo que pide acción en el Taller, del más urgente al menos. Cada tarjeta sale de los datos de abajo y desaparece cuando lo resuelves.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/produccion/ordenes" className="label-cayla rounded-md border border-tinta/25 px-4 py-3 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
            Ver órdenes
          </Link>
          <Link href="/produccion/ordenes?nueva=auto" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo">
            + Nueva orden
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaCifra
          compacta
          punto={cifras.insumosBajoMinimo > 0 ? "ambar" : "verde"}
          etiqueta="Capital en insumos"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          vacia={cifras.capitalInsumos === null || cifras.capitalInsumos === 0}
          valor={cifras.capitalInsumos === null || cifras.capitalInsumos === 0 ? "—" : <CifraQueCuenta valor={cifras.capitalInsumos} formato="soles" alMontar />}
          detalleTono={cifras.insumosBajoMinimo > 0 ? "text-ambar-profundo" : undefined}
        >
          {cifras.insumosBajoMinimo > 0 ? `${plural(cifras.insumosBajoMinimo, "insumo bajo el mínimo", "insumos bajo el mínimo")}` : "a costo de cada lote"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto="verde"
          etiqueta="Valor en proceso"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          vacia={cifras.valorEnProceso === 0}
          valor={cifras.valorEnProceso === 0 ? "—" : <CifraQueCuenta valor={cifras.valorEnProceso} formato="soles" alMontar />}
        >
          tela y avíos de {plural(cifras.ordenesEnProceso, "orden abierta", "órdenes abiertas")}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={cifras.vencido > 0 ? "rojo" : cifras.porPagar > 0 ? "ambar" : "verde"}
          etiqueta="Por pagar a proveedores"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          vacia={cifras.porPagar === 0}
          valor={cifras.porPagar === 0 ? "—" : <CifraQueCuenta valor={cifras.porPagar} formato="soles" alMontar />}
          detalleTono={cifras.vencido > 0 ? "text-rojo-profundo" : undefined}
        >
          {cifras.vencido > 0 ? `${soles(cifras.vencido)} ya vencidos` : cifras.porPagar > 0 ? "nada vencido" : "no se debe nada"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={cifras.entregasEnRiesgo > 0 ? "ambar" : "verde"}
          etiqueta="Entregas por atender"
          className="anim-entra"
          style={{ ["--i" as string]: 3 }}
          valor={<CifraQueCuenta valor={cifras.entregasEnRiesgo} alMontar />}
        >
          {cifras.entregasEnRiesgo > 0 ? "vencidas o por vencer en 2 días" : "ninguna vencida ni por vencer"}
        </TarjetaCifra>
      </div>

      <section aria-label="Para decidir" className="space-y-3">
        <h2 className="font-display flex flex-wrap items-baseline gap-x-3 text-xl text-tinta">
          Para decidir
          <small className="font-sans text-xs text-tinta/65">{decisiones.length === 0 ? "nada por ahora" : plural(decisiones.length, "asunto", "asuntos")}</small>
        </h2>
        {decisiones.length === 0 ? (
          <div className="card-cayla p-5 text-sm text-tinta/75">
            <b className="font-semibold text-tinta">Todo en orden.</b> Nada pide tu decisión ahora.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {decisiones.map((d, i) => (
              <li key={d.id} className={`card-cayla anim-entra grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 border-l-4 px-4 py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${BORDE_SEVERIDAD[d.severidad]}`} style={{ ["--i" as string]: Math.min(i, 8) }}>
                <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-tinta/70 stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONO[d.tipo]} />
                </svg>
                <div className="min-w-0">
                  <h3 className="text-[14.5px] font-medium text-tinta">{d.titulo}</h3>
                  <p className="mt-0.5 text-[13px] text-tinta/70">{d.detalle}</p>
                </div>
                <Link
                  href={d.accion.href}
                  className="label-cayla col-span-2 rounded-md border border-tinta/25 px-3.5 py-2.5 text-center text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo sm:col-span-1 sm:justify-self-end"
                >
                  {d.accion.texto}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="produce" aria-label="Qué producir" className="space-y-2.5">
        <h2 className="font-display flex flex-wrap items-baseline gap-x-3 text-xl text-tinta">
          ¿Qué producir?
          <small className="font-sans text-xs text-tinta/65">días que dura el stock de las tiendas al ritmo medido · marcas en 7 y 30 días</small>
        </h2>
        {falloRed && <p className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">{falloRed}</p>}
        {modelos.length === 0 ? (
          <p className="card-cayla p-5 text-sm text-tinta/70">Todavía no hay modelos con variantes en el catálogo para producir.</p>
        ) : (
          <div className="card-cayla overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_5rem_5.5rem_minmax(9rem,1.2fr)_5rem_9rem] gap-4 border-b border-tinta/10 px-4 py-2.5 md:grid">
              <span className="label-cayla text-[11px] text-tinta/65">Modelo</span>
              <span className="label-cayla text-right text-[11px] text-tinta/65">Stock</span>
              <span className="label-cayla text-right text-[11px] text-tinta/65">Ventas/sem.</span>
              <span className="label-cayla text-[11px] text-tinta/65">Cobertura</span>
              <span className="label-cayla text-right text-[11px] text-tinta/65">En prod.</span>
              <span className="label-cayla text-[11px] text-tinta/65">Sugerencia</span>
            </div>
            <ul>
              {modelos.map((m) => {
                const pct = m.diasRed === null ? 0 : Math.min(100, (m.diasRed / maxDias) * 100);
                return (
                  <li key={m.productoId} className="border-b border-tinta/10 last:border-b-0">
                    <Link
                      href={`/produccion/ordenes?nueva=${m.productoId}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 outline-none transition-colors hover:bg-sand/40 focus-visible:bg-sand/40 md:grid-cols-[minmax(0,1.4fr)_5rem_5.5rem_minmax(9rem,1.2fr)_5rem_9rem]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] text-tinta">{m.referencia}</span>
                        <span className="block text-xs text-tinta/65 md:hidden">
                          stock {m.stockRed} · {m.ritmoDia ? `${(Math.round(m.ritmoDia * 7 * 10) / 10).toLocaleString("es-PE")}/sem.` : "sin ritmo"}
                        </span>
                      </span>
                      <span className="hidden text-right text-[13px] tabular-nums text-tinta md:block">{m.stockRed}</span>
                      <span className="hidden text-right text-[13px] tabular-nums text-tinta md:block">{m.ritmoDia ? (Math.round(m.ritmoDia * 7 * 10) / 10).toLocaleString("es-PE") : <span className="text-tinta/45">—</span>}</span>
                      <span className="col-span-2 md:col-span-1">
                        {m.diasRed === null ? (
                          <span className="text-xs text-tinta/55">Sin ventas medidas</span>
                        ) : (
                          <>
                            <span className="relative block h-2 rounded-full bg-sand" role="img" aria-label={`${Math.round(m.diasRed)} días de stock`}>
                              <span className="absolute inset-y-0 left-0 rounded-full bg-tinta" style={{ width: `${pct}%` }} />
                              <span aria-hidden className="absolute -top-0.5 h-3 w-px bg-tinta/45" style={{ left: `${(7 / maxDias) * 100}%` }} />
                              <span aria-hidden className="absolute -top-0.5 h-3 w-px bg-tinta/45" style={{ left: `${(30 / maxDias) * 100}%` }} />
                            </span>
                            <span className="mt-1 block text-xs tabular-nums text-tinta/65">
                              {Math.round(m.diasRed)} días{m.stockTaller > 0 ? ` · +${m.stockTaller} en el Taller` : ""}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="hidden text-right text-[13px] tabular-nums text-tinta md:block">{m.enProduccion || <span className="text-tinta/45">—</span>}</span>
                      <span className="col-span-2 md:col-span-1">
                        <Chip tono={TONO_ESTADO[m.estado]}>{ETIQUETA_ESTADO_MODELO[m.estado]}</Chip>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section aria-label="Alcanza la tela" className="space-y-2.5">
        <h2 className="font-display flex flex-wrap items-baseline gap-x-3 text-xl text-tinta">
          ¿Alcanza la tela?
          <small className="font-sans text-xs text-tinta/65">lo que hay y lo que viene facturado, contra lo que las órdenes abiertas todavía necesitan</small>
        </h2>
        {telas.length === 0 ? (
          <p className="card-cayla p-5 text-sm text-tinta/70">
            No hay telas en el catálogo.{" "}
            <Link href="/produccion/insumos" className="underline underline-offset-2 hover:text-rojo">
              Cárgalas en Insumos
            </Link>
            .
          </p>
        ) : (
          <ul className="card-cayla overflow-hidden">
            {telas.map((t) => (
              <li key={t.insumoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-tinta/10 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_8rem_11rem]">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-tinta">{t.nombre}</span>
                  <span className="block text-xs text-tinta/65">
                    hay {cantidadTexto(t.saldo, t.unidad)} · {t.porLlegar > 0 ? `${cantidadTexto(t.porLlegar, t.unidad)} facturados por recibir` : "nada por recibir"}
                  </span>
                </span>
                <span className="hidden text-right text-[13px] tabular-nums text-tinta sm:block">{t.piden > 0 ? `piden ${cantidadTexto(t.piden, t.unidad)}` : <span className="text-tinta/45">—</span>}</span>
                <span className="sm:justify-self-end">
                  {t.estado === "sin_demanda" ? (
                    <Chip tono="neutro">Sin demanda</Chip>
                  ) : t.estado === "alcanza" ? (
                    <Chip tono="verde">Alcanza</Chip>
                  ) : t.estado === "alcanza_si_llega" ? (
                    <Chip tono="ambar">Alcanza si llega</Chip>
                  ) : (
                    <Chip tono="ambar">Faltan {cantidadTexto(t.faltan, t.unidad)}</Chip>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-tinta/60">
          «Piden» se calcula con el consumo real medido de las órdenes cerradas de cada modelo; un modelo sin órdenes cerradas con insumos descontados todavía no aporta demanda.
        </p>
      </section>
    </div>
  );
}
