import type { Metadata } from "next";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { TEXTOS_VERSION } from "@/lib/cuentas";
import { haySesion } from "@/lib/sesion-servidor";

export const metadata: Metadata = { title: "Política de privacidad · CAYLA" };

/**
 * La política de privacidad de la tienda online. BORRADOR (ADR-0408, actividad 2): parte de la política del Club CAYLA que ya
 * rige en el ERP (`club_textos`, privacidad v2) y suma lo que trae la cuenta web (correo y contraseña, pedidos web, el servicio
 * de inicio de sesión). La revisa CAYLA antes de publicar la tienda; lo que se acepta al crear la cuenta queda anotado con su
 * versión (`TEXTOS_VERSION`).
 */
export default async function Privacidad() {
  const conCuenta = await haySesion();
  return (
    <MarcoCuenta conCuenta={conCuenta} conPie>
      <div className="t-ancho t-angosto w-pagina-form">
        <article className="w-ficha w-legal">
          <div>
            <span className="w-borrador">Borrador: lo revisa CAYLA</span>
            <h1 className="w-titulo">Política de privacidad</h1>
            <p className="w-texto-sec">
              Qué datos tuyos guarda CAYLA cuando creas tu cuenta en la tienda online y para qué. Es la misma política del Club CAYLA,
              con lo que suma tu cuenta web. Versión: {TEXTOS_VERSION}.
            </p>
          </div>

          <section>
            <h2>1. Quién es responsable de tus datos</h2>
            <p>
              CAYLA S.A.C., RUC 20605964550, con domicilio en Mz. Q Lt. 26, Urb. San Andrés V Etapa, Víctor Larco Herrera, Trujillo, La
              Libertad, Perú. Correo: caylaperu@gmail.com. Tus datos forman parte del banco de datos personales «Clientes», inscrito en el
              Registro Nacional de Protección de Datos Personales.
            </p>
          </section>

          <section>
            <h2>2. Qué datos tratamos</h2>
            <ul>
              <li>
                Los que nos das al crear tu cuenta: tu correo y tu contraseña, tu DNI, tus nombres y apellidos, tu celular y tu cumpleaños
                (día y mes; el año, si quieres). Si después cambias el correo con que entras, el nuevo reemplaza al anterior.
              </li>
              <li>Tu nombre lo tomamos del padrón público a partir de tu DNI, para que quede bien escrito. Si no lo encontramos, lo escribes tú.</li>
              <li>Tu contraseña la guarda cifrada el servicio de inicio de sesión: nadie en CAYLA puede verla.</li>
              <li>
                Los que se generan cuando separas o compras: tus pedidos web, la tienda que elegiste, las prendas, tallas, montos y
                comprobantes, y los beneficios del club que usaste.
              </li>
              <li>La prueba de lo que aceptaste: la versión de estos textos, la fecha y la hora.</li>
            </ul>
            <p>No pedimos datos sensibles (salud, origen, religión u otros).</p>
          </section>

          <section>
            <h2>3. Para qué los usamos</h2>
            <ol>
              <li>
                <b>Tu cuenta y tus pedidos web</b>: que entres, separes prendas, la tienda te confirme por WhatsApp y recojas en tienda.
              </li>
              <li>
                <b>Tu membresía del Club CAYLA</b>: reconocerte en caja, ligar tus compras a tu ficha y aplicar tus beneficios.
              </li>
              <li>
                <b>Cumplir obligaciones legales</b>: emitir y conservar comprobantes de pago ante SUNAT.
              </li>
            </ol>
            <p>
              Sin publicidad por WhatsApp: las novedades las ves en tu cuenta. La tienda te escribe por WhatsApp solo por tus pedidos.
              Los mensajes de promociones solo con tu autorización expresa, que puedes retirar cuando quieras.
            </p>
          </section>

          <section>
            <h2>4. Qué datos son obligatorios</h2>
            <p>
              Tu correo, tu contraseña, tu DNI, tu nombre, tu celular y el día y el mes de tu cumpleaños: sin ellos no podemos darte tu
              cuenta ni aplicar tus beneficios. El año de tu cumpleaños es opcional.
            </p>
          </section>

          <section>
            <h2>5. Con quién se comparten</h2>
            <p>No vendemos ni cedemos tus datos. Para operar, los tratan por encargo de CAYLA y solo para estas finalidades:</p>
            <ul>
              <li>
                <b>Supabase Inc.</b> (base de datos e inicio de sesión) y <b>Vercel Inc.</b> (sitio web), con servidores fuera del Perú
                (transferencia internacional de datos), con medidas de seguridad.
              </li>
              <li>
                <b>Meta Platforms (WhatsApp)</b>, por donde la tienda te escribe por tus pedidos.
              </li>
              <li>
                <b>La consulta del padrón</b> (servicio de consulta de DNI, Perú), solo para obtener tu nombre a partir de tu DNI.
              </li>
              <li>
                <b>El servicio de correo</b> que te manda los códigos para confirmar tu correo, el enlace para crear una contraseña nueva y
                el aviso cuando cambia el correo de tu cuenta.
              </li>
              <li>
                <b>Lucode</b> (proveedor de servicios electrónicos) y <b>SUNAT</b>, para los comprobantes de pago.
              </li>
            </ul>
          </section>

          <section>
            <h2>6. Cuánto tiempo los guardamos</h2>
            <p>
              Mientras tengas tu cuenta y seas miembro del club. Si pasan 3 años desde tu última compra o tu última entrada a tu cuenta
              web, anonimizamos tu ficha de forma automática, como en el Club CAYLA, y cerramos tu cuenta web: borramos tu correo, quitamos
              tus favoritos y tus avisos de «Avísame cuando llegue», y ya no puedes entrar con ella. Lo mismo, cuando quieras, si eliminas
              tu cuenta en «Mi cuenta» ▸ «Eliminar mi cuenta» o pides la cancelación en una tienda: dejas de ser miembro del club. Si tienes
              un pedido web o un apartado pendiente, primero lo recoges o le pides a la tienda que lo anule. Los comprobantes de pago se
              conservan el tiempo que exige la ley tributaria, sin tus datos.
            </p>
          </section>

          <section>
            <h2>7. Tus derechos</h2>
            <p>
              Puedes acceder a tus datos, rectificarlos, pedir su cancelación, oponerte a su uso y revocar tus autorizaciones, gratis: en
              cualquier tienda CAYLA, con tu documento, o escribiendo a caylaperu@gmail.com desde el correo de tu cuenta. Algunas las haces
              tú mismo en «Mi cuenta»: cambiar el correo con que entras (con un código que te llega al correo nuevo) y eliminar tu cuenta.
              Si ya no puedes entrar porque perdiste tu correo, en cualquier tienda CAYLA, con tu DNI, te ayudamos a cambiarlo. Te
              respondemos dentro de los plazos de la Ley 29733 y su reglamento. Si no estás conforme, puedes acudir a la Autoridad Nacional de
              Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.
            </p>
          </section>

          <section>
            <h2>8. Seguridad</h2>
            <p>
              Tus datos viajan cifrados. Tu cuenta web está separada de los sistemas internos de CAYLA: el personal ve tu ficha solo según su
              función, y queda registro de quién la crea o la modifica.
            </p>
          </section>

          <section>
            <h2>9. Menores de edad</h2>
            <p>La tienda online y el Club CAYLA son solo para mayores de 18 años. Si detectamos datos de un menor de edad, los eliminamos.</p>
          </section>

          <section>
            <h2>10. Cambios</h2>
            <p>
              Si cambiamos esta política, publicaremos la nueva versión con su fecha. Si el cambio afecta una finalidad que autorizaste, te
              pediremos una nueva autorización.
            </p>
          </section>
        </article>
      </div>
    </MarcoCuenta>
  );
}
