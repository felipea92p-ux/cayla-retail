import { BarraApilada, type SegmentoBarra } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { pctEs } from "@/lib/mix-piso-visual";
import { notaDelColor, palabraDeMarca, textoDeAMirar, type ColorDeLaTienda as Datos, type FamiliaDeColor } from "@/lib/plan-piso-familias";

// «Color de la tienda» (Plan del piso ▸ Propuesta; Felipe, 2026-10-12; ADR-0352, actualización 2026-10-12; maqueta aprobada: docs/maquetas/color-de-la-tienda-2026-10/):
// de qué familias de color (Neutro, Tierra, Rosado…) es lo que cuelga hoy y si se parece a lo que se vende, para que una tienda no quede cargada de un solo tono.
//
// Va debajo del riel de «Hoy», antes de «Cómo quedaría»: esa propuesta repite la mezcla de hoy y no elige colores, así que esta franja habla solo de lo que cuelga.
// Aquí no se calcula nada: `lib/plan-piso-familias.ts` (con su prueba) trae las familias, las marcas y la frase; este archivo las dibuja con las piezas del sistema
// (`<BarraApilada>` para la franja, `<Chip>` para las marcas). El color de cada tramo es DATO de la prenda (el que más cuelga de la familia; Neutro lleva un gris fijo), no
// color de la interfaz. Sin estado propio: sirve igual en un Server Component.

type Props = {
  color: Datos;
  /** ¿La sede ya cuadró su piso? Si no, lo que cuelga es lo que el sistema CREE y el subtítulo lo dice, como el riel de «Hoy». */
  cuadrado: boolean;
  /** Los días de la ventana de ventas. */
  dias: number;
};

/** Lo que dibuja un tramo o una celda: una familia, o «Otras» (que junta las que no cupieron). */
type Pieza = { clave: string; nombre: string; hex: string | null; otras: boolean; colgadas: number; pctColgadas: number; veredicto: FamiliaDeColor["veredicto"]; aMirar: number };

function piezasDe(c: Datos): Pieza[] {
  const familias: Pieza[] = c.visibles.map((f) => ({ clave: f.clave, nombre: f.nombre, hex: f.hex, otras: false, colgadas: f.colgadas, pctColgadas: f.pctColgadas, veredicto: f.veredicto, aMirar: f.aMirar }));
  if (c.otras) familias.push({ clave: "otras", nombre: "Otras", hex: null, otras: true, colgadas: c.otras.colgadas, pctColgadas: c.otras.pctColgadas, veredicto: null, aMirar: c.otras.aMirar });
  return familias;
}

/** El cuadrito de la familia: su color (dato) o, para «Otras» y lo que no tiene color, las rayas / el gris neutro. */
function Muestra({ pieza }: { pieza: Pieza }) {
  const estilo = pieza.otras ? undefined : { background: pieza.hex ?? "var(--pp-otros)" };
  return (
    <span aria-hidden className="pp-col-m" data-color-dato={pieza.hex ? "" : undefined}>
      <i className={pieza.otras ? "pp-col-rayas" : undefined} style={estilo} />
    </span>
  );
}

export function ColorDeLaTienda({ color, cuadrado, dias }: Props) {
  const piezas = piezasDe(color);
  const segmentos: SegmentoBarra[] = piezas.map((p) => ({
    clave: p.clave,
    nombre: p.nombre,
    valor: p.colgadas,
    ...(p.otras ? { clase: "pp-col-rayas" } : { color: p.hex ?? "var(--pp-otros)" }),
    titulo: `${p.nombre} · ${pctEs(p.pctColgadas)} de lo que cuelga`,
  }));
  const resumen = `Lo que cuelga por familia de color${cuadrado ? "" : ", según el sistema"}: ${piezas.map((p) => `${p.nombre} ${pctEs(p.pctColgadas)}`).join(", ")}`;

  return (
    <section className="pp-riel pp-col" aria-labelledby="pp-col-titulo">
      <div className="pp-rcab">
        <div className="pp-rtit">
          <h3 className="pp-etq" id="pp-col-titulo">
            Color de la tienda
          </h3>
          <span className="pp-rsub">{cuadrado ? "lo que cuelga hoy" : "según el sistema · lo que cuelga hoy"}</span>
        </div>
      </div>
      <p className="pp-col-lectura">{color.lectura.frase}</p>
      <BarraApilada segmentos={segmentos} unidad="prendas" etiqueta={resumen} />
      <ul className="pp-col-celdas" aria-label="Familias de color, de la más a la menos relevante">
        {piezas.map((p) => (
          <li key={p.clave} className="pp-col-celda">
            <span className="pp-col-n">
              <Muestra pieza={p} />
              {p.nombre}
            </span>
            <span className="pp-col-pct">{pctEs(p.pctColgadas)}</span>
            {p.veredicto && <Chip tono="ambar">{palabraDeMarca(p.veredicto)}</Chip>}
            {p.aMirar > 0 && (
              <Chip tono="pizarra" className="whitespace-normal! rounded-xl! text-balance">
                {textoDeAMirar(p.aMirar)}
              </Chip>
            )}
          </li>
        ))}
      </ul>
      <p className="pp-col-nota">{notaDelColor(color, dias)}</p>
    </section>
  );
}
