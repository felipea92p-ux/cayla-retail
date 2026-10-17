import type { Metadata } from "next";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { IndiceLegal } from "@/components/ayuda/IndiceLegal";
import { SeccionLegal } from "@/components/ayuda/SeccionLegal";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import type { SeccionLegal as TipoSeccion } from "@/lib/ayuda";
import { TEXTOS_VERSION } from "@/lib/cuentas";
// La lectura larga (el índice, los títulos con su número y los enlaces dentro del texto) tiene su cara en ayuda.css.
import "../estilos/ayuda.css";

export const metadata: Metadata = { title: "Política de privacidad · CAYLA" };

// Los puntos del texto, en su orden: su ancla y su título tal cual (el índice del costado y cada título salen de aquí, así nunca
// dicen dos cosas distintas). Un título nuevo se escribe aquí.
const SECCIONES = [
  { id: "responsable", titulo: "1. Quién es responsable de tus datos" },
  { id: "datos", titulo: "2. Qué datos tratamos" },
  { id: "finalidades", titulo: "3. Para qué los usamos" },
  { id: "obligatorios", titulo: "4. Qué datos son obligatorios" },
  { id: "compartir", titulo: "5. Con quién se comparten" },
  { id: "conservacion", titulo: "6. Cuánto tiempo los guardamos" },
  { id: "derechos", titulo: "7. Tus derechos" },
  { id: "seguridad", titulo: "8. Seguridad" },
  { id: "menores", titulo: "9. Menores de edad" },
  { id: "cambios", titulo: "10. Cambios" },
] as const satisfies readonly TipoSeccion[];
const [responsable, datos, finalidades, obligatorios, compartir, conservacion, derechos, seguridad, menores, cambios] = SECCIONES;

/**
 * La política de privacidad de la tienda online. BORRADOR (ADR-0408, actividad 2): parte de la política del Club CAYLA que ya
 * rige en el ERP (`club_textos`, privacidad v2) y suma lo que trae la cuenta web (correo y contraseña, pedidos web, el servicio
 * de inicio de sesión). La revisa CAYLA antes de publicar la tienda; lo que se acepta al crear la cuenta queda anotado con su
 * versión (`TEXTOS_VERSION`). Revisión «a nivel mundial» (2026-10-16): cambió cómo se lee, NUNCA qué dice (ni una palabra, ni el sello
 * «Borrador»): el título grande, la letra de 16 px, cada título con su número aparte y, en la computadora, el índice fijo al costado
 * que enciende el punto que se está leyendo; en el celular, «En esta página» arriba.
 */
