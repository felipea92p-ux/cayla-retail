import Link from "next/link";
import type { ReactNode } from "react";
import { Ayuda } from "@/components/Ayuda";
import {
  AYUDA,
  SIMPLIFICACIONES,
  avisosDe,
  esEmpresa,
  etiquetaOrigenMerma,
  porcentajeMargen,
  separarFilas,
  sinActividad,
  solesConSigno,
  textoPorcentaje,
  type FilaResultados,
} from "@/lib/resultados-reglas";

// Estado de Resultados (ADR-0109 / ADR-0120): «¿ganamos este mes?», una tarjeta por sede (small
// multiples: comparar de un vistazo, nunca un selector que esconda las otras), «De la empresa» aparte y
// el consolidado arriba. Cada cifra lleva su «(!)» que dice de dónde sale. No calcula plata: todo viene
// sumado de Postgres (`fn_estado_resultados`, que lee del diario `fn_asientos`).
//
// El rojo es información, no decoración: solo el consolidado lo usa (un número negativo real). Las
// tarjetas de sede muestran el signo menos, sin pintarse de rojo — con cinco sedes en pérdida la pantalla
// entera sería roja y dejaría de señalar nada.

function Linea({
  signo,
  etiqueta,
  ayuda,
  valor,
  tono,
  total = false,
  pie,
}: {
  signo?: "−" | "=";
  etiqueta: string;
  ayuda?: { titulo: string; texto: string };
  valor: ReactNode;
  tono?: string;
  total?: boolean;
  pie?: ReactNode;
}) {
  return (
    <div className={total ? "border-t border-tinta/15 pt-2" : ""}>
      <div className="flex items-baseline justify-between gap-3">
        <dt className={`text-sm ${total ? "font-medium text-tinta" : "text-tinta/80"}`}>
          {signo && <span className="mr-1.5 text-tinta/45">{signo}</span>}
          {etiqueta}
          {ayuda && (
            <Ayuda titulo={ayuda.titulo}>
              <p>{ayuda.texto}</p>
            </Ayuda>
          )}
        </dt>
        <dd className={`whitespace-nowrap text-sm tabular-nums ${total ? "font-display text-lg" : ""} ${tono ?? "text-tinta"}`}>{valor}</dd>
      </div>
      {pie && <div className="mt-1 text-xs text-tinta/60">{pie}</div>}
    </div>
  );
}

