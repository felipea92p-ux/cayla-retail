import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { IndiceLegal } from "@/components/ayuda/IndiceLegal";
import { SeccionLegal } from "@/components/ayuda/SeccionLegal";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import type { SeccionLegal as TipoSeccion } from "@/lib/ayuda";
import { soles, TEXTOS_VERSION } from "@/lib/cuentas";
import { leerConfigDePuntosDelClub } from "@/lib/puntos-servidor";
// La lectura larga (el índice, los títulos con su número y los enlaces dentro del texto) tiene su cara en ayuda.css.
import "../estilos/ayuda.css";

export const metadata: Metadata = { title: "Términos del Club CAYLA · CAYLA" };

// Los puntos del texto, en su orden: su ancla y su título tal cual (el índice del costado y cada título salen de aquí, así nunca
// dicen dos cosas distintas). Un título nuevo se escribe aquí.
const SECCIONES = [
  { id: "miembros", titulo: "1. Quién puede ser miembro" },
  { id: "codigo", titulo: "2. Código de miembro" },
  { id: "puntos", titulo: "3. Cómo ganas puntos" },
  { id: "cupones", titulo: "4. Cómo se canjean: los cupones" },
  { id: "devoluciones", titulo: "5. Devoluciones y anulaciones" },
  { id: "avisos", titulo: "6. Avisos" },
  { id: "cambios-del-club", titulo: "7. Cambios y fin del programa" },
  { id: "conservacion-club", titulo: "8. Cuánto duran tus puntos y tus datos" },
  { id: "errores", titulo: "9. Errores y mal uso" },
] as const satisfies readonly TipoSeccion[];
const [miembros, codigo, puntos, cupones, devoluciones, avisos, cambios, conservacion, errores] = SECCIONES;

/**
 * Los términos del Club CAYLA. BORRADOR del programa de puntos (2026-10-19, docs/club/texto-legal-puntos-v1-borrador.md): reemplaza al
 * descuento de cumpleaños y al vale de aniversario, que se retiraron. Lo revisa el abogado antes de publicarse (`club_textos` sigue con la
 * versión anterior hasta entonces; la cuenta registra la versión que aceptó). Las cifras (puntos por sol, lo que valen, el canje, la
 * compra mínima, los días del cupón y el regalo de cumpleaños) salen de la base, las mismas que usa la caja (`tienda_puntos_config`); si
 * la base no contesta, se dicen sin cifras. Cómo se lee (la letra, el índice fijo al costado, cada título con su número) es el de la
 * revisión «a nivel mundial» (2026-10-16).
 */
