import { ArrowRight } from "lucide-react";
import { colorDelSello, textoSobre, type ColoresDeCampana } from "@cayla-retail/shared";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { fechaCortaDicha, pctDicho } from "@/lib/campanas-web-reglas";

/**
 * La vista previa viva del editor de Campañas (maqueta docs/maquetas/campanas-tienda-2026-10): la portada de la tienda online con los colores
 * del diseño. Es un dibujo para decidir —la franja de arriba, la cabecera, la portada con su titular, su descuento y sus botones, y tres
 * prendas—, no la tienda: la tienda se viste con los mismos colores del catálogo (`@cayla-retail/shared`) y la vista previa privada, en la
 * actividad que programa, enseña la de verdad. Sin ambiente elegido, dibuja la portada «como siempre».
 *
 * Los colores del diseño son DATO (como el de una prenda): van en `style` y no cambian con el tema del ERP; lo demás del cuadro (la
 * cabecera de la tienda, las prendas) es papel fijo, así la portada se ve igual de día y de noche.
 */
export function PreviewCampana({
  colores,
  nombre,
  pct,
  hasta,
  celular = false,
}: {
  colores: ColoresDeCampana | null;
  nombre: string;
  pct: number | null;
  hasta: string | null;
  celular?: boolean;
}) {
  const partes = nombre.trim().split(/\s+/);
  const cola = partes.length > 1 ? (partes.pop() as string) : "";
  const cabeza = partes.join(" ");
  const sello = colores ? colorDelSello(colores) : null;
  const estilo = colores
    ? { backgroundColor: colores.fondo, color: colores.texto }
    : undefined;
  const boton = colores ? { backgroundColor: colores.acento, color: textoSobre(colores.acento) } : undefined;

  return (
    <div className="papel-fijo overflow-hidden rounded-lg border border-sand bg-papel text-tinta" data-color-dato aria-label="Vista previa de la portada de la tienda">
      <div
        className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={colores ? { backgroundColor: colores.fondo, color: colores.texto } : undefined}
      >
        <span className={colores ? "" : "bg-tinta px-2 py-1 text-crema"}>{`${nombre} · ${pctDicho(pct)}${hasta ? ` hasta el ${fechaDeHasta(hasta)}` : ""}`}</span>
      </div>
      <div className="flex items-center justify-between border-b border-sand px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{celular ? "☰" : "Lo nuevo · Ropa · Looks"}</span>
        <span className="font-serif text-lg tracking-[0.3em]">CAYLA</span>
        <span className="w-6" />
      </div>
      <div className={`relative ${celular ? "px-5 py-6" : "grid grid-cols-[1.1fr_1fr] items-center gap-4 px-8 py-8"} ${colores ? "" : "bg-hueso"}`} style={estilo}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-90">{`Campaña${hasta ? ` · hasta el ${fechaDeHasta(hasta)}` : ""}`}</p>
          <h3 className={`mt-3 font-sans font-medium uppercase leading-[1.02] ${celular ? "text-2xl" : "text-4xl"}`}>
            {cabeza}
            {cola && (
              <em className="block font-serif text-[1.18em] font-normal normal-case italic" style={colores ? { color: colores.acento } : undefined}>
                {cola}
              </em>
            )}
          </h3>
          <p className="mt-3 flex items-baseline gap-3">
            <b className="font-serif text-3xl font-normal italic" style={colores ? { color: colores.acento } : undefined}>
              {pctDicho(pct)}
            </b>
            <span className="text-[11px] opacity-85">en las prendas de la campaña</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`inline-flex h-9 items-center gap-2 px-4 text-[10px] font-semibold uppercase tracking-[0.16em] ${colores ? "" : "bg-tinta text-crema"}`}
              style={boton}
            >
              Ver la campaña <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
            <span className="inline-flex h-9 items-center border border-current px-4 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-90">Lo nuevo</span>
          </div>
        </div>
        <div className={`flex items-center justify-center ${celular ? "mt-5" : ""}`} aria-hidden>
          {[-6, 3, -2].map((giro, i) => (
            <div
              key={giro}
              className={`flex aspect-[4/5] ${celular ? "w-[30%]" : "w-[34%]"} -ml-3 items-center justify-center bg-papel p-1 text-taupe shadow-none first:ml-0`}
              style={{ transform: `rotate(${giro}deg)`, zIndex: i }}
            >
              <span className="flex h-full w-full items-center justify-center bg-hueso">
                <IconoPercha className="h-6 w-6" />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 px-4 py-4" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="relative flex aspect-[4/5] items-center justify-center bg-hueso text-taupe">
              {sello && (
                <span className="absolute left-1 top-1 px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: sello.fondo, color: sello.texto }}>
                  {pctDicho(pct)}
                </span>
              )}
              <IconoPercha className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** «25 oct» de una fecha `aaaa-mm-dd`. */
const fechaDeHasta = fechaCortaDicha;
