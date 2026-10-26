"use client";

import Link from "next/link";
import type { Proveedor, ResumenProveedores } from "@/lib/proveedores";
import type { Hallazgo } from "@/lib/proveedor-analisis-reglas";
import { soles } from "@/lib/compras-reglas";
import { concentracion, paraHoy, totalesDelRanking, type FilaRanking, type MedidaRanking } from "@/lib/proveedores-ranking-reglas";
import { Anillo } from "@/components/ui/Anillo";
import { Aviso } from "@/components/ui/Aviso";
import { TituloSeccion, TituloGrupo } from "@/components/ui/TituloSeccion";
import { LoQueQuizaNoVes } from "@/components/LoQueQuizaNoVes";

// La columna derecha del ranking (dirección «C», Felipe 2026-10-26): «Lo que no se ve a simple vista», en tres bloques por urgencia —
// Para hoy (lo vencido, las entregas atrasadas, lo que te deben), Antes de volver a comprar (cuánto dependes de pocos, el costo por confirmar,
// quién no recibe una compra hace 90 días y los avisos de frenar, plata parada o margen) y Oportunidades (a quién reponer). Reemplaza a las
// cifras de arriba y a «Lo que quizá no ves» de la lista: lo mismo, ordenado por lo que pide actuar primero (INVESTIGACION.md, «manejo por
// excepción»). Las cuentas viven en `proveedores-ranking-reglas.ts` y `proveedor-analisis-reglas.ts`.

const MAX_NOMBRES = 3;

function Nombres({ lista, dato, onAbrir }: { lista: readonly Proveedor[]; dato: (p: Proveedor) => string; onAbrir: (id: string) => void }) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-sm">
      {lista.slice(0, MAX_NOMBRES).map((p) => (
        <li key={p.id} className="flex items-baseline justify-between gap-3">
          <button type="button" className="btn-enlace min-w-0 truncate text-left" onClick={() => onAbrir(p.id)}>
            {p.nombre}
          </button>
          <span className="shrink-0 tabular-nums text-tinta">{dato(p)}</span>
        </li>
      ))}
      {lista.length > MAX_NOMBRES && <li className="text-tinta/65">y {lista.length - MAX_NOMBRES} más</li>}
    </ul>
  );
}

