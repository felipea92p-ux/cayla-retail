-- ============================================================================
-- club_textos-v3-puntos.sql — CAYLA V2 · Club · los Términos y la Política del programa de puntos (versión 3), con las cifras escritas
--
--   ███  ESTO NO ES UNA MIGRACIÓN: se pega a mano, una vez, en el SQL Editor de producción, con el OK de Felipe.  ███
--
-- POR QUÉ HOY (Felipe, 2026-10-19): el Club ya no va a dar el 10 % de cumpleaños ni el vale de aniversario, y los Términos que se le
--   pasan al abogado (la tienda online y /club/terminos) tienen que hablar de puntos, no de lo que se retira. Hoy no hay miembros
--   reales (el cartel no se imprimió y las cuentas de la tienda son de prueba), así que publicar ya no le cambia nada a nadie.
-- LO QUE QUEDA DESALINEADO HASTA EL LANZAMIENTO: la caja y «Mi cuenta» de producción siguen dando el 10 % y el vale hasta que se peguen las
--   migraciones del programa de puntos (ADR-0459). Lo aceptó Felipe al elegir «cambiarla hoy».
-- POR QUÉ NO ES UNA MIGRACIÓN: las pruebas de Postgres de main (`club_registro_cartel`) prueban la hoja vieja del 10 % y del vale, que con
--   esta versión ya no puede publicar (`guardar_beneficios_club` → `terminos_no_reconocidos`, que es lo correcto). Cuando el programa de
--   puntos llegue a main, retira esa hoja y sus pruebas, y su texto con marcadores entra como versión 4.
-- LAS CIFRAS van escritas (1 punto por S/ 1; 100 puntos = S/ 5; canje desde 200 puntos = S/ 10; cupón de 7 días en compras desde 3 veces
--   su valor; 100 puntos de regalo de cumpleaños): la producción todavía no tiene la configuración de los puntos. El texto es el de
--   `docs/club/club_textos-v3-para-pegar-tras-el-abogado.sql` de la rama de puntos, con los marcadores ya completados.
-- CANDADO: la v2 de cada texto es la del 2026-10-02 (md5, comprobado en producción el 2026-10-19) y no hay otra v3 ni una v4. Si algo no
--   cuadra, aborta sin tocar nada. Idempotente: una segunda pegada no publica nada.
-- Verificación:
--   select tipo, max(version) from retail.club_textos where tipo in ('terminos', 'privacidad') group by tipo;   → 2 filas, 3
--   y abrir /club/terminos y /club/privacidad: «Versión 3», con los puntos y sin «10 %» ni «vale».
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $do$
declare
  v_terminos text := $texto$1. **Quién puede ser miembro:** personas mayores de 18 años, con documento de identidad (DNI, carné de extranjería o pasaporte) y
   un celular con WhatsApp. Unirse es gratis: creas tu cuenta en la tienda online (tienda.cayla.pe) y entras al Club cuando completas
   tu documento y tu celular; en tienda, pide en caja que te agreguen como cliente.
2. **Código de miembro:** al unirte recibes un código personal (por ejemplo, C-0001). Para ganar puntos en caja basta tu documento.
3. **Cómo ganas puntos:**
   - Ganas 1 punto por cada S/ 1 que pagas en una compra en una tienda CAYLA o en la tienda web, siempre que la compra quede
     a tu nombre con tu documento. Se calcula sobre lo que realmente pagas, después de descuentos y cupones, sin céntimos. Una compra
     sin tu documento no suma puntos.
   - Solo cuentan las compras hechas después de tu registro: las anteriores no se ligan a tu cuenta, aunque hayas dado tu documento
     en la boleta.
   - **Regalo de cumpleaños:** en el mes de tu cumpleaños, según la fecha registrada, tu primera compra suma además 100 puntos.
     Una vez por año calendario. Se suman solos al cobrar; no tienes que pedirlos.
4. **Cuánto valen y cómo se canjean:**
   - 100 puntos valen S/ 5 de descuento. Puedes canjear desde 200 puntos (S/ 10), en múltiplos de 100.
     CAYLA puede cambiar estos valores avisando con 15 días de anticipación (punto 7).
   - Al canjear, tus puntos se descuentan de tu saldo y recibes un **cupón con código**, en la tienda web o en caja.
   - El cupón vale 7 días, se usa una sola vez y en una sola compra, en compras desde 3 veces su valor, y no cubre
     la compra completa. No se junta con otro cupón en la misma compra.
   - **Lo puede usar cualquier persona que tenga el código.** Guárdalo: si lo compartes, lo pierdes o te lo usan, no lo reponemos.
     Los puntos de esa compra son de quien se identifica con su documento al pagar, no de quien creó el cupón.
   - No se cambia por dinero y no da vuelto.
   - **Si no lo usas en 7 días, tus puntos vuelven solos a tu saldo.**
