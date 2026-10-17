import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { PideAtencion } from "@/components/orden-pagina/PideAtencion";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { estadoDeLaOrden, queSigue, rojoDeLaOrden, textoApertura, textoColoresYTallas, textoQueSigue, textoSeVende, type OrdenPagina } from "@/lib/orden-pagina-reglas";

// La ficha de la orden (ADR-0400, vista D): la prenda grande, su nombre, dónde está y qué sigue, lo que se fabrica (colores, tallas, a cuánto se vende) y quién la abrió. Se lee en cinco
// segundos: es lo primero bajo la cabecera. Es de servidor — solo la insignia «¿Por qué?» (`PideAtencion`) tiene un toque que contar.

export function FichaDeLaOrden({ datos, hoy }: { datos: OrdenPagina; hoy: string }) {
  const { orden, lineas, fases } = datos;
  const prenda = categoriaDe({ categoria: orden.producto.categoria?.nombre, categoriaPrefijo: orden.producto.categoria?.prefijo, categoriaFamilia: orden.producto.categoria?.familia });
  const estado = estadoDeLaOrden(orden, fases);
  const siguiente = textoQueSigue(queSigue(fases, orden.estado), fases);
  const que = [textoColoresYTallas(lineas), textoSeVende(orden.producto.precio)].filter((x): x is string => x !== null).join(" · ");
  return (
    <section data-guia="prod-orden.ficha" aria-label="La orden" className="card-cayla flex flex-wrap items-start gap-x-4 gap-y-3 p-5">
      <MiniaturaPrenda fotoUrl={null} colorHex={lineas.find((l) => l.colorHex)?.colorHex ?? null} tamano="xl" {...prenda} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-display text-[26px] leading-tight text-tinta">{orden.producto.referencia}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tono={estado.tono} versalitas={false}>
            {estado.texto}
          </Chip>
          <Chip tono={orden.esMuestra ? "ambar" : "neutro"} versalitas={false}>
            {orden.esMuestra ? "Muestra · no entra al stock" : "Lote de producción"}
          </Chip>
        </div>
        {que && <p className="text-sm text-tinta/75">{que}</p>}
        <p className="text-[13px] text-taupe-profundo">{textoApertura(orden)}</p>
        {siguiente && <p className="pt-1 text-sm text-tinta">{siguiente}</p>}
      </div>
      <div className="w-full sm:w-auto sm:max-w-sm">
        <PideAtencion causas={rojoDeLaOrden(datos, hoy)} />
      </div>
    </section>
  );
}
