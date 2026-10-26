import type { CSSProperties } from "react";
import Link from "next/link";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { Aviso } from "@/components/ui/Aviso";
import { soles } from "@/lib/flujo-caja-reglas";
import { alturasPesas, type Balanza, type Pesa } from "@/lib/impuestos-balanza-reglas";

// Finanzas ▸ Impuestos en «El telar» (Felipe 2026-10-23): la balanza del IGV. Lo decide `lib/impuestos-balanza-reglas.ts`;
// aquí solo se dibuja. El brazo aparece ya inclinado (ADR-0136: las pesas que caen esperan la excepción de Finanzas).

const ALTO_PILA = 120;
const entra = (i: number, clase = "") => ({ className: `${clase} anim-entra`.trim(), style: { ["--i" as string]: i } as CSSProperties });

function Pila({ pesas, alturas, x }: { pesas: Pesa[]; alturas: number[]; x: number }) {
  // La pila crece hacia arriba desde el plato (y = 250): cada pesa empieza donde terminó la de abajo, con 2 px de aire.
  const tope = alturas.map((_, i) => 250 - alturas.slice(0, i + 1).reduce((a, h) => a + h + 2, 0));
  return (
    <>
      {pesas.map((p, i) => {
        const h = alturas[i] ?? 0;
        const y = tope[i] ?? 250;
        return (
          <g key={p.clave}>
            <rect x={x - 62} y={y} width={124} height={h} rx={5} className={`fin-pesa-${p.clave}`}>
              <title>{`${p.nombre}: ${soles(p.monto)}`}</title>
            </rect>
            {h > 18 && (
              <text x={x} y={y + h / 2 + 4} textAnchor="middle" className="fin-balanza-pesa-texto">
                {p.nombre}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function Plato({ x, clase, pesas, alturas, titulo, total }: { x: number; clase: string; pesas: Pesa[]; alturas: number[]; titulo: string; total: number }) {
  return (
    <g className={clase}>
      <line x1={x} y1={74} x2={x - 70} y2={252} stroke="var(--color-taupe)" strokeWidth={1.2} />
      <line x1={x} y1={74} x2={x + 70} y2={252} stroke="var(--color-taupe)" strokeWidth={1.2} />
      <Pila pesas={pesas} alturas={alturas} x={x} />
      <path d={`M${x - 88} 252 Q ${x} 282 ${x + 88} 252 Z`} fill="var(--color-hueso)" stroke="var(--color-taupe)" strokeWidth={1.2} />
      <text x={x} y={306} textAnchor="middle" className="fin-balanza-et">
        {titulo}
      </text>
      <text x={x} y={330} textAnchor="middle" className="fin-balanza-total">
        {soles(total)}
      </text>
    </g>
  );
}

function Paso({ etiqueta, monto, fin = false }: { etiqueta: string; monto: number; fin?: boolean }) {
  return (
    <div className={`fin-balanza-paso${fin ? " fin-balanza-fin" : ""}`}>
      <span className="fin-balanza-paso-et">{etiqueta}</span>
      <span className="fin-balanza-v">{soles(monto)}</span>
    </div>
  );
}

const Op = ({ signo }: { signo: string }) => (
  <span className="fin-balanza-op" aria-hidden="true">
    {signo}
  </span>
);

/** `anioSinRenta`: el año cuya tasa de renta falta (la cuenta va sin renta y se ofrece configurarla). */
export function BalanzaIgv({ balanza: b, mesTexto, guia, anioSinRenta }: { balanza: Balanza; mesTexto: string; guia?: string; anioSinRenta?: number | null }) {
  const alturas = alturasPesas(b, ALTO_PILA);
  // Al inclinarse, cada plato sube o baja lo que su punta del brazo (230 px del centro).
  const dy = Math.sin((Math.abs(b.inclinacion) * Math.PI) / 180) * 230 * Math.sign(b.inclinacion);
  const c = b.cuenta;
  const resumen = `IGV que cobraste ${soles(c.cobraste)} contra el de tus compras ${soles(b.compras.total)}: ${c.estado === "pagas" ? `pagas ${soles(c.igv)} de IGV` : `te quedan ${soles(-c.igv)} a favor`}.`;
  const pesasLector = [...b.cobrado.pesas.map((p) => ({ lado: "IGV que cobraste", p })), ...b.compras.pesas.map((p) => ({ lado: "IGV de tus compras", p }))];
  return (
    <Superficie pad guia={guia}>
      <CabeceraBloque titulo="La balanza del IGV" bajada={`${mesTexto}: lo que cobraste al vender contra lo que pagaste en tus compras con factura. Lo que sobra es lo que pagas.`} />
      <div {...entra(1)}>
        <svg className="fin-balanza" viewBox="0 0 680 350" role="img" aria-label={resumen} style={{ ["--ang" as string]: `${-b.inclinacion}deg`, ["--dy" as string]: `${dy.toFixed(1)}px` } as CSSProperties}>
          <path d="M340 74 L340 336 M300 340 h80" stroke="var(--color-tinta)" strokeWidth={3} strokeLinecap="round" fill="none" />
          <Plato x={110} clase="fin-balanza-plato-i" pesas={b.cobrado.pesas} alturas={alturas.cobrado} titulo="IGV QUE COBRASTE" total={b.cobrado.total} />
          <Plato x={570} clase="fin-balanza-plato-d" pesas={b.compras.pesas} alturas={alturas.compras} titulo="IGV DE TUS COMPRAS" total={b.compras.total} />
          <g className="fin-balanza-brazo">
            <line x1={110} y1={74} x2={570} y2={74} stroke="var(--color-tinta)" strokeWidth={4} strokeLinecap="round" />
            <circle cx={110} cy={74} r={4} fill="var(--color-tinta)" />
            <circle cx={570} cy={74} r={4} fill="var(--color-tinta)" />
          </g>
          <circle cx={340} cy={74} r={9} fill="var(--color-papel)" stroke="var(--color-tinta)" strokeWidth={3} />
          <path d="M332 54 L340 40 L348 54" fill="var(--color-rojo)" />
        </svg>
        {/* Para el lector de pantalla: lo mismo que dibujan las pesas (en un div: una tabla no respeta el ancho de `sr-only` y desbordaba a 375 px). */}
        <div className="sr-only">
        <table>{/* unificar-fijo: tabla escondida solo para el lector de pantalla (las pesas en texto), no una lista de registros */}
          <caption>Las pesas de la balanza del IGV</caption>
          <tbody>
            {pesasLector.map(({ lado, p }) => (
              <tr key={`${lado}-${p.clave}`}>
                <th scope="row">{`${lado} · ${p.nombre}`}</th>
                <td>{soles(p.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div aria-label="La cuenta del IGV" {...entra(2, "fin-balanza-cuenta")}>
        <Paso etiqueta="Cobraste" monto={c.cobraste} />
        <Op signo="−" />
        <Paso etiqueta="Tus compras" monto={c.compras} />
        {c.saldoAnterior > 0 && (
          <>
            <Op signo="−" />
            <Paso etiqueta="Saldo que traías" monto={c.saldoAnterior} />
          </>
        )}
        {c.renta !== null && (
          <>
            <Op signo="+" />
            <Paso etiqueta="Renta a cuenta" monto={c.renta} />
          </>
        )}
        <Op signo="=" />
        <Paso etiqueta={c.estado === "pagas" ? "Pagas" : c.renta ? "Pagas (solo la renta)" : "No pagas IGV"} monto={c.pagas} fin />
      </div>
      {c.estado === "a_favor" && c.igv < 0 && <p {...entra(3, "fin-tenue mt-3 text-[13px]")}>Te quedan {soles(-c.igv)} de IGV a favor: se descuentan del mes que viene.</p>}
      {c.renta === null && anioSinRenta && (
        <p className="fin-tenue mt-3 text-[13px]">
          La cuenta va sin el pago a cuenta de renta: falta la tasa del régimen para {anioSinRenta}.{" "}
          <Link href="/configuracion?tab=impuestos" className="btn-enlace">
            Configurarla
          </Link>
        </p>
      )}
      {b.sinReparto && (
        <Aviso tono="info" chico className="mt-3">
          El IGV se declara junto, por el RUC de CAYLA. La balanza por sede llega cuando el sistema reparta el IGV por lugar; mientras tanto, esta es la de CAYLA entera.
        </Aviso>
      )}
      {!b.cuadra && <p className="fin-tenue mt-3 text-[13px]">Las pesas no suman exacto lo que calcula el sistema: la cifra que vale es la de «Pagas».</p>}
    </Superficie>
  );
}
