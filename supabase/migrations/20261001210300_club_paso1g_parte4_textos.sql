-- ============================================================================
-- 20261001210300_club_paso1g_parte4_textos.sql — CAYLA V2 · Club de clientas · tanda 1g · PARTE 4 de 8
-- ADR-0288 (G-3, G-6, G-8, G-11 y «Contrato de la tanda 1g»). SOLO `club_textos`: los tipos nuevos y sus textos v1. Va sola
-- porque el club lee `club_textos` (y `club_permisos` la cita por llave foránea): cambiarle los candados la toma en exclusiva.
-- Cabecera completa en la PARTE 8, 20261001210700_club_paso1g_parte8_funciones.sql. Se pega CUARTA, sola en el SQL Editor;
-- se puede pegar dos veces (los textos entran con `on conflict do nothing`: pegarla otra vez no pisa un texto ya publicado,
-- que nunca se edita). Sin políticas ni `drop trigger`.
--
-- LOS TEXTOS (v1, `docs/club/texto-legal-registro-v1.md`, aprobados por Felipe el 2026-10-01):
--   · terminos            = la sección 3 («Términos del Club CAYLA»), puntos 1 a 8, tal cual;
--   · privacidad          = la sección 2 («Política de privacidad del Club CAYLA»), 2.1 a 2.11, tal cual;
--   · casilla_publicidad  = el texto de la casilla 3 (la de WhatsApp, opcional);
--   · saludo              = el mensaje que ella envía al WhatsApp de la tienda después de «Unirme» (G-6);
--   · aviso_cumpleanos, aviso_aniversario, aviso_novedades, aviso_rebaja = las plantillas de Clientas ▸ Avisos (G-8),
--     redactadas para esta tanda: cortas y TODAS terminan con «Si no quieres recibir más mensajes, responde BAJA.» (el
--     candado `club_textos_aviso_con_baja` lo exige a cualquier versión futura).
-- Del texto de cada sección NO entran su título («## 2. Política…», «## 3. Términos…»: la página pone el suyo) ni la línea
-- «Versión 1 · vigente desde [PENDIENTE: fecha de publicación]»: la versión y la fecha son columnas (`version` y
-- `vigente_desde`, la hora en que se pegó esta parte). El formato es el Markdown del documento, con sus saltos de línea.
--
-- MARCADORES: los completa quien muestra el texto. En la página: {pct} (el % del cumpleaños) y {escala} («S/ 20 el primer
-- año, S/ 30 el segundo…») en `terminos`; {nombre} y {codigo} en `saludo` (en el documento decía {código}; el marcador del
-- sistema va sin tilde, como `mensaje_personal`). En los avisos los completa `fn_club_avisos_pendientes`: {nombre} (su
-- nombre de pila), {tienda}, {pct}, {monto}, {vence} y {prenda}.
-- DECIDÍ: el 6, el S/ 600 y los 60 días van escritos en `terminos` (como en el documento aprobado), no como marcadores:
--   cambiarlos con `guardar_beneficios_club` publica una versión nueva con los números nuevos, y así cada versión dice
--   exactamente lo que ella aceptó. {pct} y {escala} también cambian con esa función, y también publican versión.
-- ============================================================================

-- ============================== PARTE 4 · club_textos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.club_textos drop constraint if exists club_textos_tipo_valido;
alter table retail.club_textos add constraint club_textos_tipo_valido
  check (tipo in ('club', 'mensaje_personal', 'mensaje_generico', 'pagina_publicidad',
                  'terminos', 'privacidad', 'casilla_publicidad', 'saludo',
                  'aviso_cumpleanos', 'aviso_aniversario', 'aviso_novedades', 'aviso_rebaja'));
-- El saludo nombra su código: es como la tienda la reconoce en el chat.
alter table retail.club_textos drop constraint if exists club_textos_saludo_con_codigo;
alter table retail.club_textos add constraint club_textos_saludo_con_codigo
  check (tipo <> 'saludo' or position('{codigo}' in texto) > 0);
-- Todo aviso la saluda por su nombre y termina diciéndole cómo darse de baja (Ley 29733: baja sencilla y gratuita).
alter table retail.club_textos drop constraint if exists club_textos_aviso_con_baja;
alter table retail.club_textos add constraint club_textos_aviso_con_baja
  check (tipo not in ('aviso_cumpleanos', 'aviso_aniversario', 'aviso_novedades', 'aviso_rebaja')
         or (position('{nombre}' in texto) > 0 and right(texto, 50) = 'Si no quieres recibir más mensajes, responde BAJA.'));
-- La casilla de publicidad dice cómo retirarla.
alter table retail.club_textos drop constraint if exists club_textos_casilla_con_baja;
alter table retail.club_textos add constraint club_textos_casilla_con_baja
  check (tipo <> 'casilla_publicidad' or position('BAJA' in texto) > 0);

comment on table retail.club_textos is
  'Los textos del club (ADR-0288), versionados: nunca se editan ni se borran (hay permisos que citan cada versión); el vigente de cada tipo es su versión más alta. Tanda 1g: terminos y privacidad (la página del cartel; {pct} y {escala} los completa la página), casilla_publicidad (la casilla opcional de WhatsApp), saludo (lo que ella envía al unirse; {nombre} y {codigo}) y las plantillas de Avisos aviso_cumpleanos, aviso_aniversario, aviso_novedades y aviso_rebaja ({nombre}, {tienda}, {pct}, {monto}, {vence}, {prenda}; todas terminan con «responde BAJA»). De antes, retirados con el camino A y B (siguen por la historia): club, mensaje_personal, mensaje_generico y pagina_publicidad.';

insert into retail.club_textos (tipo, version, texto, creado_por) values
  ('terminos', 1, $texto$1. **Quién puede ser socia:** personas mayores de 18 años, con documento de identidad (DNI, carné de extranjería o pasaporte) y
   un celular con WhatsApp. Unirse es gratis.
2. **Código de socia:** al unirte recibes un código personal (por ejemplo, C-0001). Para usar tus beneficios basta tu
   documento en caja.
3. **Cupón de cumpleaños:**
   - {pct} % de descuento sobre el total de una compra, en cualquier tienda CAYLA, durante el mes de tu cumpleaños según la
     fecha de nacimiento registrada.
   - Una vez por año calendario. Se aplica sobre el precio vigente, incluidas las prendas que ya estén en promoción.
   - Es personal: lo usa la socia, con su documento. No se canjea por dinero ni se acumula con otro cupón del Club.
   - Solo en compras presenciales en tiendas CAYLA. Requiere conexión del sistema en el momento del pago.
   - Si la compra se anula, el cupón vuelve a estar disponible. Si devuelves o cambias prendas, el cupón ya se considera usado.
4. **Vale de aniversario:**
   - Cada año como socia se cuenta desde la fecha en que te uniste. Un año **cuenta** si en él hiciste al menos 6 compras o
     sumaste al menos S/ 600 en compras en tiendas CAYLA. Las compras devueltas completas no cuentan, y una devolución parcial
     descuenta lo devuelto.
   - Al cumplir un año que cuenta, recibes un vale según cuántos años que cuentan llevas: {escala}. Desde el quinto año, el
     vale del quinto año se repite cada año.
   - Si un año no cuenta, no recibes vale ese año, pero no pierdes lo acumulado: el siguiente año que cuente sigue donde te
     quedaste.
   - Tienes 60 días desde tu aniversario para usarlo, en una sola compra, en cualquier prenda de cualquier tienda CAYLA.
   - El vale se descuenta del total de esa compra. No se canjea por dinero, no da vuelto: si la compra es menor que el vale,
     la diferencia no se conserva. Es personal y se usa con tu documento.
   - No se acumula con el cupón de cumpleaños en la misma compra.
   - Si la compra se anula, el vale vuelve a estar disponible dentro de su plazo. Si devuelves o cambias prendas, el vale ya se
     considera usado.
5. **Avisos:** si autorizaste los mensajes, te avisamos por WhatsApp cuando tengas un cupón o un vale disponible. Si no
   recibes el aviso, el beneficio igual está disponible en caja.
6. **Cambios y fin del programa:** CAYLA puede cambiar los beneficios o terminar el Club avisando con 15 días de anticipación
   por WhatsApp (a quien lo autorizó) y en tienda. Los cupones y vales ya disponibles se respetan hasta su vencimiento.
7. **Baja del Club:** puedes darte de baja cuando quieras en cualquier tienda CAYLA o en caylaperu@gmail.com.
8. **Conservación de datos:** si pasan 3 años desde tu última compra, tu ficha se anonimiza de forma automática y dejas de ser
   socia (ver la Política de privacidad, punto 2.6).$texto$, null),
  ('privacidad', 1, $texto$### 2.1 Quién es responsable de tus datos

CAYLA S.A.C., RUC 20605964550, con domicilio en Mz. Q Lt. 26, Urb. San Andrés V Etapa, Víctor Larco Herrera, Trujillo, La
Libertad, Perú. Correo: caylaperu@gmail.com.

Tus datos forman parte del banco de datos personales «Clientes», inscrito en el Registro Nacional de Protección de Datos
Personales con el código PJ-2026-4550 (constancia de inscripción INS-2026-5132, del 8 de septiembre de 2026).

### 2.2 Qué datos tratamos

- Los que nos das al unirte: tipo y número de documento, nombres y apellidos, celular, fecha de nacimiento y, si quieres,
  correo electrónico.
- Si te registras con DNI, tu nombre lo tomamos del padrón público para que quede bien escrito.
- Los que se generan cuando compras en CAYLA: fecha, tienda, prendas, tallas, montos y comprobantes; los cupones que usaste;
  y las preferencias que nos cuentes en tienda (ocasión, estilo, lo que prefieres evitar).
- La prueba de tus autorizaciones: qué texto aceptaste, su versión, la fecha y hora, y la tienda.

No pedimos datos sensibles (salud, origen, religión u otros).

### 2.3 Para qué los usamos

1. **Administrar tu membresía** (necesario para ser socia): reconocerte en caja, ligar tus compras y comprobantes a tu ficha,
   y aplicar tus beneficios (cupón de cumpleaños y vale de aniversario).
2. **Enviarte por WhatsApp novedades, promociones y avisos de tus cupones**, elegidos según tus compras y tu talla. Solo con
   tu autorización expresa, y puedes retirarla en cualquier momento.
3. **Cumplir obligaciones legales:** emitir y conservar comprobantes de pago ante SUNAT.

No usamos tus datos para otras finalidades sin pedirte una nueva autorización.

### 2.4 Qué datos son obligatorios

Documento, nombre, celular y fecha de nacimiento son necesarios para ser socia: sin ellos no podemos reconocerte ni aplicar
tus cupones. El correo es opcional. Si no quieres darlos, puedes seguir comprando en CAYLA como siempre.

### 2.5 Con quién se comparten

No vendemos ni cedemos tus datos. Para operar, los tratan por encargo de CAYLA y solo para estas finalidades:

- **Supabase Inc.** (base de datos) y **Vercel Inc.** (sitio web), con servidores en **São Paulo, Brasil**. Esto es una
  transferencia internacional de datos (flujo transfronterizo), que se hace con proveedores que aplican medidas de seguridad.
- **Meta Platforms (WhatsApp)**, por donde te llegan nuestros mensajes.
- **Consulta del padrón** (servicio de consulta de DNI, Perú), solo para obtener tu nombre a partir de tu DNI.
- **Lucode** (proveedor de servicios electrónicos) y **SUNAT**, para los comprobantes de pago, por obligación tributaria.

### 2.6 Cuánto tiempo los guardamos

Mientras seas socia y compres en CAYLA. Si pasan **3 años desde tu última compra**, anonimizamos tu ficha de forma
automática: tu nombre, documento, celular, fecha de nacimiento y correo dejan de estar asociados a tus compras. Lo mismo
hacemos si pides la cancelación antes. Los comprobantes de pago se conservan el tiempo que exige la ley tributaria.

### 2.7 Tus derechos

Puedes **acceder** a tus datos, **rectificarlos**, pedir su **cancelación**, **oponerte** a su uso y **revocar** tus
autorizaciones, de forma gratuita:

- en cualquier tienda CAYLA, con tu documento, o
- escribiendo a caylaperu@gmail.com desde el correo o el celular que registraste.

Te respondemos dentro de los plazos de la Ley 29733 y su reglamento. Si no estás conforme con la respuesta, puedes acudir a la
Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.

### 2.8 Dejar de recibir WhatsApp

Escribe **BAJA** al WhatsApp de cualquier tienda CAYLA. Dejamos de enviarte mensajes desde ese momento, en todas las tiendas,
sin costo y sin que tengas que explicar por qué. Sigues siendo socia y puedes usar tus cupones y vales en tienda.

### 2.9 Seguridad

Tus datos viajan cifrados, solo los ve el personal de CAYLA que los necesita para atenderte, según su función, y queda
registro de quién los crea o modifica.

### 2.10 Menores de edad

El Club CAYLA es solo para mayores de 18 años. Si detectamos datos de una menor, los eliminamos.

### 2.11 Cambios

Si cambiamos esta política, publicaremos la nueva versión con su fecha. Si el cambio afecta una finalidad que autorizaste, te
pediremos una nueva autorización.$texto$, null),
  ('casilla_publicidad', 1,
   $texto$Acepto que CAYLA S.A.C. me envíe por WhatsApp, al número que registro, novedades, promociones y avisos de mis cupones, elegidos según mis compras y mi talla. Puedo dejar de recibirlos cuando quiera escribiendo BAJA al WhatsApp de cualquier tienda CAYLA.$texto$,
   null),
  ('saludo', 1,
   $texto$Hola CAYLA, soy {nombre}. Me acabo de unir al Club CAYLA ({codigo}) y quiero recibir sus novedades y promociones por este WhatsApp. Sé que me doy de baja escribiendo BAJA.$texto$,
   null),
  ('aviso_cumpleanos', 1,
   $texto$¡Feliz mes de cumpleaños, {nombre}! Como socia del Club CAYLA tienes {pct} % de descuento en una compra este mes, en cualquier tienda CAYLA. Solo muestra tu documento en caja. Te esperamos en {tienda}. Si no quieres recibir más mensajes, responde BAJA.$texto$,
   null),
  ('aviso_aniversario', 1,
   $texto$¡Feliz aniversario en el Club CAYLA, {nombre}! Tienes un vale de S/ {monto} para comprar lo que quieras en cualquier tienda CAYLA, hasta el {vence}. Solo muestra tu documento en caja. Si no quieres recibir más mensajes, responde BAJA.$texto$,
   null),
  ('aviso_novedades', 1,
   $texto$Hola {nombre}, llegaron prendas nuevas a {tienda}. Como socia del Club CAYLA, te contamos primero: ven a verlas cuando quieras. Si no quieres recibir más mensajes, responde BAJA.$texto$,
   null),
  ('aviso_rebaja', 1,
   $texto$Hola {nombre}, {prenda} está con {pct} % de descuento en {tienda} y tenemos tu talla, mientras haya stock. Si no quieres recibir más mensajes, responde BAJA.$texto$,
   null)
on conflict (tipo, version) do nothing;

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 4 ==============================