function Tarjeta({ fila, principal = false }: { fila: FilaResultados; principal?: boolean }) {
  const apagada = sinActividad(fila);
  const empresa = esEmpresa(fila);
  const avisos = avisosDe(fila);
  const pct = porcentajeMargen(fila);
  // Una sola definición del desglose de gastos: la usan la tarjeta de empresa y las demás.
  const desgloseGastos = fila.detalleGastos.length > 0 && (
    <details>
      <summary className="cursor-pointer">Por cuenta</summary>
      <ul className="mt-1 space-y-0.5">
        {fila.detalleGastos.map((d) => (
          <li key={d.cuenta} className="flex justify-between gap-3">
            <span>
              {d.nombre} <span className="text-tinta/40">· {d.cuenta}</span>
            </span>
            <span className="tabular-nums">{solesConSigno(d.monto)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
  // Rojo solo en el consolidado y solo si el número es negativo de verdad.
  const rojo = (n: number) => (principal && n < 0 ? "text-rojo" : undefined);

  return (
    <section
      aria-label={fila.nombre}
      className={`card-cayla p-5 ${principal ? "lg:col-span-full" : ""} ${apagada ? "border-dashed bg-transparent" : ""}`}
    >
      <h2 className="label-cayla text-[11px] text-tinta/65">{fila.nombre}</h2>

      <div className={principal ? "grid gap-6 lg:grid-cols-2" : ""}>
      {apagada ? (
        <p className="mt-3 text-sm text-tinta/60">Sin ventas ni gastos este mes.</p>
      ) : empresa ? (
        <div className="mt-3">
          <dl>
            <Linea
              etiqueta="Gastos de operación"
              ayuda={AYUDA.gastos}
              total
              valor={solesConSigno(fila.gastosOperacion)}
              pie={desgloseGastos}
            />
          </dl>
          <p className="mt-3 text-xs text-tinta/60">Oficina, contador, software: no pertenecen a ninguna tienda. Solo se suman en el consolidado.</p>
        </div>
      ) : (
        <dl className="mt-3 space-y-2">
          <Linea etiqueta="Ventas netas" ayuda={AYUDA.ventas} valor={solesConSigno(fila.ventasNetas)} pie={`Con IGV: ${solesConSigno(fila.ventasBrutas)}`} />
          <Linea signo="−" etiqueta="Costo de ventas" ayuda={AYUDA.costo} valor={solesConSigno(fila.costoVentas)} />
          <Linea
            signo="−"
            etiqueta="Mermas"
            ayuda={AYUDA.mermas}
            valor={solesConSigno(fila.mermas)}
            pie={
              fila.detalleMermas.length > 0 && (
                <details>
                  <summary className="cursor-pointer">De dónde salen</summary>
                  <ul className="mt-1 space-y-0.5">
                    {fila.detalleMermas.map((d) => (
                      <li key={d.regla} className="flex justify-between gap-3">
                        <span>{etiquetaOrigenMerma(d.regla)}</span>
                        <span className="tabular-nums">{solesConSigno(d.monto)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )
            }
          />
          <Linea signo="−" etiqueta="Fletes de compra" ayuda={AYUDA.fletes} valor={<span className="text-tinta/50">sin registrar</span>} />
          <Linea
            signo="="
            etiqueta="Margen bruto"
            ayuda={AYUDA.margen}
            total
            valor={solesConSigno(fila.margenBruto)}
            tono={rojo(fila.margenBruto)}
            pie={pct === null ? undefined : `${textoPorcentaje(pct)} de las ventas netas`}
          />
          <Linea
            signo="−"
            etiqueta="Gastos de operación"
            ayuda={AYUDA.gastos}
            valor={solesConSigno(fila.gastosOperacion)}
            pie={desgloseGastos}
          />
          <Linea signo="=" etiqueta="Utilidad operativa" ayuda={AYUDA.utilidad} total valor={solesConSigno(fila.utilidadOperativa)} tono={rojo(fila.utilidadOperativa)} />
        </dl>
      )}

      {avisos.length > 0 && (
        <ul className={`space-y-1.5 ${principal ? "mt-3 lg:self-start" : "mt-4"}`}>
          {avisos.map((a) => (
            <li key={a.texto} className={`rounded-md border px-3 py-2 text-xs leading-snug ${a.tono === "rojo" ? "border-rojo/30 bg-rojo/10 text-rojo-profundo" : "border-ambar/30 bg-ambar/10 text-ambar-profundo"}`}>
              {a.texto}
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}

export function EstadoResultadosVista({
  filas,
  tituloMes,
  mesAnterior,
  mesSiguiente,
}: {
  filas: FilaResultados[];
  tituloMes: string;
  mesAnterior: string;
  mesSiguiente: string | null;
}) {
  const { consolidado, sedes, empresa } = separarFilas(filas);

  return (
    <div className="space-y-8">
      <header>
        <p className="label-cayla text-[11px] text-tinta/60">Finanzas</p>
        <h1 className="font-display text-3xl text-tinta">Estado de resultados</h1>
        <nav className="mt-2 flex items-center gap-3 text-sm text-tinta/70" aria-label="Mes">
          <Link href={`?mes=${mesAnterior}`} className="underline-offset-2 hover:text-rojo hover:underline" aria-label="Mes anterior">
            ‹
          </Link>
          <span className="capitalize text-tinta">{tituloMes}</span>
          {mesSiguiente ? (
            <Link href={`?mes=${mesSiguiente}`} className="underline-offset-2 hover:text-rojo hover:underline" aria-label="Mes siguiente">
              ›
            </Link>
          ) : (
            <span aria-hidden className="text-tinta/25">
              ›
            </span>
          )}
          <span className="text-tinta/55">· ventas sin IGV, mes calendario de Lima</span>
        </nav>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {consolidado && <Tarjeta fila={consolidado} principal />}
        {sedes.map((f) => (
          <Tarjeta key={f.ubicacionId} fila={f} />
        ))}
        {empresa && <Tarjeta fila={empresa} />}
      </div>

      <section aria-label="Lo que este estado simplifica" className="max-w-3xl">
        <h2 className="label-cayla text-[11px] text-tinta/60">Lo que este estado simplifica</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-tinta/70">
          {SIMPLIFICACIONES.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
