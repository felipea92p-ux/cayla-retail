"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { soles } from "@/lib/flujo-caja-reglas";
import {
  hrefTelar,
  mesDelDia,
  sedeDeLaUrl,
  SEDE_TODAS,
  tramosDelOrillo,
  type ClaveSede,
  type SedeTelar,
} from "@/lib/finanzas-telar-reglas";

/**
 * El orillo del telar: la tira tejida que dice cuánto pone cada sede EN ESTA pantalla (Gastos: lo gastado). Cada tramo es un
 * enlace que elige esa sede, como su hilo en la mesa de mando; con una sede elegida, su tramo ocupa todo el ancho y los demás
 * se recogen. Se reacomoda al cambiar (flex-grow, ADR-0136: una vez, sin rebote). Va bajo la cabecera de cada submódulo, que le
 * pasa sus montos (`porSedeDe`).
 */
export function Orillo({ porSede, sedes, que, hoy }: { porSede: Record<ClaveSede, number>; sedes: SedeTelar[]; que: string; hoy: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const tramos = tramosDelOrillo(porSede, sedes);
  if (tramos.length < 2) return null;
  const elegida = sedeDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") });
  const total = tramos.reduce((a, t) => a + t.monto, 0);
  return (
    <nav className="orillo-telar" data-una={elegida !== SEDE_TODAS ? "" : undefined} aria-label={`Cuánto pone cada sede: ${que}`} data-guia="telar.orillo">
      {tramos.map((t) => (
        <Link
          key={t.clave}
          href={hrefTelar(pathname, sp.entries(), { sede: t.clave === elegida ? SEDE_TODAS : t.clave }, { mismaPantalla: true, mesDeHoy: mesDelDia(hoy) })}
          scroll={false}
          className="orillo-tramo"
          data-color={t.color}
          aria-current={t.clave === elegida ? "true" : undefined}
          title={`${t.nombre}: ${soles(t.monto)} ${que} · ${t.pct} %`}
          aria-label={`${t.nombre}: ${soles(t.monto)} ${que}, ${t.pct} %`}
          style={{ flexGrow: Math.max(t.monto, total * 0.004) }}
        />
      ))}
    </nav>
  );
}
