import { tiendasEnFrase } from "@/lib/vitrina-portada";
import "@/app/estilos/portada.css";
import { Icono, type NombreIcono } from "../Icono";

/**
 * La franja de confianza bajo el héroe del Inicio de quien todavía no tiene sesión (antes, de la portada): lo que la tienda ya cumple, dicho de un vistazo, como las grandes marcas dicen
 * «envío gratis» (Felipe 2026-10-16: «competencia de grandes empresas»). Nada nuevo ni inventado: son las mismas reglas de «Cómo
 * separar» y «Cambios y devoluciones» (sin el plazo: ese número lo dice su página, que lo lee de la base). `tiendas`: las de la web.
 */
export function ConfianzaPortada({ tiendas }: { tiendas: readonly string[] }) {
  const donde = tiendasEnFrase(tiendas);
  const puntos: [NombreIcono, string, string][] = [
    ["bolsa", "Separas sin pagar", "En la web no pagas nada: pagas cuando la tienda confirma."],
    ["tienda", "Recoges en tu tienda", donde ? `En ${donde}, con tu código.` : "Con tu código, en la tienda que elegiste."],
    ["chat", "Todo por WhatsApp", "La tienda te confirma y coordina el pago contigo."],
    ["traslado", "Cambios en cualquier tienda", "Con tu boleta y la etiqueta puesta."],
  ];
  return (
    <section className="po-confianza" aria-label="Así de simple">
      <ul className="t-ancho">
        {puntos.map(([icono, titulo, texto]) => (
          <li key={titulo}>
            <span className="po-confianza-ic">
              <Icono nombre={icono} />
            </span>
            <span>
              <b>{titulo}</b>
              <small>{texto}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