5. **Devoluciones y anulaciones:** si se anula una venta, se restan los puntos que dio y el cupón que se usó en ella vuelve a estar
   disponible por el tiempo que le quedaba. Si devuelves prendas, se restan los puntos de lo devuelto y se te devuelve lo que
   pagaste, sin incluir el valor del cupón.
6. **Avisos:** tus puntos y tus cupones los ves en tu cuenta. Por WhatsApp te avisamos de tus puntos y tus cupones solo si lo
   autorizaste. Si otra persona usa un cupón tuyo, te avisamos que se usó, sin decirte quién. Si no recibes el aviso, tus puntos
   igual están.
7. **Cambios y fin del programa:** CAYLA puede cambiar el programa (lo que ganas, lo que valen los puntos o las condiciones del
   canje) o terminarlo avisando con 15 días de anticipación en tienda, en la web y por WhatsApp (a quien lo autorizó). Un cambio
   rige solo desde la fecha avisada: los puntos ya ganados mantienen su valor hasta esa fecha, y si el programa termina tienes 60
   días para canjearlos. Los cupones ya creados se respetan hasta su vencimiento.
8. **Cuánto duran tus puntos y tus datos:**
   - Tus puntos no vencen por el paso del tiempo mientras sigas comprando. Si pasan **3 años desde tu última compra**, eliminamos
     tus datos personales de forma definitiva (tu ficha deja de identificarte, ver la Política de privacidad, punto 2.6) y **tus
     puntos se eliminan con ellos**, porque ya no podemos saber a quién pertenecen. Desde ese momento ya no eres miembro.
   - Te avisamos 30 días antes por WhatsApp si lo autorizaste, y puedes ver tu fecha en tu perfil. Una compra reinicia ese plazo.
   - Los puntos son personales: no son dinero, no se transfieren a otra persona, no se cambian por efectivo ni se heredan (los
     cupones sí los puede usar quien los tenga, punto 4).
   - **Baja del Club:** puedes darte de baja cuando quieras en cualquier tienda CAYLA o en caylaperu@gmail.com. Con la baja tus
     puntos también se eliminan; antes de confirmarla te mostramos cuántos puntos perderías.
9. **Errores y mal uso:** si por error te damos o te quitamos puntos, lo corregimos y te lo explicamos. Si detectamos uso
   fraudulento (por ejemplo, compras ficticias para ganar puntos), podemos anular los puntos mal obtenidos: te decimos el motivo por
   escrito y puedes reclamar.$texto$;
  v_privacidad text := $texto$### 2.1 Quién es responsable de tus datos

CAYLA S.A.C., RUC 20605964550, con domicilio en Mz. Q Lt. 26, Urb. San Andrés V Etapa, Víctor Larco Herrera, Trujillo, La
Libertad, Perú. Correo: caylaperu@gmail.com.

Tus datos forman parte del banco de datos personales «Clientes», inscrito en el Registro Nacional de Protección de Datos
Personales con el código PJ-2026-4550 (constancia de inscripción INS-2026-5132, del 8 de septiembre de 2026).

### 2.2 Qué datos tratamos

- Los que nos das al unirte: tipo y número de documento, nombres y apellidos, celular, fecha de nacimiento y, si quieres,
  correo electrónico.
- Si te registras con DNI, tu nombre lo tomamos del padrón público para que quede bien escrito.
- Los que se generan cuando compras en CAYLA: fecha, tienda, prendas, tallas, montos y comprobantes; los puntos que ganas y
  canjeas, y los cupones que creas y su uso; y las preferencias que nos cuentes en tienda (ocasión, estilo, lo que prefieres evitar).
- La prueba de tus autorizaciones: qué texto aceptaste, su versión, la fecha y hora, y la tienda.

No pedimos datos sensibles (salud, origen, religión u otros).

### 2.3 Para qué los usamos

1. **Administrar tu membresía** (necesario para ser miembro): reconocerte en caja, ligar tus compras y comprobantes a tu ficha,
   y aplicar tus beneficios (tus puntos, tus cupones y tu regalo de cumpleaños).
2. **Enviarte por WhatsApp novedades, promociones y avisos de tus puntos y cupones**, elegidos según tus compras y tu talla. Solo
   con tu autorización expresa, y puedes retirarla en cualquier momento.
3. **Cumplir obligaciones legales:** emitir y conservar comprobantes de pago ante SUNAT.

No usamos tus datos para otras finalidades sin pedirte una nueva autorización.

