import { Camino } from "@/components/tienda-web/Camino";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import {
  estacionesDe,
  NOMBRE_ESTACION,
  reglasDelCamino,
  tramosDelCamino,
  type CifrasPedidosWeb,
  type PestanaPedidos,
  type PlazosPedidosWeb,
} from "@/lib/pedidos-web-reglas";

/**
 * El camino de los pedidos web de una tienda (ADR-0430, actualización 2026-10-17): sus cuatro estaciones —cuántos PEDIDOS hay en cada
 * paso— unidas por su plazo. Lo dibujan igual Pedidos (donde cada estación FILTRA la lista: `filtro` + `onFiltrar`) y el Resumen (donde
 * cada una LLEVA a Pedidos con ese filtro puesto: sin `onFiltrar`). Antes cada pantalla armaba sus cuatro tarjetas por su cuenta.
 *
 * Sin estado ni hooks: sirve desde el Resumen (de servidor) y desde Pedidos (de cliente).
 */
export function CaminoDePedidos({
  cifras,
  plazos,
  etiqueta,
  filtro = null,
  onFiltrar,
  conReglas = false,
  idReglas,
  guia,
  guiaEntregar,
}: {
  cifras: CifrasPedidosWeb;
  plazos: PlazosPedidosWeb;
  etiqueta: string;
  /** La estación puesta como filtro (Pedidos). */
  filtro?: PestanaPedidos | null;
  /** Pedidos: tocar una estación la pone o la quita como filtro. Sin esto, cada estación lleva a Pedidos (`?pestana=`). */
  onFiltrar?: (clave: PestanaPedidos) => void;
  /** «¿Cómo funciona?» abierto: bajo cada estación, lo que conviene saber de ese paso. */
  conReglas?: boolean;
  idReglas?: string;
  /** Anclas de la guía interactiva: el camino y la estación «Por entregar» (la demo la toca). */
  guia?: string;
  guiaEntregar?: string;
}) {
  const estaciones = estacionesDe(cifras, plazos);
  const reglas = reglasDelCamino(plazos);
  const [a, b, c, d] = estaciones.map((e, i) => (
    <TarjetaCifra
      key={e.clave}
      etiqueta={e.etiqueta}
      punto={e.punto}
      vivo={e.vivo}
      className="anim-entra"
      style={{ ["--i" as string]: i }}
      valor={<CifraQueCuenta valor={e.valor} alMontar />}
      guia={e.clave === "entregar" ? guiaEntregar : undefined}
      {...(onFiltrar
        ? { activa: filtro === e.clave, onClick: () => onFiltrar(e.clave) }
        : { href: `/tienda-web/pedidos?pestana=${e.clave}` })}
    >
      {e.pie}
    </TarjetaCifra>
  ));
  return (
    <Camino
      etiqueta={etiqueta}
      guia={guia}
      pasos={[a, b, c, d]}
      tramos={tramosDelCamino(plazos)}
      idReglas={idReglas}
      reglas={conReglas ? (["confirmar", "cobrar", "entregar", "cerrados"] as const).map((k) => ({ titulo: NOMBRE_ESTACION[k], texto: reglas[k] })) : null}
    />
  );
}
