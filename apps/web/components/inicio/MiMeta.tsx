import { BarraAvance } from "@/components/ui/BarraAvance";
import { GraficoVentasMeta } from "@/components/rendimiento/GraficoVentasMeta";
import { Etiqueta, Tarjeta } from "@/components/inicio/TarjetasInicio";
import { resumirMiMeta, type MiMeta } from "@/lib/mi-meta-reglas";
import { serieParaGrafico } from "@/lib/rendimiento-meta-reglas";
import { formatoSoles } from "@/lib/resumen-formato";

// ── Mi meta (ADR-0286: la integrante ve SOLO lo suyo; la meta es para acompañar, no para pagar ni evaluar) ─────────────────

export function SeccionMiMeta({ miMeta, cajaAbierta, titulo }: { miMeta: MiMeta; cajaAbierta: boolean | null; titulo: string }) {
  const r = resumirMiMeta(miMeta);
  const ventasTxt = (n: number) => `${n} ${n === 1 ? "venta" : "ventas"}`;
  return (
    <section>
      <Etiqueta>{titulo}</Etiqueta>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {r.hoy.meta !== null && r.hoy.pct !== null ? (
          <Tarjeta etiqueta="Tu meta de hoy" valor={formatoSoles(r.hoy.vendido)}>
            {r.hoy.vendido > 0 ? (
              <>
                {ventasTxt(r.hoy.ventas)} · <b className="font-semibold text-tinta">{r.hoy.pct} %</b> de {formatoSoles(r.hoy.meta)}
              </>
            ) : (
              <>Aún sin ventas · tu meta de hoy es {formatoSoles(r.hoy.meta)}</>
            )}
            <BarraAvance pct={r.hoy.pct} />
          </Tarjeta>
        ) : (
          <Tarjeta etiqueta="Tus ventas de hoy" valor={formatoSoles(r.hoy.vendido)}>
            {r.hoy.ventas > 0 ? `${ventasTxt(r.hoy.ventas)} · ` : ""}Hoy no tienes parte de la meta
          </Tarjeta>
        )}
        <Tarjeta etiqueta="Tu mes" valor={formatoSoles(r.mes.vendido)}>
          <b className="font-semibold text-tinta">{r.mes.pct ?? 0} %</b> de {formatoSoles(r.mes.meta)}
          {r.mes.tocabaPct !== null && ` · a hoy tocaba ${r.mes.tocabaPct} %`}
          <BarraAvance pct={r.mes.pct ?? 0} marca={r.mes.tocabaPct} />
        </Tarjeta>
        <Tarjeta etiqueta="Caja" valor={cajaAbierta === null ? "—" : cajaAbierta ? "Abierta" : "Cerrada"} className="col-span-2 sm:col-span-1">
          {cajaAbierta === null ? "No se pudo leer la caja" : cajaAbierta ? "Puedes vender" : "Ábrela en Caja para vender"}
        </Tarjeta>
      </div>
    </section>
  );
}

export function SeccionMiGrafico({ miMeta }: { miMeta: MiMeta }) {
  const g = serieParaGrafico(miMeta.serie, miMeta.hoy);
  return (
    <section className="space-y-3">
      <GraficoVentasMeta
        titulo="Tus ventas contra tu meta"
        semana={g.semana}
        mes={g.mes}
        inicial="semana"
        etiquetas={{
          ventas: "Tus ventas",
          meta: "Tu meta del día",
          ventasAcum: "Tus ventas acumuladas",
          metaAcum: "Tu meta acumulada",
          tooltip: "Tú",
          deMeta: "tu meta de",
          aria: "Tus ventas",
        }}
        nota="Solo ves lo tuyo: la tienda y tus compañeras no aparecen aquí."
      />
      <p className="nota-cayla">
        La meta es para <b>acompañarte</b>: no se usa para pagar ni para evaluar. Si algo no te cuadra, díselo a tu líder de sede.
      </p>
    </section>
  );
}
