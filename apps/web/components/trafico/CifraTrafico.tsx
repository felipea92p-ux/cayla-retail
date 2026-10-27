import type { CSSProperties } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { diasEntreFechas } from "@/lib/fechas-lima";
import { cambio, miles, type ResumenTrafico } from "@/lib/trafico-reglas";

/**
 * La cifra de la cabecera de Tráfico (ADR-0495; maqueta C «La vitrina»): cuánta gente entró a la tienda online en el período, el cambio
 * contra los días de antes (con su flecha y en palabras: nunca solo con color) y cuántas personas la están mirando ahora.
 */
export function CifraTrafico({ r }: { r: ResumenTrafico }) {
  const total = r.pasos[0];
  const c = cambio(total, r.anterior);
  const dias = diasEntreFechas(r.anteriorDesde, r.anteriorHasta) + 1;
  const tono = c === null || c === 0 ? "neutro" : c > 0 ? "verde" : "ambar";
  const Icono = c === null || c === 0 ? Minus : c > 0 ? TrendingUp : TrendingDown;
  const texto = c === null ? "Pocas personas para comparar" : c === 0 ? "Igual" : `${Math.abs(c)} % ${c > 0 ? "más" : "menos"}`;
  return (
    <div className="anim-sube text-left sm:text-right" style={{ "--i": 1 } as CSSProperties} data-guia="trafico.cifra">
      <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-tinta/70 sm:justify-end">
        <span className="label-cayla text-[11px] text-taupe-profundo">Entraron a la tienda</span>
        {/* El punto verde dice «está vivo»: solo si alguien está mirando de verdad. */}
        <span className="inline-flex items-center gap-2">
          {r.ahora > 0 && <span aria-hidden className="trafico-punto-vivo" />}
          {r.ahora === 0 ? "Ahora, nadie mirando" : `Ahora, ${r.ahora === 1 ? "1 persona mirando" : `${miles(r.ahora)} mirando`}`}
        </span>
      </p>
      <p className="mt-1 flex items-baseline gap-2.5 sm:justify-end">
        <span className="font-display text-[52px] leading-[0.95] tracking-tight">{miles(total)}</span>
        <span className="text-base text-tinta/70">{total === 1 ? "persona" : "personas"}</span>
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-tinta/70 sm:justify-end">
        <Chip tono={tono} versalitas={false}>
          <Icono className="h-3 w-3" aria-hidden />
          {texto}
        </Chip>
        <span>
          que {dias === 1 ? "el día anterior" : `los ${dias} días anteriores`} ({miles(r.anterior)})
        </span>
      </p>
    </div>
  );
}
