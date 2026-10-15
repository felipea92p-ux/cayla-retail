import type { Metadata } from "next";
import Link from "next/link";
import { FiltroTienda } from "@/components/FiltroTienda";
import { Icono } from "@/components/Icono";
import { Lamina } from "@/components/looks/Lamina";
import { cejaDeLook, hrefLook, hrefLooks, lineaDeLook } from "@/lib/looks";
import { leerLooks } from "@/lib/looks-servidor";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../estilos/looks.css";

export const metadata: Metadata = { title: "Arma tu look · CAYLA" };

// «Arma tu look» (maqueta v4, `vLooks`): las combinaciones que el ERP arma en Vitrina web ▸ Looks, en su orden, cada una con su lámina, su
// frase y lo que cuesta completa en la tienda elegida («Ver lo que hay en»; con «Todas», al mayor entre las tiendas de la web). Se lee en
// cada visita: lo que se enciende o se apaga en el ERP se ve al recargar. Pide cuenta como el catálogo (el layout del grupo).
export default async function Looks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  const lectura = await leerLooks(pedida?.id ?? null);
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = lectura?.sede ? sedes.find((s) => s.id === lectura.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;

  return (
    <>
      {sedes.length > 1 && (
        <FiltroTienda
          opciones={[
            { nombre: "Todas", href: hrefLooks(null), actual: elegida === null },
            ...sedes.map((s) => ({ nombre: s.nombre, href: hrefLooks(claveDeSede(s.nombre)), actual: elegida?.id === s.id })),
          ]}
        />
      )}
      <div className="t-ancho">
        <nav className="t-ruta" aria-label="Estás en">
          <Link href="/">Inicio</Link>
          <span aria-hidden="true">/</span>
          <span>Arma tu look</span>
        </nav>
        <header className="t-lista-cab">
          <span className="t-ceja">Combinaciones listas</span>
          <h1>
            Arma tu <em>look</em>
          </h1>
          <p>Prendas que se ven bien juntas. Agrega el look completo y eliges cada talla en un solo paso.</p>
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
            <p>Estamos armando combinaciones de prendas que se ven bien juntas. Mientras tanto, mira toda la ropa.</p>
            <Link className="t-btn" href="/catalogo">
              Ver toda la ropa
            </Link>
          </div>
        ) : (
          <div className="t-looks">
            {lectura.looks.map((l) => (
              <Link key={l.id} className="t-look-card" href={hrefLook(l.id, sede)}>
                <Lamina look={l} sede={sede} origenFotos={origenFotos} enlaces={false} />
                <span className="t-ceja">{cejaDeLook(l)}</span>
                <h3>{l.nombre}</h3>
                <small>{lineaDeLook(l)}</small>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
