-- ============================================================================
-- club_textos-v3-para-pegar-tras-el-abogado.sql — CAYLA V2 · Club · los Términos y la Política del programa de puntos (versión 4)
--
-- ACTUALIZACIÓN 2026-10-19 (Felipe): la versión 3 ya se publicó desde main con las cifras ESCRITAS (`docs/club/club_textos-v3-puntos.sql`
--   en main), para que los Términos dejen de hablar del 10 % y del vale antes del lanzamiento. Este archivo publica el MISMO texto con
--   los marcadores, como versión 4, el día que lleguen las migraciones de puntos: así una cifra que el líder cambie en Beneficios del
--   club se dice sola. El candado de abajo exige que la v3 sea la de las cifras escritas. (El nombre del archivo se queda.)
--
--   ███  ESTO NO ES UNA MIGRACIÓN.  ███  NO SE PEGA HASTA QUE EL ABOGADO APRUEBE EL TEXTO.  ███
--
-- Vive en `docs/club/` y no en `supabase/migrations/` a propósito: ni el CI ni `supabase migration up` lo aplican. Es el SQL que
-- publicaría, el día que el abogado (y el contador, por los puntos pendientes) aprueben `docs/club/texto-legal-puntos-v1-borrador.md`,
-- las versiones 3 de `terminos` y `privacidad` de `retail.club_textos`. Quién lo pega: Felipe, en el SQL Editor de producción.
--
-- ANTES DE PEGAR (todo esto tiene que estar resuelto, o el texto de abajo corregido con lo que diga el abogado):
--   1. El abogado aprobó el texto. Si cambió una palabra, se cambia AQUÍ, entre los `$texto$`, antes de pegar.
--   2. Lo que el borrador deja «[por decidir]» y este texto NO promete (lo dejé fuera, no lo inventé):
--        · si se pueden sumar puntos de una compra después, con la boleta y dentro de un plazo (borrador 5.1);
--        · qué pasa con el valor del cupón en una devolución parcial, y si un saldo negativo se compensa (5.5);
--        · los 60 días para canjear si el programa termina (5.9): ESTE TEXTO SÍ LOS DICE, igual que la tienda online; si el
--          abogado o Felipe dicen otra cosa, se corrige el punto 7 de los Términos.
--   3. Está en producción `20261019222000_club_puntos_textos_y_avisos.sql` (`fn_club_puntos_vigentes`): los Términos nuevos nombran las
--      cifras de los puntos con marcadores y, sin esa función, `/club/terminos` diría «No pudimos abrir esta página» (la web no muestra un
--      texto legal con una cifra que falta). El candado de abajo lo comprueba y no publica nada si falta.
--   4. Los 15 días de aviso (Términos v2, punto 6): `vigente_desde` es el momento en que se pega (el valor de fábrica de la tabla), y la
--      web muestra siempre la versión más alta. Si hay miembros reales, el aviso se da ANTES de pegar esto.
--
-- LOS MARCADORES. La web (`apps/web/lib/club-registro-reglas.ts`, `textoLegal`) los completa con la configuración vigente
-- (`fn_club_puntos_vigentes`), cada uno con su unidad para que la frase concuerde con la cifra:
--   {puntos_por_sol} «1 punto» (seguido de «por cada S/ 1») · {soles_por_100} «S/ 5» · {canje_minimo} «200 puntos» ·
--   {canje_minimo_soles} «S/ 10» (lo que vale el canje mínimo) · {vigencia_dias} «7 días» · {compra_minima_x} «3 veces» (seguido de
--   «su valor») · {regalo_cumple} «100 puntos».
--   Así, si el líder cambia la configuración en Clientes ▸ Beneficios del club, el texto dice la cifra nueva sin publicar otra versión.
--   Los 15 días de aviso, los 3 años de conservación, los 30 días del aviso y los 60 días del cierre NO son marcadores: los fijan los
--   Términos y cambiarlos exige otra versión (borrador, sección 7).
--
-- QUÉ CAMBIA RESPECTO A LA v2 (para que el abogado lo vea de un vistazo):
--   · terminos v3: los puntos 3 (cupón de cumpleaños) y 4 (vale de aniversario) se reemplazan por el programa de puntos del borrador
--     (5.1 a 5.9), ordenado en 9 puntos como los Términos de la tienda online (`apps/tienda/app/terminos-del-club/page.tsx`). Ya no
--     nombran `{pct}` ni `{escala}`, ni las frases «al menos N compras» / «Tienes N días desde tu aniversario».
--   · privacidad v3: 2.2, 2.3 (puntos 1 y 2) y 2.6 como dice el borrador (sección 3), y el aviso «sin decirte quién» cuando otra persona
--     usa tu cupón (en 2.5). Además, por coherencia y FUERA de la lista explícita del borrador (que el abogado lo confirme): 2.4 («aplicar
--     tus cupones» → «sumar tus puntos») y 2.8 («tus cupones y vales» → «tus puntos y tus cupones»).
--
-- CONSECUENCIA EN EL ERP: `guardar_beneficios_club` (la hoja vieja del 10 % y del vale) publica una versión nueva de los Términos
--   reescribiendo «al menos N compras» y «Tienes N días…». Con la v3 esas frases ya no existen y la función rechaza el guardado
--   (`terminos_no_reconocidos`): es lo correcto, esos beneficios se retiraron.
--
-- POR QUÉ VERSIONES Y NO UPDATE: `club_textos` no se edita ni se borra (cada permiso cita la versión que la persona leyó); el vigente de
--   cada tipo es su versión más alta (como `20261002160000_club_textos_v2_sin_genero.sql`).
--
-- CANDADO: antes de publicar comprueba que la v2 de cada texto es la del 2026-10-02 (md5; en producción el 2026-10-19 la versión más
--   alta de los dos era la 2, con esas huellas), que no hay una v3 distinta ni una v4, y que existe `fn_club_puntos_vigentes`. Si algo no
--   cuadra, aborta sin tocar nada. Idempotente: pegarlo dos veces no publica nada la segunda.
-- CÓMO SE PEGA: solo, de una vez, en el SQL Editor de producción. Sin `alter`, sin políticas ni triggers; `lock_timeout` de 3 s. Los
--   textos van dentro de un bloque `do` (entre `$texto$`): ningún `select … into` queda en un texto entre comillas simples (ADR-0288).
-- Verificación:
--   select tipo, max(version) from retail.club_textos where tipo in ('terminos', 'privacidad') group by tipo;   → 2 filas, 3
--   y abrir /club/terminos y /club/privacidad: «Versión 3 · vigente desde el …», con las cifras de los puntos y sin «{».
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
   - Ganas {puntos_por_sol} por cada S/ 1 que pagas en una compra en una tienda CAYLA o en la tienda web, siempre que la compra quede
     a tu nombre con tu documento. Se calcula sobre lo que realmente pagas, después de descuentos y cupones, sin céntimos. Una compra
     sin tu documento no suma puntos.
   - Solo cuentan las compras hechas después de tu registro: las anteriores no se ligan a tu cuenta, aunque hayas dado tu documento
     en la boleta.
   - **Regalo de cumpleaños:** en el mes de tu cumpleaños, según la fecha registrada, tu primera compra suma además {regalo_cumple}.
     Una vez por año calendario. Se suman solos al cobrar; no tienes que pedirlos.
4. **Cuánto valen y cómo se canjean:**
   - 100 puntos valen {soles_por_100} de descuento. Puedes canjear desde {canje_minimo} ({canje_minimo_soles}), en múltiplos de 100.
     CAYLA puede cambiar estos valores avisando con 15 días de anticipación (punto 7).
   - Al canjear, tus puntos se descuentan de tu saldo y recibes un **cupón con código**, en la tienda web o en caja.
   - El cupón vale {vigencia_dias}, se usa una sola vez y en una sola compra, en compras desde {compra_minima_x} su valor, y no cubre
     la compra completa. No se junta con otro cupón en la misma compra.
   - **Lo puede usar cualquier persona que tenga el código.** Guárdalo: si lo compartes, lo pierdes o te lo usan, no lo reponemos.
     Los puntos de esa compra son de quien se identifica con su documento al pagar, no de quien creó el cupón.
   - No se cambia por dinero y no da vuelto.
   - **Si no lo usas en {vigencia_dias}, tus puntos vuelven solos a tu saldo.**
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
  v_md5_v3 text;
begin
  -- 0. Candado: la configuración de los puntos ya es pública (sin ella los Términos nuevos no se pueden mostrar).
  if to_regprocedure('retail.fn_club_puntos_vigentes()') is null then
    raise exception 'Falta retail.fn_club_puntos_vigentes(): pega antes 20261019222000_club_puntos_textos_y_avisos.sql. No se publicó nada.';
  end if;

  -- 1. Candado: la v3 de cada texto es la de las cifras escritas que se publicó el 2026-10-19 (`club_textos-v3-puntos.sql`, desde main),
  --    y no hay una v4 distinta ni una v5.
  for v in select * from (values
    ('terminos', '3ed42d9395c5fffdffd6f48fa04129c3', md5(v_terminos)),
    ('privacidad', '63e3ef99ed48f1825e36f4ccb6969de1', md5(v_privacidad))
  ) e(tipo, md5_v3, md5_v4) loop
    v_md5_v3 := (select md5(t.texto) from retail.club_textos t where t.tipo = v.tipo and t.version = 3);
    if v_md5_v3 is distinct from v.md5_v3 then
      raise exception 'El texto % versión 3 no es el de las cifras escritas del 2026-10-19: no se publica la versión 4 sobre otro texto. No se publicó nada.', v.tipo;
    end if;
    if exists (select 1 from retail.club_textos t where t.tipo = v.tipo and (t.version > 4 or (t.version = 4 and md5(t.texto) <> v.md5_v4))) then
      raise exception 'El texto % ya tiene otra versión 4 o una 5: revisa antes de pegar. No se publicó nada.', v.tipo;
    end if;
  end loop;

  -- 2. Las versiones 4 (una segunda pegada no hace nada). La Política no nombra cifras: si el abogado no le cambió nada, su v4 sería
  --    idéntica a la v3 y no se publica.
  insert into retail.club_textos (tipo, version, texto, creado_por)
  select x.tipo, 4, x.texto, null
    from (values ('terminos', v_terminos), ('privacidad', v_privacidad)) x(tipo, texto)
   where md5(x.texto) is distinct from (select md5(t.texto) from retail.club_textos t where t.tipo = x.tipo and t.version = 3)
  on conflict (tipo, version) do nothing;
end
$do$;

reset lock_timeout;
notify pgrst, 'reload schema';