### 2.4 Qué datos son obligatorios

Documento, nombre, celular y fecha de nacimiento son necesarios para ser miembro: sin ellos no podemos reconocerte ni sumar
tus puntos. El correo es opcional. Si no quieres darlos, puedes seguir comprando en CAYLA como siempre.

### 2.5 Con quién se comparten

No vendemos ni cedemos tus datos. Para operar, los tratan por encargo de CAYLA y solo para estas finalidades:

- **Supabase Inc.** (base de datos) y **Vercel Inc.** (sitio web), con servidores en **São Paulo, Brasil**. Esto es una
  transferencia internacional de datos (flujo transfronterizo), que se hace con proveedores que aplican medidas de seguridad.
- **Meta Platforms (WhatsApp)**, por donde te llegan nuestros mensajes.
- **Consulta del padrón** (servicio de consulta de DNI, Perú), solo para obtener tu nombre a partir de tu DNI.
- **Lucode** (proveedor de servicios electrónicos) y **SUNAT**, para los comprobantes de pago, por obligación tributaria.

Si otra persona usa un cupón tuyo, te avisamos que se usó, sin decirte quién.

### 2.6 Cuánto tiempo los guardamos

Guardamos tus datos mientras seas miembro y compres en CAYLA. **Si pasan 3 años desde tu última compra, eliminamos tus datos
personales de forma definitiva**: tu nombre, documento, celular, fecha de nacimiento y correo dejan de estar asociados a tus
compras, y **tus puntos se eliminan con ellos**. Antes te avisamos (Términos del Club, punto 8). Lo mismo hacemos si pides la
cancelación antes. Los comprobantes de pago se conservan, sin tus datos de miembro, el tiempo que exige la ley tributaria.

### 2.7 Tus derechos

Puedes **acceder** a tus datos, **rectificarlos**, pedir su **cancelación**, **oponerte** a su uso y **revocar** tus
autorizaciones, de forma gratuita:

- en cualquier tienda CAYLA, con tu documento, o
- escribiendo a caylaperu@gmail.com desde el correo o el celular que registraste.

Te respondemos dentro de los plazos de la Ley 29733 y su reglamento. Si no estás conforme con la respuesta, puedes acudir a la
Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.

### 2.8 Dejar de recibir WhatsApp

Escribe **BAJA** al WhatsApp de cualquier tienda CAYLA. Dejamos de enviarte mensajes desde ese momento, en todas las tiendas,
sin costo y sin que tengas que explicar por qué. Sigues siendo miembro y puedes usar tus puntos y tus cupones en tienda.

### 2.9 Seguridad

Tus datos viajan cifrados, solo los ve el personal de CAYLA que los necesita para atenderte, según su función, y queda
registro de quién los crea o modifica.

### 2.10 Menores de edad

El Club CAYLA es solo para mayores de 18 años. Si detectamos datos de un menor de edad, los eliminamos.

### 2.11 Cambios

Si cambiamos esta política, publicaremos la nueva versión con su fecha. Si el cambio afecta una finalidad que autorizaste, te
pediremos una nueva autorización.$texto$;
  v record;
  v_md5_v2 text;
begin
  -- 1. Candado: la v2 de cada texto es la del 2026-10-02, y no hay una v3 distinta ni una v4.
  for v in select * from (values
    ('terminos', 'de66042bd9bac0e936dd5c912b28de60', md5(v_terminos)),
    ('privacidad', 'a01e7810b53677b95c12d8c0004148a4', md5(v_privacidad))
  ) e(tipo, md5_v2, md5_v3) loop
    v_md5_v2 := (select md5(t.texto) from retail.club_textos t where t.tipo = v.tipo and t.version = 2);
    if v_md5_v2 is distinct from v.md5_v2 then
      raise exception 'El texto % versión 2 no es el del 2026-10-02: no se publica la versión 3 sobre otro texto. No se publicó nada.', v.tipo;
    end if;
    if exists (select 1 from retail.club_textos t where t.tipo = v.tipo and (t.version > 3 or (t.version = 3 and md5(t.texto) <> v.md5_v3))) then
      raise exception 'El texto % ya tiene otra versión 3 o una 4: revisa antes de pegar. No se publicó nada.', v.tipo;
    end if;
  end loop;

  -- 2. Las versiones 3 (una segunda pegada no hace nada).
  insert into retail.club_textos (tipo, version, texto, creado_por) values
    ('terminos', 3, v_terminos, null),
    ('privacidad', 3, v_privacidad, null)
  on conflict (tipo, version) do nothing;
end
$do$;

reset lock_timeout;
notify pgrst, 'reload schema';
