import type { Metadata } from "next";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { escalaEnPalabras, soles, TEXTOS_VERSION } from "@/lib/cuentas";
import { leerBeneficiosDelClub } from "@/lib/cuentas-servidor";
import { haySesion } from "@/lib/sesion-servidor";

export const metadata: Metadata = { title: "Términos del Club CAYLA · CAYLA" };

/**
 * Los términos del Club CAYLA para quien se une desde la tienda online. BORRADOR (ADR-0408, actividad 2): son los términos que ya
 * rigen en el ERP (`club_textos`, términos v2), con lo que cambia al unirse con la cuenta web. Las cifras (el % del cumpleaños,
 * la escala del vale, el umbral y los días) salen de la base, las mismas que usa la caja; si la base no contesta, se dicen sin
 * cifras. La revisa CAYLA antes de publicar la tienda.
 */
export default async function TerminosDelClub() {
  const [conCuenta, b] = await Promise.all([haySesion(), leerBeneficiosDelClub()]);
  const pct = b ? `${Number.isInteger(b.pct) ? b.pct : b.pct.toFixed(2)} %` : "un porcentaje";
  return (
    <MarcoCuenta conCuenta={conCuenta} conPie>
      <div className="t-ancho t-angosto w-pagina-form">
        <article className="w-ficha w-legal">
          <div>
            <span className="w-borrador">Borrador: lo revisa CAYLA</span>
            <h1 className="w-titulo">Términos del Club CAYLA</h1>
            <p className="w-texto-sec">Los mismos del Club CAYLA en tienda, para quien se une creando su cuenta en la tienda online. Versión: {TEXTOS_VERSION}.</p>
          </div>

          <section>
            <h2>1. Quién puede ser miembro</h2>
            <p>
              Personas mayores de 18 años, con DNI y un celular con WhatsApp. Unirse es gratis: al crear tu cuenta en la tienda online ya
              eres miembro. Si ya lo eras en tienda, tu cuenta se une a tu ficha y conservas tu código y tu fecha de miembro.
            </p>
          </section>

          <section>
            <h2>2. Código de miembro</h2>
            <p>Al unirte recibes un código personal (por ejemplo, C-0001). Para usar tus beneficios basta tu documento en caja.</p>
          </section>

          <section>
            <h2>3. Cupón de cumpleaños</h2>
            <ul>
              <li>
                {pct} de descuento sobre el total de una compra, en cualquier tienda CAYLA, durante el mes de tu cumpleaños según el día y el
                mes que registraste.
              </li>
              <li>Una vez por año calendario. Se aplica sobre el precio vigente, incluidas las prendas que ya estén en promoción.</li>
              <li>Es personal y se usa con tu documento. No se canjea por dinero ni se acumula con otro cupón del Club.</li>
              <li>Solo en compras presenciales en tiendas CAYLA. Requiere conexión del sistema en el momento del pago.</li>
              <li>Si la compra se anula, el cupón vuelve a estar disponible. Si devuelves o cambias prendas, el cupón ya se considera usado.</li>
            </ul>
          </section>

          <section>
            <h2>4. Vale de aniversario</h2>
            <ul>
              <li>
                Cada año como miembro se cuenta desde la fecha en que te uniste. Un año <b>cuenta</b> si en él hiciste al menos{" "}
                {b ? `${b.compras} compras o sumaste al menos ${soles(b.montoMinimo)}` : "las compras o el monto que pide el club"} en compras
                en tiendas CAYLA. Las compras devueltas completas no cuentan, y una devolución parcial descuenta lo devuelto.
              </li>
              <li>
                Al cumplir un año que cuenta, recibes un vale según cuántos años que cuentan llevas
                {b ? `: ${escalaEnPalabras(b.escala)}. Desde el último año de la escala, ese vale se repite cada año.` : ". El vale crece cada año."}
              </li>
              <li>Si un año no cuenta, no recibes vale ese año, pero no pierdes lo acumulado: el siguiente año que cuente sigue donde te quedaste.</li>
              <li>
                Tienes {b ? `${b.dias} días` : "un plazo"} desde tu aniversario para usarlo, en una sola compra, en cualquier prenda de cualquier
                tienda CAYLA.
              </li>
              <li>
                El vale se descuenta del total de esa compra. No se canjea por dinero ni da vuelto: si la compra es menor que el vale, la
                diferencia no se conserva. Es personal y se usa con tu documento. No se acumula con el cupón de cumpleaños en la misma compra.
              </li>
              <li>
                Si la compra se anula, el vale vuelve a estar disponible dentro de su plazo. Si devuelves o cambias prendas, el vale ya se
                considera usado.
              </li>
            </ul>
          </section>

          <section>
            <h2>5. Avisos</h2>
            <p>
              Tus beneficios los ves en tu cuenta. Por WhatsApp te avisamos de tu cupón o tu vale solo si lo autorizaste. Si no recibes el
              aviso, el beneficio igual está disponible en caja.
            </p>
          </section>

          <section>
            <h2>6. Cambios y fin del programa</h2>
            <p>
              CAYLA puede cambiar los beneficios o terminar el Club avisando con 15 días de anticipación en tu cuenta, por WhatsApp (a quien lo
              autorizó) y en tienda. Los cupones y vales ya disponibles se respetan hasta su vencimiento.
            </p>
          </section>

          <section>
            <h2>7. Conservación de datos</h2>
            <p>
              Si pasan 3 años desde tu última compra o tu última entrada a tu cuenta web, tu ficha se anonimiza de forma automática, dejas de
              ser miembro y tu cuenta web se cierra (ver la Política de privacidad, punto 6).
            </p>
          </section>
        </article>
      </div>
    </MarcoCuenta>
  );
}