export function ProveedoresLoQueNoSeVe({
  proveedores,
  resumen,
  filas,
  medida,
  hallazgos,
  onAbrir,
}: {
  /** Los proveedores de mercadería activos (lo de hoy se cuenta sobre ellos, tengan compras o no). */
  proveedores: readonly Proveedor[];
  resumen: ResumenProveedores | null;
  /** Todas las filas del ranking, sin filtrar: la concentración y los totales son de todos. */
  filas: readonly FilaRanking[];
  medida: MedidaRanking;
  hallazgos: readonly Hallazgo[];
  onAbrir: (id: string) => void;
}) {
  const hoy = paraHoy(proveedores);
  const totales = totalesDelRanking(filas);
  const vendidas = filas.reduce((a, f) => a + f.unidadesVendidas, 0);
  const vendidoPct = totales.prendas > 0 ? (vendidas / totales.prendas) * 100 : 0;
  const top10 = concentracion(filas, medida);
  const sin90 = resumen?.sinCompras90d ?? 0;
  const antes = hallazgos.filter((h) => h.tono === "atencion");
  const oportunidades = hallazgos.filter((h) => h.tono !== "atencion");
  const nada = hoy.vencidos.length === 0 && hoy.atrasados.length === 0 && hoy.aFavor.length === 0;

  return (
    <aside data-guia="proveedores.lado" className="card-cayla space-y-5 p-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
      <TituloSeccion>Lo que no se ve a simple vista</TituloSeccion>

      <div className="flex items-center gap-3 rounded-xl bg-hueso/60 px-3 py-2.5 text-sm text-tinta">
        <Anillo pct={vendidoPct} tamano="chico" decorativa>
          <span className="text-[10.5px] font-semibold tabular-nums">{Math.round(vendidoPct)}%</span>
        </Anillo>
        <p>
          <b className="font-semibold tabular-nums">{totales.prendas.toLocaleString("es-PE")}</b> prendas compradas a {filas.length} {filas.length === 1 ? "proveedor" : "proveedores"};{" "}
          <b className="font-semibold tabular-nums">{vendidas.toLocaleString("es-PE")}</b> ya se vendieron.
        </p>
      </div>

      <section className="space-y-2.5" data-guia="proveedores.para-hoy">
        <TituloGrupo>Para hoy</TituloGrupo>
        {hoy.vencidos.length > 0 && (
          <Aviso
            tono="atencion"
            titulo={`${soles(hoy.vencido)} ya vencieron con ${hoy.vencidos.length} ${hoy.vencidos.length === 1 ? "proveedor" : "proveedores"}`}
            accion={
              <Link href="/compras/por-pagar" className="btn-enlace">
                Ir a pagar
              </Link>
            }
          >
            <p>Págalo antes de pedirles más.</p>
            <Nombres lista={hoy.vencidos} dato={(p) => soles(p.saldo_vencido ?? 0)} onAbrir={onAbrir} />
          </Aviso>
        )}
        {hoy.atrasados.length > 0 && (
          <Aviso
            tono="atencion"
            titulo={`${hoy.atrasadas} ${hoy.atrasadas === 1 ? "entrega atrasada" : "entregas atrasadas"}`}
            accion={
              <Link href="/compras/recibir" className="btn-enlace">
                Ir a recibir
              </Link>
            }
          >
            <p>Reclámalas antes de que se acumulen.</p>
            <Nombres lista={hoy.atrasados} dato={(p) => `${p.facturas_atrasadas} ${p.facturas_atrasadas === 1 ? "entrega" : "entregas"}`} onAbrir={onAbrir} />
          </Aviso>
        )}
        {hoy.aFavor.length > 0 && (
          <Aviso tono="exito" titulo={`Te deben ${soles(hoy.favor)}`}>
            <p>Notas de crédito a tu favor: se descuentan al pagarles.</p>
            <Nombres lista={hoy.aFavor} dato={(p) => soles(p.saldo_favor ?? 0)} onAbrir={onAbrir} />
          </Aviso>
        )}
        {nada && (
          <Aviso tono="exito" chico>
            Nada vencido, nada atrasado.
          </Aviso>
        )}
      </section>

      <section className="space-y-2.5">
        <TituloGrupo>Antes de volver a comprar</TituloGrupo>
        {filas.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-hueso/60 px-3 py-2.5 text-sm text-tinta">
            <Anillo pct={top10} tamano="chico" tono="tinta" decorativa>
              <span className="text-[10.5px] font-semibold tabular-nums">{Math.round(top10)}%</span>
            </Anillo>
            <p>
              de lo que compras {medida === "soles" ? "(en dinero)" : "(en prendas)"} es de tus <b className="font-semibold">{Math.min(10, filas.length)}</b> primeros proveedores.
            </p>
          </div>
        )}
        {totales.cargaPct > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-hueso/60 px-3 py-2.5 text-sm text-tinta">
            <Anillo pct={totales.cargaPct} tamano="chico" tono="tinta" decorativa>
              <span className="text-[10.5px] font-semibold tabular-nums">{Math.round(totales.cargaPct)}%</span>
            </Anillo>
            <p>
              de lo que compraste vino por la carga inicial: su costo y su margen están <b className="font-semibold">por confirmar</b>.
            </p>
          </div>
        )}
        {sin90 > 0 && (
          <Aviso tono="info" chico>
            {sin90 === 1 ? "1 proveedor no recibe" : `${sin90} proveedores no reciben`} una compra hace más de 90 días: ¿siguen siendo proveedores?
          </Aviso>
        )}
        <LoQueQuizaNoVes guia="proveedores.analisis" hallazgos={antes} enColumna onVer={onAbrir} />
      </section>

      {oportunidades.length > 0 && (
        <section className="space-y-2.5">
          <TituloGrupo>Oportunidades</TituloGrupo>
          <LoQueQuizaNoVes guia="proveedores.oportunidades" hallazgos={oportunidades} enColumna onVer={onAbrir} />
        </section>
      )}
    </aside>
  );
}
