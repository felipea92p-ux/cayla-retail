import { CircleCheck, Clock } from "lucide-react";
import { textoLlegada, type SituacionTraslado, type TonoTiempo, type TrasladoLeible } from "@/lib/traslados-reglas";

// La columna «Llegada estimada»: fechas humanas («hoy 12:12», «hace 1 h»,
// «mañana 16:15») en vez de obligar a restar. La frase depende de la
// situación real — ver `textoLlegada`.
const COLOR: Record<TonoTiempo, { principal: string; secundario: string; icono: string }> = {
  // Texto informativo: nunca por debajo de tinta/65 ni con opacidad sobre los colores «profundo» — con
  // /55 y /80 la razón de contraste cae a 3.8:1 y 4.1:1, bajo el 4.5:1 de WCAG AA.
  urgente: { principal: "text-rojo-profundo font-medium", secundario: "text-rojo-profundo", icono: "text-rojo-profundo" },
  aviso: { principal: "text-ambar-profundo font-medium", secundario: "text-ambar-profundo", icono: "text-ambar-profundo" },
  normal: { principal: "text-tinta", secundario: "text-tinta/65", icono: "text-tinta/55" },
  hecho: { principal: "text-tinta/75", secundario: "text-tinta/65", icono: "text-verde" },
};

export function TrasladoLlegada({
  traslado,
  situacion,
  ahoraIso,
}: {
  traslado: TrasladoLeible & { creadoEn: string; cerradoEn: string | null };
  situacion: SituacionTraslado;
  ahoraIso: string;
}) {
  const t = textoLlegada(traslado, situacion, ahoraIso);
  const color = COLOR[t.tono];
  // El ícono NO va antes del texto principal: en la columna angosta se lleva 24 px que la hora
  // necesita para no partirse en dos líneas. Va con la línea de apoyo («🕒 hace 1 h») o, en lo
  // terminado (que no tiene línea de apoyo), con el «Completado».
  return (
    <span className="block">
      <span className={`flex items-center gap-1.5 text-sm ${color.principal}`}>
        {t.tono === "hecho" && <CircleCheck aria-hidden strokeWidth={1.5} className={`h-4 w-4 shrink-0 ${color.icono}`} />}
        {t.principal}
      </span>
      {t.secundario && (
        <span className={`mt-0.5 flex items-center gap-1 text-xs ${color.secundario}`}>
          <Clock aria-hidden strokeWidth={1.5} className={`h-3 w-3 shrink-0 ${color.icono}`} />
          {t.secundario}
        </span>
      )}
    </span>
  );
}