export default async function TerminosDelClub() {
  const c = await leerConfigDePuntosDelClub();
  const porSol = c ? `${c.puntosPorSol === 1 ? "1 punto" : `${c.puntosPorSol} puntos`} por cada S/\u00a01` : "puntos por cada sol";
  const valen = c ? `100 puntos valen ${soles(c.solesPor100)}` : "cada 100 puntos valen un monto en soles";
  const minimo = c ? `desde ${c.canjeMinimo.toLocaleString("es-PE")} puntos (${soles(Math.floor(c.canjeMinimo / 100) * c.solesPor100)})` : "desde un mínimo de puntos";
  const dias = c ? `${c.vigenciaDias} ${c.vigenciaDias === 1 ? "día" : "días"}` : "unos días";
  const veces = c ? `${Number.isInteger(c.compraMinimaX) ? c.compraMinimaX : c.compraMinimaX.toFixed(2)} veces su valor` : "varias veces su valor";
  const regalo = c ? `${c.regaloCumple.toLocaleString("es-PE")} puntos` : "puntos de regalo";
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho">
        <article className="ay-legal">
          <EncabezadoAyuda
            apilado
            sello={<span className="w-borrador">Borrador: lo revisa el abogado</span>}
            titulo={
              <>
                Términos del <em>Club CAYLA</em>
              </>
            }
            bajada={
              <>
                El programa de puntos del Club CAYLA, en tienda y en la tienda online. Borrador del 19 de octubre de 2026, pendiente de revisión
                legal; la versión que aceptaste al crear tu cuenta es la <span className="ay-sin-corte">{TEXTOS_VERSION}</span>.
              </>
            }
          />
          <div className="ay-legal-cuerpo">
            <IndiceLegal secciones={SECCIONES} otra={{ href: "/privacidad", texto: "Política de privacidad" }} />
            <div className="ay-legal-texto">
              <SeccionLegal {...miembros}>
                <p>
                  Personas mayores de 18 años, con DNI, carné de extranjería o pasaporte y un celular con WhatsApp. Unirse es gratis: creas tu
                  cuenta en la tienda online con lo mínimo (tu correo y tu nombre, o con Google) y entras al club cuando completas tu documento
                  y tu celular, que te pedimos la primera vez que separas una prenda (o antes, desde «Mi perfil»). En tienda, pide que te
                  agreguen como cliente en caja y únete con el código QR del cartel.
                </p>
              </SeccionLegal>

              <SeccionLegal {...codigo}>
                <p>Al unirte recibes un código personal (por ejemplo, C-0001). Para ganar puntos en caja basta tu documento.</p>
              </SeccionLegal>

              <SeccionLegal {...puntos}>
                <ul>
                  <li>
                    Ganas {porSol} que pagas en una compra en una tienda CAYLA o en la tienda web, siempre que la compra quede a tu nombre con
                    tu documento. Se calcula sobre lo que realmente pagas, después de descuentos y cupones, sin céntimos. Una compra sin tu
                    documento no suma puntos.
                  </li>
                  <li>
                    Solo cuentan las compras hechas después de tu registro: las anteriores no se ligan a tu cuenta, aunque hayas dado tu DNI en
                    la boleta.
                  </li>
                  <li>
                    <b>Regalo de cumpleaños:</b> en el mes de tu cumpleaños, según la fecha registrada, tu primera compra suma además {regalo}.
                    Una vez por año calendario. Se suman solos al cobrar; no tienes que pedirlos.
                  </li>
                  <li>Tus puntos los ves en «Mi perfil», con su historial.</li>
                </ul>
              </SeccionLegal>

              <SeccionLegal {...cupones}>
                <ul>
                  <li>
                    {valen} de descuento. Puedes canjear {minimo}, de 100 en 100, en la tienda web o en caja. CAYLA puede cambiar estos
                    valores avisando con 15 días de anticipación (punto 7).
                  </li>
                  <li>
                    Al canjear, tus puntos se descuentan de tu saldo y recibes un <b>cupón con código</b>. El cupón vale {dias}, se usa una
                    sola vez y en una sola compra, en compras desde {veces}, y no cubre la compra completa. No se junta con otro cupón.
                  </li>
                  <li>
                    <b>Lo puede usar cualquier persona que tenga el código.</b> Guárdalo: si lo compartes, lo pierdes o te lo usan, no lo
                    reponemos. Los puntos de esa compra son de quien se identifica con su documento al pagar, no de quien creó el cupón.
                  </li>
                  <li>No se cambia por dinero y no da vuelto.</li>
                  <li>
                    <b>Si no lo usas en {dias}, tus puntos vuelven solos a tu saldo.</b>
                  </li>
                </ul>
              </SeccionLegal>

              <SeccionLegal {...devoluciones}>
                <p>
                  Si se anula una venta, se restan los puntos que dio y el cupón que se usó en ella vuelve a estar disponible por el tiempo que
                  le quedaba. Si devuelves prendas, se restan los puntos de lo devuelto y se te devuelve lo que pagaste, sin incluir el valor
                  del cupón.
                </p>
              </SeccionLegal>

              <SeccionLegal {...avisos}>
                <p>
                  Tus puntos y tus cupones los ves en tu cuenta. Por WhatsApp te avisamos de tus puntos y tus cupones solo si lo autorizaste.
                  Si otra persona usa un cupón tuyo, te avisamos que se usó, sin decirte quién. Si no recibes el aviso, tus puntos igual están.
                </p>
              </SeccionLegal>

              <SeccionLegal {...cambios}>
                <p>
                  CAYLA puede cambiar el programa (lo que ganas, lo que valen los puntos o las condiciones del canje) o terminarlo avisando con
                  15 días de anticipación en tu cuenta, por WhatsApp (a quien lo autorizó) y en tienda. Un cambio rige solo desde la fecha
                  avisada: los puntos ya ganados mantienen su valor hasta esa fecha, y si el programa termina tienes 60 días para canjearlos.
                  Los cupones ya creados se respetan hasta su vencimiento.
                </p>
              </SeccionLegal>

              <SeccionLegal {...conservacion}>
                <p>
                  Tus puntos no vencen mientras sigas comprando. Si pasan 3 años desde tu última compra, eliminamos tus datos personales de
                  forma definitiva (ver la <Link href="/privacidad#conservacion">Política de privacidad</Link>) y tus puntos se eliminan con
                  ellos, porque ya no podemos saber a quién pertenecen: desde ese momento ya no eres miembro. Te avisamos 30 días antes por
                  WhatsApp si lo autorizaste, y tu fecha la ves en «Mi perfil». Cada compra la corre 3 años más.
                </p>
                <p>
                  Los puntos son personales: no son dinero, no se transfieren a otra persona, no se cambian por efectivo ni se heredan. Si
                  eliminas tu cuenta o pides tu baja del Club, tus puntos también se eliminan.
                </p>
              </SeccionLegal>

              <SeccionLegal {...errores}>
                <p>
                  Si por error te damos o te quitamos puntos, lo corregimos y te lo explicamos. Si detectamos uso fraudulento (por ejemplo,
                  compras ficticias para ganar puntos), podemos anular los puntos mal obtenidos: te decimos el motivo por escrito y puedes
                  reclamar.
                </p>
              </SeccionLegal>
            </div>
          </div>
        </article>
      </div>
    </MarcoCuenta>
  );
}