export default function Privacidad() {
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho">
        <article className="ay-legal">
          <EncabezadoAyuda
            apilado
            sello={<span className="w-borrador">Borrador: lo revisa CAYLA</span>}
            titulo={
              <>
                Política de <em>privacidad</em>
              </>
            }
            bajada={
              <>
                Qué datos tuyos guarda CAYLA cuando creas tu cuenta en la tienda online y para qué. Es la misma política del Club CAYLA,
                con lo que suma tu cuenta web. Versión: <span className="ay-sin-corte">{TEXTOS_VERSION}</span>.
              </>
            }
          />
          <div className="ay-legal-cuerpo">
            <IndiceLegal secciones={SECCIONES} otra={{ href: "/terminos-del-club", texto: "Términos del Club CAYLA" }} />
            <div className="ay-legal-texto">
              <SeccionLegal {...responsable}>
                <p>
                  CAYLA S.A.C., RUC 20605964550, con domicilio en Mz. Q Lt. 26, Urb. San Andrés V Etapa, Víctor Larco Herrera, Trujillo, La
                  Libertad, Perú. Correo: <a href="mailto:caylaperu@gmail.com">caylaperu@gmail.com</a>. Tus datos forman parte del banco de
                  datos personales «Clientes», inscrito en el Registro Nacional de Protección de Datos Personales.
                </p>
              </SeccionLegal>

              <SeccionLegal {...datos}>
                <ul>
                  <li>
                    Los que nos das al crear tu cuenta: tu correo y tu contraseña, tu documento (DNI, carné de extranjería o pasaporte), tus nombres
                    y apellidos, tu celular y tu cumpleaños (día y mes; el año, si quieres). Si después cambias el correo con que entras, el nuevo
                    reemplaza al anterior.
                  </li>
                  <li>
                    Con DNI, tu nombre lo tomamos del padrón público, para que quede bien escrito. Con carné de extranjería o pasaporte, lo
                    escribes tú, tal cual está en tu documento.
                  </li>
                  <li>Tu contraseña la guarda cifrada el servicio de inicio de sesión: nadie en CAYLA puede verla.</li>
                  <li>
                    Los que se generan cuando separas o compras: tus pedidos web, la tienda que elegiste, las prendas, tallas, montos y
                    comprobantes, y los beneficios del club que usaste.
                  </li>
                  <li>La prueba de lo que aceptaste: la versión de estos textos, la fecha y la hora.</li>
                </ul>
                <p>No pedimos datos sensibles (salud, origen, religión u otros).</p>
              </SeccionLegal>

              <SeccionLegal {...finalidades}>
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
              </SeccionLegal>

              <SeccionLegal {...obligatorios}>
                <p>
                  Tu correo, tu contraseña, tu documento, tu nombre, tu celular y el día y el mes de tu cumpleaños: sin ellos no podemos darte tu
                  cuenta ni aplicar tus beneficios. El año de tu cumpleaños es opcional.
                </p>
              </SeccionLegal>

              <SeccionLegal {...compartir}>
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
              </SeccionLegal>

              {/* Los Términos del Club enlazan aquí (su punto 7): `/privacidad#conservacion`. */}
              <SeccionLegal {...conservacion}>
                <p>
                  Mientras tengas tu cuenta y seas miembro del club. Si pasan 3 años desde tu última compra o tu última entrada a tu cuenta
                  web, anonimizamos tu ficha de forma automática, como en el Club CAYLA, y cerramos tu cuenta web: borramos tu correo, quitamos
                  tus favoritos y tus avisos de «Avísame cuando llegue», y ya no puedes entrar con ella. Lo mismo, cuando quieras, si eliminas
                  tu cuenta en «Mi cuenta» ▸ «Eliminar mi cuenta» o pides la cancelación en una tienda: dejas de ser miembro del club. Si tienes
                  un pedido web o un apartado pendiente, primero lo recoges o le pides a la tienda que lo anule. Los comprobantes de pago se
                  conservan el tiempo que exige la ley tributaria, sin tus datos.
                </p>
              </SeccionLegal>

              <SeccionLegal {...derechos}>
                <p>
                  Puedes acceder a tus datos, rectificarlos, pedir su cancelación, oponerte a su uso y revocar tus autorizaciones, gratis: en
                  cualquier tienda CAYLA, con tu documento, o escribiendo a <a href="mailto:caylaperu@gmail.com">caylaperu@gmail.com</a> desde el
                  correo de tu cuenta. Algunas las haces tú mismo en «Mi cuenta»: cambiar el correo con que entras (con un código que te llega al
                  correo nuevo) y eliminar tu cuenta.
                  Si ya no puedes entrar porque perdiste tu correo, en cualquier tienda CAYLA, con tu DNI, te ayudamos a cambiarlo. Te
                  respondemos dentro de los plazos de la Ley 29733 y su reglamento. Si no estás conforme, puedes acudir a la Autoridad Nacional de
                  Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.
                </p>
              </SeccionLegal>

              <SeccionLegal {...seguridad}>
                <p>
                  Tus datos viajan cifrados. Tu cuenta web está separada de los sistemas internos de CAYLA: el personal ve tu ficha solo según su
                  función, y queda registro de quién la crea o la modifica.
                </p>
              </SeccionLegal>

              <SeccionLegal {...menores}>
                <p>La tienda online y el Club CAYLA son solo para mayores de 18 años. Si detectamos datos de un menor de edad, los eliminamos.</p>
              </SeccionLegal>

              <SeccionLegal {...cambios}>
                <p>
                  Si cambiamos esta política, publicaremos la nueva versión con su fecha. Si el cambio afecta una finalidad que autorizaste, te
                  pediremos una nueva autorización.
                </p>
              </SeccionLegal>
            </div>
          </div>
        </article>
      </div>
    </MarcoCuenta>
  );
}
