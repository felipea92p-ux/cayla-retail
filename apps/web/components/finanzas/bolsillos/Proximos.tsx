"use client";

import { useState, type CSSProperties } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Sparkline } from "@/components/ui/Sparkline";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { COLOR_BOLSILLO } from "@/lib/bolsillos-reglas";
import { fechaEnPalabras } from "@/lib/caja-proxima-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { cuandoSale, type PagoProximo, type Proximos as DatosProximos } from "@/lib/proximos-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: «Próximos» (Felipe 2026-11-09). Lo que se paga en las próximas dos semanas, como los próximos cargos
// de la app del banco, con el día en que la caja queda más justa arriba. Solo DIBUJA lo que arma `proximosPagos`.

const VISIBLES = 6;

/** `Sparkline` dibuja la forma de una serie de cero para arriba: un saldo que baja de cero se corre entero, para que se vea la forma y no se salga. */
function paraLaLinea(serie: readonly number[]): number[] {
  const min = Math.min(...serie);
  if (min > 0) return [...serie];
  const max = Math.max(...serie);
  const aire = (max - min) * 0.06 || 1;
  return serie.map((v) => v - min + aire);
}
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function Fila({ p, hoy }: { p: PagoProximo; hoy: string }) {
  return (
    <li className="proximos-fila">
      <span className={`proximos-fecha ${p.atrasada ? "es-vencida" : ""}`} aria-hidden>
        <b>{Number(p.fecha.slice(8, 10))}</b>
        <small>{MESES[Number(p.fecha.slice(5, 7)) - 1]}</small>
      </span>
      <span className="bolsillos-texto">
        <b>
          <span aria-hidden className="proximos-punto" style={{ ["--c" as string]: p.bolsillo ? COLOR_BOLSILLO[p.bolsillo] : "var(--color-taupe)" } as CSSProperties} />
          {p.titulo}
        </b>
        <small className={p.atrasada ? "proximos-vencido" : ""}>
          <span className="sr-only">{`${fechaEnPalabras(p.fecha)}. `}</span>
          {cuandoSale(p, hoy)}
          {p.detalle ? ` · ${p.detalle}` : ""}
        </small>
      </span>
      <span className="bolsillos-monto num">−{soles(p.monto)}</span>
    </li>
  );
}

export function Proximos({ datos, hoy, hrefPorPagar, hrefFlujo }: { datos: DatosProximos; hoy: string; hrefPorPagar: string | null; hrefFlujo: string | null }) {
  const [mas, setMas] = useState(false);
  if (datos.tipo === "sin_dato") {
    return (
      <section className="fin-superficie fin-pad" data-guia="fin-resumen.proximos">
        <TituloSeccion>Próximos</TituloSeccion>
        <p className="bolsillos-motivo">{datos.motivo}</p>
      </section>
    );
  }
  const primeros = datos.pagos.slice(0, VISIBLES);
  const resto = datos.pagos.slice(VISIBLES);
  return (
    <section className="fin-superficie fin-pad proximos" data-guia="fin-resumen.proximos">
      <TituloSeccion cuenta={datos.pagos.length} accion={hrefPorPagar ? <EnlaceVer href={hrefPorPagar}>Por pagar</EnlaceVer> : undefined}>
        Próximos
      </TituloSeccion>
      <p className="mes-a-nota">
        Lo que pagas hasta el {fechaEnPalabras(datos.hasta)}: <b className="num">{soles(datos.total)}</b>
        {datos.incluyeCompra ? ", con la compra de campaña que cuentas en «Inversión en mercadería»." : "."}
      </p>

      {datos.justo && (
        <div className={`proximos-justo es-${datos.justo.tono}`} data-guia="fin-resumen.dia-justo">
          <div className="min-w-0">
            <p className="bolsillos-etiqueta">El día más justo</p>
            <p className="proximos-justo-cifra">
              <span>{datos.justo.fecha === hoy ? "Hoy" : fechaEnPalabras(datos.justo.fecha)}</span> · <b className="num">{soles(datos.justo.saldo)}</b>
            </p>
            <p className="mes-a-nota">{datos.justo.frase}</p>
            {hrefFlujo && (
              <div className="mt-2">
                <EnlaceVer href={hrefFlujo}>Flujo de caja</EnlaceVer>
              </div>
            )}
          </div>
          {datos.serie.length > 2 && (
            <div className="proximos-linea" aria-hidden>
              <Sparkline serie={paraLaLinea(datos.serie)} lleno />
            </div>
          )}
        </div>
      )}

      {datos.pagos.length === 0 ? (
        <p className="bolsillos-motivo">Nada que pagar en estas dos semanas.</p>
      ) : (
        <>
          <ol className="proximos-lista">
            {primeros.map((p) => (
              <Fila key={p.clave} p={p} hoy={hoy} />
            ))}
          </ol>
          {resto.length > 0 && (
            <>
              <FilasDeMas abierto={mas}>
                <ol className="proximos-lista">
                  {resto.map((p) => (
                    <Fila key={p.clave} p={p} hoy={hoy} />
                  ))}
                </ol>
              </FilasDeMas>
              <BotonVerMas abierto={mas} onCambiar={setMas} texto={`Ver ${resto.length} más`} />
            </>
          )}
        </>
      )}
    </section>
  );
}
