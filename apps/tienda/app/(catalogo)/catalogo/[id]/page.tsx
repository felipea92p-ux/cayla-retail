import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FichaPrenda } from "@/components/FichaPrenda";
import { Icono } from "@/components/Icono";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { textoCambios } from "@/lib/ayuda";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { claveCategoria, hrefDePrenda, hrefLista } from "@/lib/catalogo";
import { chipsDelCatalogo, esIdDePrenda } from "@/lib/ficha";
import { leerFicha } from "@/lib/ficha-servidor";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
import { hayEnTienda, notaDeStock } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../../estilos/ficha.css";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const unValor = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** La tienda pedida en la dirección (si se ve en la web) y la ficha a su precio. Lo comparten el título y la página (una sola lectura). */
async function leer(props: Props) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  if (!esIdDePrenda(id)) notFound();
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  const ficha = await leerFicha(id, pedida?.id ?? null);
  if (ficha === "no_esta") notFound();
  return { id, sp, sedes, pedida, ficha };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { ficha } = await leer(props);
  return { title: `${ficha ? ficha.nombre : "Prenda"} · CAYLA` };
}

// La ficha de una prenda (maqueta v4, `vProducto`): sus fotos, su precio en la tienda elegida (o el mayor, con «Todas») y su campaña,
// sus colores y tallas, y CUÁNTO HAY EN CADA TIENDA como nivel. Se lee en cada visita: lo que se vende en una tienda baja el nivel al
// recargar. Debajo, otras prendas de su categoría que hay en la tienda elegida.
export default async function FichaDePrenda(props: Props) {
  const { id, sp, sedes, pedida, ficha } = await leer(props);
  // El plazo de cambio es el de la caja (el que imprime la boleta), el mismo de «Cambios y devoluciones».
  const [catalogo, plazos] = await Promise.all([leerCatalogo(pedida?.id ?? null), leerAyuda()]);
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = ficha?.sede ? sedes.find((s) => s.id === ficha.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  const clave = ficha ? claveCategoria(ficha.categoria) : null;
  const enLaTienda = (catalogo?.prendas ?? []).filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));
  const similares = ficha ? enLaTienda.filter((p) => p.id !== ficha.id && claveCategoria(p.categoria) === clave).slice(0, 8) : [];
  // «Nuevo · llegó hace 4 días» y «N.º 3 en más vendidos» salen del catálogo, que ya los trae.
  const chips = chipsDelCatalogo(catalogo?.prendas.find((p) => p.id === id) ?? null);

  return (
    <MarcoCatalogo
      prendas={enLaTienda}
      sede={sede}
      filtro={[
        { nombre: "Todas", href: hrefDePrenda({ id }), actual: elegida === null },
        ...sedes.map((s) => ({ nombre: s.nombre, href: hrefDePrenda({ id }, claveDeSede(s.nombre)), actual: elegida?.id === s.id })),
      ]}
    >
      <div className="t-ancho">
        <nav className="t-ruta" aria-label="Estás en">
          <Link href={sede ? `/inicio?sede=${encodeURIComponent(sede)}` : "/inicio"}>Inicio</Link>
          <span aria-hidden="true">/</span>
          {ficha?.categoria && clave ? (
            <>
              <Link href={hrefLista({ sede, categoria: clave, orden: "destacado" })}>{ficha.categoria.nombre}</Link>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span>{ficha ? ficha.nombre : "Prenda"}</span>
        </nav>

        {ficha === null ? (
          <div className="t-vacio" role="status">
            <Icono nombre="tienda" />
            <h3>No pudimos cargar esta prenda</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={hrefDePrenda({ id }, pedida ? claveDeSede(pedida.nombre) : null)}>
              Volver a intentar
            </Link>
          </div>
        ) : (
          <FichaPrenda
            ficha={ficha}
            sedeElegida={elegida?.id ?? null}
            colorPedido={unValor(sp.color)}
            origenFotos={origenFotos}
            chips={chips}
            cambios={textoCambios(plazos)}
          />
        )}

        {ficha && similares.length > 0 && (
          <section className="t-sec" aria-labelledby="similares">
            <div className="t-sec-cab">
              <div>
                <span className="t-ceja">{ficha.categoria?.nombre ?? "Para ti"}</span>
                <h2 id="similares">
                  También te <em>puede gustar</em>
                </h2>
              </div>
            </div>
            <div className="t-carril">
              {similares.map((p) => (
                <TarjetaPrenda key={p.id} prenda={p} sede={sede} origenFotos={origenFotos} nota={notaDeStock(p.stock, elegida, sedes)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </MarcoCatalogo>
  );
}
