import type { Metadata } from "next";
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { TarjetaLook } from "@/components/looks/TarjetaLook";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { hrefLista } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { hrefLooks, looksDeATres } from "@/lib/looks";
import { leerLooks } from "@/lib/looks-servidor";
import { hrefDelProbador } from "@/lib/probador";
import { claveDeSede, sedesEnOrden } from "@/lib/sede-elegida";
import { sedeDeLaPagina } from "@/lib/sede-servidor";
import { hayEnTienda } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../estilos/looks.css";

export const metadata: Metadata = { title: "Arma tu look · CAYLA" };

// «Arma tu look» (maqueta v4, `vLooks`): las combinaciones que el ERP arma en Vitrina web ▸ Looks, en su orden, cada una con su lámina, su
// frase y lo que cuesta completa en la tienda elegida («Ver lo que hay en»; con «Todas», al mayor entre las tiendas de la web). Se lee en
// cada visita: lo que se enciende o se apaga en el ERP se ve al recargar. Pide cuenta como el catálogo (el layout del grupo y el proxy), y
// lleva su marco: la cabecera (con «Arma tu look» marcado), la franja de la tienda y el pie. Sin migas, como las listas del catálogo: es
// una página de arriba del todo (está en la cabecera) y «Inicio / Arma tu look» solo repetía el título (Felipe 2026-10-15).
export default async function Looks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = await sedeDeLaPagina(sp, sedes, "/looks", claveDeSede);
  const [lectura, catalogo] = await Promise.all([leerLooks(pedida?.id ?? null), leerCatalogo(pedida?.id ?? null)]);
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = lectura?.sede ? sedes.find((s) => s.id === lectura.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  // La cabecera (el menú y el buscador) dice lo mismo que el catálogo de esa tienda.
  const prendas = (catalogo?.prendas ?? []).filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));
  return (
    <MarcoCatalogo
      prendas={prendas}
      sede={sede}
      actual="looks"
      filtro={[
        { nombre: "Todas", href: hrefLooks(null), actual: elegida === null },
        ...sedes.map((s) => ({ nombre: s.nombre, href: hrefLooks(claveDeSede(s.nombre)), actual: elegida?.id === s.id })),
      ]}
    >
      <div className="t-ancho">
        <header className="t-lista-cab t-looks-cab">
          <h1>
            Arma tu <em>look</em>
          </h1>
          {/* Los looks de CAYLA están abajo; este es el camino para armar el propio (el probador). Siempre a la vista: si todavía no hay
              prendas que probar en esa tienda, el probador lo dice y lleva de vuelta a los looks. */}
          <Link className="t-btn t-btn-sec" href={hrefDelProbador(sede)}>
            Arma tu look personalizado <Icono nombre="flecha" />
          </Link>
        </header>

        {lectura === null ? (
          <div className="t-vacio" role="status">
            <Icono nombre="tienda" />
            <h3>No pudimos cargar los looks</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={hrefLooks(pedida ? claveDeSede(pedida.nombre) : null)}>
              Volver a intentar
            </Link>
          </div>
        ) : lectura.looks.length === 0 ? (
          <div className="t-vacio">
            <Icono nombre="chispa" />
            <h3>Pronto verás aquí nuestros looks</h3>
            <p>Estamos armando combinaciones de prendas que se ven bien juntas. Mientras tanto, mira toda la tienda.</p>
            <Link className="t-btn" href={hrefLista({ sede, categoria: null, orden: "destacado" })}>
              Ver toda la tienda
            </Link>
          </div>
        ) : (
          <div className="t-looks" data-tres={looksDeATres(lectura.looks.length) ? "" : undefined}>
            {lectura.looks.map((l, i) => (
              <TarjetaLook key={l.id} look={l} sede={sede} origenFotos={origenFotos} pronto={i === 0} />
            ))}
          </div>
        )}
      </div>
    </MarcoCatalogo>
  );
}
