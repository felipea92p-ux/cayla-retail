import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { TarjetaComprador } from "./TarjetaComprador";
import { textoCierre } from "./DetalleComprador";
import { gastoDeRonda, porRevisarDeRonda, type RondaDeCompras } from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { nombreDelMes } from "@/lib/comprobantes-lista-reglas";
import { primerNombre } from "@/lib/fondos-reglas";

// Lo que se DIBUJA de Compras ▸ Compradores (ADR-0704): la página lee y esta vista dibuja, sin leer nada (así se prueba con datos inventados).
// `rondas = null`: no se pudo leer, y lo dice. `entregar` y `porDefinir` son piezas de cliente que arma la página.

const LIMITE_CERRADAS = 8;

export function CompradoresVista({ rondas, hoy, entregar, porDefinir }: { rondas: RondaDeCompras[] | null; hoy: string; entregar?: ReactNode; porDefinir?: ReactNode }) {
  const abiertas = (rondas ?? []).filter((r) => r.cerradaEn === null);
  const cerradas = (rondas ?? []).filter((r) => r.cerradaEn !== null).slice(0, LIMITE_CERRADAS);
  const mes = hoy.slice(0, 7);
  const comprasDelMes = (rondas ?? []).flatMap((r) => r.compras).filter((c) => c.fecha.startsWith(mes));
  const gastadoMes = comprasDelMes.reduce((a, c) => a + c.monto, 0);
  // Quién compró se lee de la ronda: una compra de «Mis compras» siempre es de quien abrió su ronda.
  const personasMes = new Set((rondas ?? []).filter((r) => r.compras.some((c) => c.fecha.startsWith(mes))).map((r) => r.personaId)).size;
  const porRevisar = (rondas ?? []).reduce((a, r) => a + porRevisarDeRonda(r), 0);
  const mesNombre = nombreDelMes(hoy);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Compradores"
        subtitulo="Quién está comprando con plata de CAYLA y en qué la gastó."
        ayuda="Cada persona abre una ronda en «Mis compras», anota lo que compra y lo manda a la tienda. Aquí ves cuánto le diste, cuánto gastó y qué falta revisar."
        acciones={entregar}
      />

      {rondas === null ? (
        <Aviso tono="error" titulo="No se pudo leer quién está comprando">
          Vuelve a intentarlo en un momento.
        </Aviso>
      ) : (
        <>
          <div className="@container">
            <div data-guia="compradores.cifras" className="grid grid-cols-1 gap-3 @[36rem]:grid-cols-3">
              <TarjetaCifra etiqueta="Comprando ahora" valor={abiertas.length} unidad={abiertas.length === 1 ? "persona" : "personas"}>
                Con su ronda abierta
              </TarjetaCifra>
              <TarjetaCifra etiqueta={`Gastado en ${mesNombre}`} valor={soles(gastadoMes)}>
                {comprasDelMes.length === 0 ? "Sin compras este mes" : `En ${comprasDelMes.length} ${comprasDelMes.length === 1 ? "compra" : "compras"} de ${personasMes} ${personasMes === 1 ? "persona" : "personas"}`}
              </TarjetaCifra>
              <TarjetaCifra etiqueta="Por revisar" valor={porRevisar} unidad={porRevisar === 1 ? "compra" : "compras"} punto={porRevisar > 0 ? "ambar" : "verde"}>
                {porRevisar > 0 ? "Falta pasar su papel a los libros" : "Todo revisado"}
              </TarjetaCifra>
            </div>
          </div>

          {porDefinir}

          <section className="space-y-3">
            <TituloGrupo cuenta={abiertas.length}>Comprando ahora</TituloGrupo>
            {abiertas.length === 0 ? (
              <div className="card-cayla">
                <Vacio icono={<Users />} titulo="Nadie está comprando ahora" acciones={entregar}>
                  Cuando alguien abra su ronda en «Mis compras», aparece aquí.
                </Vacio>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {abiertas.map((r) => (
                  <TarjetaComprador key={r.id} ronda={r} hoy={hoy} />
                ))}
              </div>
            )}
          </section>

          {cerradas.length > 0 && (
            <section className="space-y-3" data-guia="compradores.cerradas">
              <TituloGrupo cuenta={cerradas.length}>Rondas que ya cerraron</TituloGrupo>
              <ul className="card-cayla divide-y divide-sand p-0">
                {cerradas.map((r) => (
                  <LineaRondaCerrada key={r.id} ronda={r} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function LineaRondaCerrada({ ronda: r }: { ronda: RondaDeCompras }) {
  return (
    <li>
      <Link
        href={`/compras/compradores/${r.personaId}?ronda=${r.id}`}
        className="grid grid-cols-[2rem_minmax(0,1fr)_auto_1rem] items-center gap-x-4 px-5 py-3 text-sm @container sm:grid-cols-[2rem_minmax(0,1fr)_auto_auto_1rem] vd-pasa"
      >
        <AvatarPersona personaId={r.personaId} nombre={r.persona} tamano={32} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-tinta">{primerNombre(r.persona)}</span>
          <span className="block text-secundario">
            Del {diaMes(r.abiertaEn)} al {diaMes(r.cerradaEn)} · {r.cuenta.compras} {r.cuenta.compras === 1 ? "compra" : "compras"}
          </span>
        </span>
        <span className="hidden text-secundario sm:block">{textoCierre(r)}</span>
        <span className="text-right tabular-nums text-tinta">{soles(gastoDeRonda(r.cuenta))}</span>
        <ChevronRight aria-hidden className="h-4 w-4 text-tenue" />
      </Link>
    </li>
  );
}
