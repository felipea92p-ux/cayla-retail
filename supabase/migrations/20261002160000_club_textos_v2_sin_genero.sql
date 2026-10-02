-- ============================================================================
-- 20261002160000_club_textos_v2_sin_genero.sql — CAYLA V2 · Club de clientes · textos v2 sin género
-- ADR-0288 act. (k). Felipe, 2026-10-02: el club habla igual a un cliente que a una clienta. «socia» pasa a «miembro»,
-- «clientas» a «clientes», y las dos casillas largas de la página se acortan. Esta migración publica las versiones 2 de los
-- textos que lo necesitan y renombra el módulo:
--   · terminos v2           «Quién puede ser miembro», «Código de miembro», «Es personal y se usa con tu documento», «Cada año
--                           como miembro», «dejas de ser miembro». Las tres frases que reconoce `guardar_beneficios_club`
--                           («al menos N compras», «al menos S/ N en compras», «Tienes N días desde tu aniversario») y los
--                           marcadores {pct} y {escala} quedan iguales.
--   · privacidad v2         «para ser miembro» (2.3 y 2.4), «Mientras seas miembro» (2.6), «Sigues siendo miembro» (2.8),
--                           «datos de un menor de edad» (2.10). La 2.5 sigue diciendo que los datos se guardan en São Paulo,
--                           Brasil: es un flujo transfronterizo y la Ley 29733 pide informarlo. Lo que se quitó es esa línea de
--                           la letra chica bajo el botón (web), no de la Política.
--   · casilla_publicidad v2 «Quiero recibir por WhatsApp novedades y promociones de CAYLA.» (breve, a pedido de Felipe). Cómo darse de baja sigue en
--                           la Política (2.8) y en cada aviso («responde BAJA»). Por eso se suelta el candado
--                           `club_textos_casilla_con_baja`, que exigía «BAJA» en la casilla.
--   · aviso_cumpleanos v2 y aviso_novedades v2: «Como miembro del Club CAYLA». Siguen terminando con «responde BAJA» (su
--                           candado `club_textos_aviso_con_baja` no cambia). Los avisos de aniversario y rebaja ya eran neutros.
--   · retail.modulos        «Clientas» → «Clientes» (la clave `clientas` y la ruta /clientas no cambian) y el «incluye» de
--                           «Avisos del club» dice «miembros».
--   · acciones_sin_responsable: dos descripciones dicen «cliente» en vez de «clienta».
-- El saludo ya es neutro (v2, 20261001223000).
--
-- POR QUÉ VERSIONES Y NO UPDATE: `club_textos` no se edita ni se borra (cada permiso cita la versión que la persona leyó); el
-- vigente de cada tipo es su versión más alta. Quien tenga la página abierta justo al pegar ve «Los textos del club cambiaron
-- mientras te registrabas: vuelve a leerlos» y se une al recargar.
--
-- CANDADO: antes de publicar, comprueba que la v1 de cada tipo es la que se escribió el 2026-10-01 (md5) y que no hay otra
-- versión 2 distinta ni una 3. Si algo no cuadra, aborta sin tocar nada.
-- Se pega SOLA en el SQL Editor, de una vez; se puede pegar dos veces. Un solo `alter` (club_textos, tabla en uso, con
-- `lock_timeout` de 3 s); sin políticas ni triggers.
-- Verificación:
--   select tipo, max(version) from retail.club_textos
--    where tipo in ('terminos','privacidad','casilla_publicidad','aviso_cumpleanos','aviso_novedades') group by tipo;  → 5 filas, 2
--   select nombre from retail.modulos where clave = 'clientas';                                                         → Clientes
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. Candado: la v1 es la del 2026-10-01 y no hay otra v2 ni una v3.
do $$
declare
  v record;
begin
  for v in select * from (values
    ('terminos', '2714f9c86dce0f278bab0698e50d5a60', 'de66042bd9bac0e936dd5c912b28de60'),
    ('privacidad', '3ba1c1601e7da564f57c7e8fddf75495', 'a01e7810b53677b95c12d8c0004148a4'),
    ('casilla_publicidad', '6116832f535e43d631567c9ebfab5781', '9901c53bcfff9e6ccb6e4b38c3dfbbd4'),
    ('aviso_cumpleanos', 'bcd8cfb421d21e4b74c39fde4ec12694', '1be33aede4565da7de9973e77926d8d5'),
    ('aviso_novedades', '064041c2787ed73b278db48504974de5', 'aaf59c2ec85732a41787f4a6be0010b4')
  ) e(tipo, md5_v1, md5_v2) loop
    if (select md5(t.texto) from retail.club_textos t where t.tipo = v.tipo and t.version = 1) is distinct from v.md5_v1 then
      raise exception 'El texto % versión 1 no es el del 2026-10-01: no se publica la versión 2 sobre otro texto.', v.tipo;
    end if;
    if exists (select 1 from retail.club_textos t where t.tipo = v.tipo and (t.version > 2 or (t.version = 2 and md5(t.texto) <> v.md5_v2))) then
      raise exception 'El texto % ya tiene otra versión 2 o una 3: revisa antes de pegar.', v.tipo;
    end if;
  end loop;
end $$;

-- 1. La casilla ya no tiene que decir «BAJA» (la baja la explican la Política y cada aviso).
alter table retail.club_textos drop constraint if exists club_textos_casilla_con_baja;

