import { Check, CircleCheck, Clock, Info } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { pasoDeLaRuta, relojDeFila, textoDeCierreDelPedido, type PedidoDetalle } from "@/lib/pedidos-web-reglas";

const PASOS = ["Confirmar", "Cobrar", "Entregar"] as const;

/**
 * La ruta de un pedido, arriba de su hoja: Confirmar → Cobrar → Entregar, con lo hecho en verde y el paso de ahora marcado. A la derecha,
 * cuánto le queda si lo que le queda es urgente (el mismo reloj de la fila de la lista). Un pedido cerrado no tiene ruta: dice cómo terminó,
 * en una línea. Sin estado ni movimiento propio: la hoja la dibuja con su cascada.
 */
export function RutaDelPedido({ pedido: p, ahora }: { pedido: PedidoDetalle; ahora: number }) {
  const paso = pasoDeLaRuta(p.estado);
  if (paso === null) {
    return (
      <p className="flex items-center gap-2.5 rounded-xl bg-hueso px-4 py-3 text-[13.5px] text-tinta" data-guia="pedido-web.ruta">
        {p.estado === "entregado" ? <CircleCheck aria-hidden className="h-5 w-5 shrink-0 text-verde" /> : <Info aria-hidden className="h-5 w-5 shrink-0 text-taupe" />}
        {textoDeCierreDelPedido(p, ahora)}
      </p>
    );
  }
  const reloj = relojDeFila(
    { ...p, porConseguir: p.lineas.filter((l) => l.estado === "por_conseguir" && !l.traslado).length, porTraer: p.lineas.filter((l) => l.traslado || (l.estado === "reservada" && l.ubicacionId !== p.ubicacionId)).length },
    p.plazos,
    ahora,
  );
  // El plazo que corre: lo que le queda para confirmar, o para pagar si no paga nada. Un pedido pagado y listo no tiene plazo que apure.
  const correPlazo = p.estado === "por_confirmar" || (p.estado === "confirmado" && p.pagado === 0) || p.sinRecoger;
  const tono = reloj.tono === "rojo" ? "rojo" : reloj.tono === "ambar" ? "ambar" : "neutro";
  return (
    <ol aria-label="Dónde va el pedido" className="flex flex-wrap items-center gap-x-0 gap-y-2 rounded-xl bg-hueso px-4 py-3" data-guia="pedido-web.ruta">
      {PASOS.map((nombre, i) => {
        const hecho = i < paso;
        const ahoraEs = i === paso;
        return (
          <li key={nombre} className="flex items-center" aria-current={ahoraEs ? "step" : undefined}>
            <span className={`flex items-center gap-2 text-[13px] ${ahoraEs ? "font-semibold text-tinta" : hecho ? "text-tinta" : "text-taupe"}`}>
              <span
                aria-hidden
                className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold ${
                  hecho ? "border-verde bg-verde text-crema" : ahoraEs ? "border-tinta bg-tinta text-crema" : "border-borde-control bg-papel text-taupe"
                }`}
              >
                {hecho ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={!ahoraEs ? "max-sm:hidden" : undefined}>{nombre}</span>
              {hecho && <span className="sr-only">(hecho)</span>}
            </span>
            {i < PASOS.length - 1 && <span aria-hidden className={`mx-3 h-0.5 w-8 rounded sm:w-14 ${i < paso ? "bg-verde" : "bg-sand"}`} />}
          </li>
        );
      })}
      {correPlazo && (
        <li className="ml-auto max-sm:w-full">
          <Chip tono={tono} versalitas={false}>
            <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {reloj.texto.replace("Se cierra solo en", "Se cierra en")}
          </Chip>
        </li>
      )}
    </ol>
  );
}
