import Link from "next/link";
import { Icono, type NombreIcono } from "@/components/Icono";

/** Lo que se le promete al cliente: solo lo que la tienda hace hoy. Los plazos salen de `retail.tienda_ayuda()`; sin dato, sin número. */
export function BeneficiosDeLaTienda({ diasParaRecoger, diasParaCambiar }: { diasParaRecoger: number | null; diasParaCambiar: number | null }) {
  const lista: [NombreIcono, string, string][] = [
    ["ticket", "Separa sin pagar", "Pago por WhatsApp"],
    ["tienda", "Recoge en tu tienda", diasParaRecoger ? `${diasParaRecoger} días para recoger` : "Con tu código"],
    ["pedido", diasParaCambiar ? `Cambios en ${diasParaCambiar} días` : "Cambios y devoluciones", "En cualquier tienda"],
    ["chispa", "Asesoría", "Vía WhatsApp"],
  ];
  return (
    <section className="dn-beneficios dn-solo" aria-label="Lo que te damos">
      <ul>
        {lista.map(([icono, titulo, detalle]) => (
          <li key={titulo}>
            <Icono nombre={icono} />
            <span>
              <b>{titulo}</b>
              <small>{detalle}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Arma tu outfit»: la modelo a la izquierda, el texto al centro y las dos modelos a la derecha. Las fotos son las que eligió Felipe, sin retoques. */
export function ArmaTuOutfit({ href }: { href: string }) {
  return (
    <section className="t-ancho dn-seccion-banner dn-solo" aria-labelledby="dn-arma">
      <div className="dn-banner">
        <div className="dn-foto dn-foto-modelo">
          <img
            src="/escenario/modelo-arma-tu-look.webp"
            srcSet="/escenario/modelo-arma-tu-look-600.webp 600w, /escenario/modelo-arma-tu-look.webp 900w"
            sizes="(max-width: 639px) 200px, 320px"
            alt="Modelo con cartera beige y lentes de sol"
            width={900}
            height={1200}
            loading="lazy"
          />
        </div>
        <div className="dn-banner-texto">
          <h2 id="dn-arma">Arma tu outfit</h2>
          <p>Combina prendas, crea outfits y encuentra tu estilo CAYLA.</p>
          <Link className="t-btn dn-btn-claro" href={href}>
            Crear mi outfit <Icono nombre="flecha" />
          </Link>
        </div>
        <div className="dn-foto dn-foto-mesa">
          <img
            src="/escenario/modelos-arma-tu-look-1200.webp"
            srcSet="/escenario/modelos-arma-tu-look-800.webp 800w, /escenario/modelos-arma-tu-look-1200.webp 1200w"
            sizes="(max-width: 639px) 100vw, 640px"
            alt="Dos modelos, una con casaca de jean y otra con polo blanco y gorra"
            width={1200}
            height={800}
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
