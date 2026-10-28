import { ShoppingBag } from "lucide-react";
import type { CuentaOpcion } from "@/lib/fondos-reglas";
import { enviosDeLaRonda, type EnvioMio, type RondaConEnvios } from "@/lib/mis-envios-reglas";
import {
  PASOS_DE_LA_RONDA,
  desdeRonda,
  pasoDeLaRonda,
  tituloDeLaLista,
  type EntradaHistorial,
  type MiPlata,
  type MovimientoCompradora,
  type RondaAbierta,
} from "@/lib/mi-plata-reglas";
import { AccionDelDia } from "./AccionDelDia";
import { AnotarGasto } from "./AnotarGasto";
import { AnotarPlata } from "./AnotarPlata";
import { Billetera } from "./Billetera";
import { CaminoDePasos } from "./CaminoDePasos";
import { ListaDelDia, RondasAnteriores } from "./ListaDelDia";
import { MandarATienda } from "./MandarATienda";
import { ParaMandar } from "./ParaMandar";
import { RondaVacia } from "./RondaVacia";
import { TerminarDia } from "./TerminarDia";

// «La mesa de la ronda» (maqueta docs/maquetas/mis-compras-pc-mesa-2026-10/, Felipe 2026-10-28: «se ve tan básico»): Mis compras con la ronda
// abierta. De arriba abajo: el camino de la ronda · tu plata y lo que haces · lo que pasó en la ronda y lo que falta mandar · «Cerrar mi ronda» ·
// las rondas anteriores. El DOM sigue el orden del celular (camino y plata · acciones · para mandar · lista · cerrar · anteriores), en una sola
// columna; en PC se reparte en filas con la rejilla: de 1024 a 1279 px la lista y «Para mandar» se apilan (la tabla necesita el ancho) y desde
// 1280 px van lado a lado. Sin ronda abierta la pantalla es otra (la de `page.tsx`): aquí no se decide nada, solo se coloca.

export function MesaDeLaRonda({
  plata,
  ronda,
  bancos,
  actuales,
  anteriores,
  envios,
  rondasEnvios,
  hoy,
  mandar,
}: {
  plata: MiPlata;
  ronda: RondaAbierta;
  bancos: CuentaOpcion[];
  /** Lo anotado en esta ronda, lo más nuevo primero. */
  actuales: MovimientoCompradora[];
  /** Lo de antes: la plata anotada sin ronda y una fila por ronda cerrada. */
  anteriores: EntradaHistorial[];
  /** Todos los envíos; `null` si «Mis envíos» no se pudo leer. */
  envios: EnvioMio[] | null;
  rondasEnvios: RondaConEnvios[] | null;
  hoy: string;
  /** `?mandar=1` (desde «Compra guardada»): abre «Mandar a la tienda» al llegar. */
  mandar: boolean;
}) {
  const enviosRonda = envios === null ? null : enviosDeLaRonda(envios, ronda.id);
  // Una ronda recién abierta, sin nada: en PC, un solo bloque que dice cómo sigue (en vez de dos tarjetas con un renglón cada una). En el
  // celular cada pieza conserva su frase de siempre.
  const rondaVacia = actuales.length === 0 && plata.porMandar.length === 0 && enviosRonda !== null && enviosRonda.length === 0;
  const desde = desdeRonda(ronda.abiertaEn, plata.hoy.fecha);
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <CaminoDePasos
        pasos={PASOS_DE_LA_RONDA}
        ahora={pasoDeLaRonda(plata)}
        etiqueta="Tu ronda, paso a paso"
        guia="mi-plata.camino"
        enLinea
        lado={desde ? `Ronda ${ronda.texto} · ${desde}` : `Ronda ${ronda.texto}`}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Billetera plata={plata} />
        <section aria-label="¿Qué hiciste?" className="grid grid-cols-2 gap-2.5 lg:grid-rows-[1fr_1fr] lg:gap-3">
          <AccionDelDia
            grande
            href="/compras/mi-plata/compra"
            guia="mi-plata.compre"
            titulo="Apunte de compras"
            detalle="A un proveedor, en la calle o por pedido"
            icono={<ShoppingBag className="h-5 w-5" aria-hidden />}
          />
          <AnotarPlata puedeYaTenia={plata.puedeYaTenia} bancos={bancos} />
          <AnotarGasto />
        </section>
      </div>
      <div className={`flex flex-col gap-4 ${rondaVacia ? "lg:hidden" : "xl:grid xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] xl:items-start xl:gap-5"}`}>
        {/* Lo urgente va primero en el celular (como la franja de «Falta mandar» de siempre); en PC ancho, a la derecha de la lista. */}
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-start-1">
          {/* La hoja «Mandar a la tienda» vive aquí sin su franja: la tarjeta trae el botón que la abre. */}
          <MandarATienda porMandar={plata.porMandar} abrirAlCargar={mandar} sinFranja />
          <ParaMandar porMandar={plata.porMandar} envios={enviosRonda} texto={ronda.texto} hoy={hoy} />
        </div>
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <ListaDelDia actuales={actuales} titulo={tituloDeLaLista(plata.ronda)} desde={desde} />
        </div>
      </div>
      {rondaVacia && <RondaVacia texto={ronda.texto} />}
      <TerminarDia plata={plata} envios={enviosRonda} hoy={hoy} />
      {anteriores.length > 0 && <RondasAnteriores historial={anteriores} envios={rondasEnvios} hoy={hoy} tarjetas />}
    </div>
  );
}
