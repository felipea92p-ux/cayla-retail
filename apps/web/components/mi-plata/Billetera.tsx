import { HandCoins } from "lucide-react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { soles } from "@/lib/compras-reglas";
import { detalleTienes, repartoBilletera, textoPorConfirmar, type MiPlata } from "@/lib/mi-plata-reglas";

// La billetera de Mi plata para compras (maqueta docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23): la plata se lee como en
// una billetera —una cifra grande y de dónde sale— y no como una tarjeta de reporte. La barra es la de todo el ERP (`<BarraApilada>`):
// lo que te queda, lo que compraste y lo que gastaste en la ronda abierta, cuyo número va arriba a la derecha («RC-000003»). Tinta sobre
// crema: en modo oscuro se invierte sola, como todo token.
// Sin JavaScript propio: la dibuja el servidor.
export function Billetera({ plata }: { plata: Pick<MiPlata, "tiene" | "porConfirmar" | "ronda"> }) {
  const r = repartoBilletera(plata);
  const revisando = textoPorConfirmar(plata.porConfirmar);
  // Sobre la tinta, un crema translúcido se pintaría sobre la arena de su tramo y los tres saldrían casi iguales: se mezclan con la
  // tinta de la tarjeta (opacos), como en la maqueta.
  const tono = (pct: number) => `color-mix(in srgb, var(--color-crema) ${pct}%, var(--color-tinta))`;
  // Sin ronda abierta no hay «compraste» ni «gastaste» que contar: solo lo que te queda.
  const tramos = [
    { clave: "queda", nombre: "Te queda", valor: r.queda, color: tono(100) },
    ...(plata.ronda.abierta
      ? [
          { clave: "compraste", nombre: "Compraste", valor: r.compraste, color: tono(45) },
          { clave: "gastos", nombre: "Gastaste", valor: r.gastos, color: tono(25) },
        ]
      : []),
  ];
  return (
    <section aria-label="Tu plata para compras" data-guia="mi-plata.tienes" className="flex flex-col gap-3 rounded-[22px] bg-tinta px-5 pb-4 pt-5 text-crema">
      <span className="flex items-baseline justify-between gap-3">
        <span className="label-cayla text-[11px] text-crema/75">Tienes para comprar</span>
        {plata.ronda.abierta && (
          <span className="text-xs tabular-nums text-crema/75" data-guia="mi-plata.ronda" title="Lo comprado y gastado es de esta ronda">
            Ronda {plata.ronda.abierta.texto}
          </span>
        )}
      </span>
      <p className="font-serif text-[46px] leading-none tabular-nums">
        <span className="mr-1 align-[0.35em] text-2xl text-crema/70">S/</span>
        {soles(plata.tiene).slice(3)}
      </p>
      {plata.tiene < 0 && <p className="text-sm text-crema/80">{detalleTienes(plata.tiene)}</p>}
      <BarraApilada segmentos={tramos} unidad="soles" alto={8} decorativa />
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {tramos.map((t) => (
          // Los montos quedan alineados abajo aunque un nombre ocupe dos líneas a 375 px.
          <div key={t.clave} className="flex min-w-0 flex-col justify-between gap-0.5">
            <dt className="flex items-start gap-1.5 text-crema/75">
              <MuestraTramo color={t.color} className="mt-[3px] shrink-0" />
              {t.nombre}
            </dt>
            <dd className="text-[13px] font-medium tabular-nums">{soles(t.valor)}</dd>
          </div>
        ))}
      </dl>
      {revisando && (
        <p className="flex items-center gap-2 rounded-[10px] bg-crema/10 px-2.5 py-2 text-xs" data-guia="mi-plata.revisando">
          <HandCoins className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {revisando}
        </p>
      )}
    </section>
  );
}
