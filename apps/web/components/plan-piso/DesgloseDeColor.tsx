import { X } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { cifraEs } from "@/lib/mix-piso-visual";
import {
  fraseDeFamilia,
  palabraDeMarca,
  palabraDeMarcaDeColor,
  seccionesDeColores,
  subtituloDeOtras,
  type ColorDeLaFamilia,
  type ColorDeLaTienda,
  type FamiliaDeColor,
} from "@/lib/plan-piso-familias";

// El desglose de una familia de color (Plan del piso ▸ «Color de la tienda»; Felipe, 2026-10-12; maqueta: docs/maquetas/color-de-la-tienda-2026-10/): al tocar una familia (o «Otras») se
// abre debajo de la franja, en su propio panel (el mismo `pp-panel` de «¿Por qué?»), con lo que cuelga y lo que se vendió de cada color. Arriba van los que piden atención —«Se vende y
// falta», «Cuelga y no sale»— porque la familia esconde al color: Tierra puede verse equilibrada mientras Arena cuelga 31 y vende 3.
//
// Aquí no se calcula nada: `lib/plan-piso-familias.ts` (con su prueba) trae las secciones y las frases. La tabla es la pieza de siempre (`Tabla`/`Encabezado`/`fila`); en el celular
// sus filas se apilan y cada dato lleva su etiqueta, como la tabla de abajo de esta pantalla. Por color solo cuentan las ventas CONFIRMADAS (la nota de la franja lo dice).

const PLANTILLA = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_6rem_10rem]";
const COLUMNAS = [
  { titulo: "Color" },
  { titulo: "Cuelgan", subtitulo: "prendas hoy" },
  { titulo: "Vendieron", subtitulo: "confirmadas · 14 días", alinear: "der" as const },
  { titulo: "" },
];

/** Una celda con su etiqueta, que solo se ve en el celular (donde la fila se apila y el encabezado desaparece). */
function Dato({ etiqueta, children, alinear = "der" }: { etiqueta: string; children: React.ReactNode; alinear?: "izq" | "der" }) {
  return (
    <div className={celda(alinear)}>
      <span className="mr-2 text-xs text-taupe sm:hidden">{etiqueta}</span>
      {children}
    </div>
  );
}

function Muestra({ hex, otras = false }: { hex: string | null; otras?: boolean }) {
  return (
    <span aria-hidden className="pp-col-m" data-color-dato={hex ? "" : undefined}>
      <i className={otras ? "pp-col-rayas" : undefined} style={otras ? undefined : { background: hex ?? "var(--pp-otros)" }} />
    </span>
  );
}

function FilaDeColor({ c, maximo, conVentas }: { c: ColorDeLaFamilia; maximo: number; conVentas: boolean }) {
  const marca = palabraDeMarcaDeColor(c);
  return (
    <div className={fila(PLANTILLA, "sm:items-center")}>
      <div className={celda("izq", "flex items-center gap-2 text-sm text-tinta")}>
        <Muestra hex={c.hex} />
        <span className="truncate">{c.nombre}</span>
      </div>
      <div className={celda("izq", "flex items-center gap-3")}>
        <span aria-hidden className="pp-des-b">
          <i style={{ width: `${maximo > 0 ? Math.max(c.colgadas > 0 ? 4 : 0, (c.colgadas / maximo) * 100) : 0}%` }} />
        </span>
        <span className="text-sm text-tinta tabular-nums">
          {cifraEs(c.colgadas)}
          <span className="ml-1 text-xs text-taupe sm:hidden">cuelgan</span>
        </span>
      </div>
      <Dato etiqueta="Vendieron">{conVentas ? cifraEs(c.confirmadas) : "—"}</Dato>
      <div className={celda("izq", "!overflow-visible")}>{marca && <Chip tono="ambar">{marca}</Chip>}</div>
    </div>
  );
}

/** Una familia: su frase y su tabla de colores, repartida en secciones. Con `cabecera` (dentro de «Otras») lleva su propio título, porque son varias. */
function BloqueDeFamilia({ f, color, dias, cabecera }: { f: FamiliaDeColor; color: ColorDeLaTienda; dias: number; cabecera: boolean }) {
  const secciones = seccionesDeColores(f.colores, color.hayDetalleDeColor);
  const maximo = Math.max(0, ...f.colores.map((c) => c.colgadas));
  return (
    <div className="pp-des-fam">
      {cabecera && (
        <h5 className="pp-des-fh">
          <Muestra hex={f.hex} />
          {f.nombre}
          {f.veredicto && <Chip tono="ambar">{palabraDeMarca(f.veredicto)}</Chip>}
        </h5>
      )}
      <p className="pp-des-frase">{fraseDeFamilia(f, { hayVentas: color.hayVentas, dias })}</p>
      {secciones.length > 0 && (
        <Tabla className="pp-des-tabla">
          <div className="divide-y divide-sand sm:min-w-[34rem]">
            <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
            {secciones.map((s) => (
              <div key={s.clave} className="divide-y divide-sand">
                <div className="bg-hueso/60 px-5 py-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-taupe">{s.titulo}</div>
                {s.colores.map((c) => (
                  <FilaDeColor key={c.clave} c={c} maximo={maximo} conVentas={color.hayDetalleDeColor} />
                ))}
              </div>
            ))}
          </div>
        </Tabla>
      )}
    </div>
  );
}

type Props = {
  id: string;
  color: ColorDeLaTienda;
  /** La clave de la familia abierta, o «otras». */
  clave: string;
  dias: number;
  alCerrar: () => void;
};

export function DesgloseDeColor({ id, color, clave, dias, alCerrar }: Props) {
  const otras = clave === "otras" ? color.otras : null;
  const unica = otras ? null : color.familias.find((f) => f.clave === clave);
  if (!otras && !unica) return null;
  const nombre = otras ? "Otras" : unica!.nombre;
  return (
    <div className="pp-panel pp-des" id={id} role="region" aria-label={`Colores de ${nombre}`}>
      <div className="pp-des-cab">
        <h4 className="pp-des-t">
          <Muestra hex={unica?.hex ?? null} otras={!!otras} />
          {nombre}
          {otras && <small>{subtituloDeOtras(otras)}</small>}
          {unica?.veredicto && <Chip tono="ambar">{palabraDeMarca(unica.veredicto)}</Chip>}
        </h4>
        <button type="button" className="pp-des-x" onClick={alCerrar} aria-label={`Cerrar los colores de ${nombre}`}>
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {otras ? otras.familias.map((f) => <BloqueDeFamilia key={f.clave} f={f} color={color} dias={dias} cabecera />) : <BloqueDeFamilia f={unica!} color={color} dias={dias} cabecera={false} />}
    </div>
  );
}