-- 2. Las versiones 2.
insert into retail.club_textos (tipo, version, texto, creado_por) values
  ('terminos', 2,
   $texto$1. **Quién puede ser miembro:** personas mayores de 18 años, con documento de identidad (DNI, carné de extranjería o pasaporte) y
   un celular con WhatsApp. Unirse es gratis.
2. **Código de miembro:** al unirte recibes un código personal (por ejemplo, C-0001). Para usar tus beneficios basta tu
   documento en caja.
3. **Cupón de cumpleaños:**
   - {pct} % de descuento sobre el total de una compra, en cualquier tienda CAYLA, durante el mes de tu cumpleaños según la
     fecha de nacimiento registrada.
   - Una vez por año calendario. Se aplica sobre el precio vigente, incluidas las prendas que ya estén en promoción.
   - Es personal y se usa con tu documento. No se canjea por dinero ni se acumula con otro cupón del Club.
   - Solo en compras presenciales en tiendas CAYLA. Requiere conexión del sistema en el momento del pago.
   - Si la compra se anula, el cupón vuelve a estar disponible. Si devuelves o cambias prendas, el cupón ya se considera usado.
4. **Vale de aniversario:**
   - Cada año como miembro se cuenta desde la fecha en que te uniste. Un año **cuenta** si en él hiciste al menos 6 compras o
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
   miembro (ver la Política de privacidad, punto 2.6).$texto$,
   null),
  ('privacidad', 2,
   $texto$### 2.1 Quién es responsable de tus datos

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

1. **Administrar tu membresía** (necesario para ser miembro): reconocerte en caja, ligar tus compras y comprobantes a tu ficha,
   y aplicar tus beneficios (cupón de cumpleaños y vale de aniversario).
2. **Enviarte por WhatsApp novedades, promociones y avisos de tus cupones**, elegidos según tus compras y tu talla. Solo con
   tu autorización expresa, y puedes retirarla en cualquier momento.
3. **Cumplir obligaciones legales:** emitir y conservar comprobantes de pago ante SUNAT.

No usamos tus datos para otras finalidades sin pedirte una nueva autorización.

### 2.4 Qué datos son obligatorios

Documento, nombre, celular y fecha de nacimiento son necesarios para ser miembro: sin ellos no podemos reconocerte ni aplicar
tus cupones. El correo es opcional. Si no quieres darlos, puedes seguir comprando en CAYLA como siempre.

### 2.5 Con quién se comparten

No vendemos ni cedemos tus datos. Para operar, los tratan por encargo de CAYLA y solo para estas finalidades:

- **Supabase Inc.** (base de datos) y **Vercel Inc.** (sitio web), con servidores en **São Paulo, Brasil**. Esto es una
  transferencia internacional de datos (flujo transfronterizo), que se hace con proveedores que aplican medidas de seguridad.
- **Meta Platforms (WhatsApp)**, por donde te llegan nuestros mensajes.
- **Consulta del padrón** (servicio de consulta de DNI, Perú), solo para obtener tu nombre a partir de tu DNI.
- **Lucode** (proveedor de servicios electrónicos) y **SUNAT**, para los comprobantes de pago, por obligación tributaria.

### 2.6 Cuánto tiempo los guardamos

Mientras seas miembro y compres en CAYLA. Si pasan **3 años desde tu última compra**, anonimizamos tu ficha de forma
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
sin costo y sin que tengas que explicar por qué. Sigues siendo miembro y puedes usar tus cupones y vales en tienda.

### 2.9 Seguridad

Tus datos viajan cifrados, solo los ve el personal de CAYLA que los necesita para atenderte, según su función, y queda
registro de quién los crea o modifica.

### 2.10 Menores de edad

El Club CAYLA es solo para mayores de 18 años. Si detectamos datos de un menor de edad, los eliminamos.

### 2.11 Cambios

Si cambiamos esta política, publicaremos la nueva versión con su fecha. Si el cambio afecta una finalidad que autorizaste, te
pediremos una nueva autorización.$texto$,
   null),
  ('casilla_publicidad', 2,
   $texto$Quiero recibir por WhatsApp novedades y promociones de CAYLA.$texto$,
   null),
  ('aviso_cumpleanos', 2,
   $texto$¡Feliz mes de cumpleaños, {nombre}! Como miembro del Club CAYLA tienes {pct} % de descuento en una compra este mes, en cualquier tienda CAYLA. Solo muestra tu documento en caja. Te esperamos en {tienda}. Si no quieres recibir más mensajes, responde BAJA.$texto$,
   null),
  ('aviso_novedades', 2,
   $texto$Hola {nombre}, llegaron prendas nuevas a {tienda}. Como miembro del Club CAYLA, te contamos primero: ven a verlas cuando quieras. Si no quieres recibir más mensajes, responde BAJA.$texto$,
   null)
on conflict (tipo, version) do nothing;

-- 3. El módulo, como lo ve el equipo.
update retail.modulos set nombre = 'Clientes', incluye = 'Registrar, editar y archivar clientes; ver sus compras'
 where clave = 'clientas';
update retail.modulos
   set incluye = replace(incluye, 'por mandar a las socias con WhatsApp', 'por mandar a los miembros con WhatsApp')
 where clave = 'avisos_club';

-- 4. Dos descripciones de «acciones sin responsable» (Configuración) que nombraban a «la clienta»; la web (`lib/responsable-omitido.ts`)
--    lleva el mismo texto, y `responsable-omitido.test.ts` exige que coincidan.
update retail.acciones_sin_responsable set descripcion = 'Apartar una prenda para un cliente (desde Existencias)' where clave = 'apartar_prenda';
update retail.acciones_sin_responsable set descripcion = 'Dejar el aviso o recordatorio al cliente de un apartado' where clave = 'aviso_apartado';

reset lock_timeout;
notify pgrst, 'reload schema';
