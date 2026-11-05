"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ConfianzaChip, ConfianzaDetalle } from "@/components/finanzas/Confianza";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { hrefTelar, mesDelDia, sedeDeLaUrl, SEDE_TODAS, tramosDelOrillo, type ClaveSede, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import type { Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";

// Finanzas ▸ Resumen, «Vendido por sede» (Felipe 2026-10-29, opción 3 del spike «Resumen pulido»). Junta en UNA tarjeta lo que antes eran dos franjas
// finas apiladas: el orillo (cuánto vendió cada sede, ahora más alto y con su leyenda) y la confianza del número («Seguro al 86 %», arriba a la
// derecha, con lo que falta debajo). Cada tramo sigue siendo un enlace que elige esa sede, como su hilo en la mesa de mando. No calcula nada:
// los montos vienen de `vendidoPorSede` y la confianza de `lib/finanzas-confianza.ts`.

export function VendidoPorSede({
  porSede,
  sedes,
  hoy,
  mes,
  confianza,
  falla,
}: {
  porSede: Record<ClaveSede, number>;
  sedes: SedeTelar[];
  hoy: string;
  /** El nombre del mes que se mira («octubre»). */
  mes: string;
  confianza: ConfianzaDatos | null;
  /** Por qué no se pudo medir la confianza, si no se pudo. */
  falla?: string | null;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  // Solo las sedes que vendieron: una en cero no tiene nada que dibujar (el Taller y la Empresa no venden).
  const tramos = tramosDelOrillo(porSede, sedes).filter((t) => t.monto > 0);
  if (tramos.length === 0) return null;
  const elegida = sedeDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") });
  const total = tramos.reduce((a, t) => a + t.monto, 0);
  const ir = (clave: ClaveSede) => hrefTelar(pathname, sp.entries(), { sede: clave === elegida ? SEDE_TODAS : clave }, { mismaPantalla: true, mesDeHoy: mesDelDia(hoy) });
  return (
    <Superficie pad guia="fin-resumen.sedes">
      <CabeceraBloque titulo="Vendido por sede" bajada={`${soles(total)} en ${mes}.`}>
        {confianza ? <ConfianzaChip confianza={confianza} /> : null}
      </CabeceraBloque>
      <nav className="vendido-sede" data-una={elegida !== SEDE_TODAS ? "" : undefined} aria-label={`Cuánto vendió cada sede en ${mes}`}>
        {tramos.map((t) => (
          <Link
            key={t.clave}
            href={ir(t.clave)}
            scroll={false}
            className="orillo-tramo"
            data-color={t.color}
            aria-current={t.clave === elegida ? "true" : undefined}
            title={`${t.nombre}: ${soles(t.monto)} · ${t.pct} %`}
            aria-label={`${t.nombre}: ${soles(t.monto)}, ${t.pct} %`}
            style={{ flexGrow: Math.max(t.monto, total * 0.004) }}
          />
        ))}
      </nav>
      <ul className="vendido-sede-lista" aria-label="Lo vendido por cada sede">
        {tramos.map((t) => (
          <li key={t.clave}>
            <i data-color={t.color} aria-hidden />
            <span>{t.nombre}</span>
            <b className="num">{soles(t.monto)}</b>
            <span className="num text-xs text-taupe">{t.pct} %</span>
          </li>
        ))}
      </ul>
      {confianza ? (
        <div className="mt-3 border-t border-sand pt-3">
          <ConfianzaDetalle confianza={confianza} />
        </div>
      ) : (
        <p className="mt-3 border-t border-sand pt-3 text-sm text-taupe" data-guia="fin-resumen.confianza">
          {falla ?? "No se pudo medir qué tan seguro es este número."}
        </p>
      )}
    </Superficie>
  );
}
