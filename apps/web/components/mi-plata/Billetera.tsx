import { HandCoins } from "lucide-react";
import { soles } from "@/lib/compras-reglas";
import { cuentaDeLaBilletera, detalleTienes, textoPorConfirmar, type MiPlata } from "@/lib/mi-plata-reglas";

// La billetera de Mis compras (maqueta docs/maquetas/mis-compras-rediseno-2026-10/, Felipe 2026-10-24): una cifra grande —lo que tienes para
// comprar— y debajo la cuenta de la ronda en tres columnas: te dieron, compraste, gastaste. Sin ronda abierta no hay nada que contar y
// queda solo la cifra. Si la cifra es negativa, una nota dice qué hacer; si Compras todavía revisa plata anotada, otra dice que ya se puede
// usar. Tinta sobre crema: en modo oscuro se invierte sola, como todo token. Sin JavaScript propio: la dibuja el servidor.
function Menos({ monto }: { monto: number }) {
  // Lo que baja de la plata lleva su «−», salvo cuando no hay nada.
  return <>{monto > 0.004 ? "− " : ""}{soles(monto)}</>;
}

export function Billetera({ plata }: { plata: Pick<MiPlata, "tiene" | "porConfirmar" | "ronda"> }) {
  const cuenta = cuentaDeLaBilletera(plata);
  const revisando = textoPorConfirmar(plata.porConfirmar);
  const negativa = detalleTienes(plata.tiene);
  const antes = cuenta && Math.abs(cuenta.antes) >= 0.005 ? cuenta.antes : null;
  return (
    <section aria-label="Tu plata para compras" data-guia="mi-plata.tienes" className="flex flex-col gap-2.5 rounded-[22px] bg-tinta px-5 pb-4 pt-[18px] text-crema">
      <span className="flex items-baseline justify-between gap-3">
        <span className="label-cayla text-[11px] text-crema/75">Tienes para comprar</span>
        <span className="text-xs tabular-nums text-crema/75" data-guia="mi-plata.ronda" title="Lo comprado y gastado es de esta ronda">
          {plata.ronda.abierta ? `Ronda ${plata.ronda.abierta.texto}` : "Sin ronda"}
        </span>
      </span>
      <p className="font-serif text-[46px] leading-none tabular-nums">
        <span className="mr-1 align-[0.35em] text-2xl text-crema/70">S/</span>
        {plata.tiene < 0 ? "−" : ""}
        {soles(Math.abs(plata.tiene)).slice(3)}
      </p>
      {negativa && <p className="rounded-[10px] bg-crema/10 px-2.5 py-2 text-[12.5px]">{negativa}</p>}
      {cuenta && (
        <dl className="grid grid-cols-3 gap-1.5 border-t border-crema/20 pt-2.5 text-[11.5px]">
          {[
            { clave: "dieron", nombre: "Te dieron", monto: cuenta.dieron, resta: false },
            { clave: "compraste", nombre: "Compraste", monto: cuenta.compraste, resta: true },
            { clave: "gastaste", nombre: "Gastaste", monto: cuenta.gastaste, resta: true },
          ].map((c) => (
            // Los montos quedan alineados abajo aunque un nombre ocupe dos líneas a 375 px.
            <div key={c.clave} className="flex min-w-0 flex-col justify-between gap-px">
              <dt className="text-crema/75">{c.nombre}</dt>
              <dd className="text-sm font-semibold tabular-nums">{c.resta ? <Menos monto={c.monto} /> : soles(c.monto)}</dd>
            </div>
          ))}
        </dl>
      )}
      {antes !== null && (
        <p className="text-xs text-crema/75">
          {antes > 0 ? `Incluye ${soles(antes)} que ya tenías al abrir tu ronda.` : `Al abrir tu ronda te debían ${soles(-antes)}.`}
        </p>
      )}
      {revisando && (
        <p className="flex items-center gap-2 rounded-[10px] bg-crema/10 px-2.5 py-2 text-xs" data-guia="mi-plata.revisando">
          <HandCoins className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {revisando}
        </p>
      )}
    </section>
  );
}
