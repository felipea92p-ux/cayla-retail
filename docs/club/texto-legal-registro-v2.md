# Club CAYLA · textos de la página de registro (v2, 2026-10-02: sin género)

Versión 2 de los textos aprobados el 2026-10-01 (`texto-legal-registro-v1.md`, que queda como historia). Felipe, 2026-10-02
(ADR-0288 act. k): el club le habla igual a un cliente que a una clienta («socia» → «miembro», «clientas» → «clientes»), las
dos casillas largas se acortan y la letra chica bajo el botón ya no dice dónde se guardan los datos (lo dice la Política,
2.5). Cada texto entra a `retail.club_textos` con su versión (`20261002160000_club_textos_v2_sin_genero.sql`): la base guarda
qué versión aceptó cada miembro y a qué hora (prueba del consentimiento, art. 9 del reglamento de la Ley 29733).

**Marcas:** `{…}` lo completa el sistema: la tienda del cartel, el % de cumpleaños vigente, la escala de vales vigente
(«S/ 20 el primer año, S/ 30 el segundo…») y el código de miembro. Los datos de CAYLA S.A.C. salen de `apps/web/lib/emisor.ts`, los
mismos que van impresos en cada boleta.

**No es asesoría legal.** Está escrito contra la Ley 29733, su reglamento (DS 016-2024-JUS), el Código de Protección y
Defensa del Consumidor (Ley 29571) con la modificación de la Ley 32323, y lo investigado en
`docs/investigacion/2026-09-30-whatsapp-bot-y-consentimiento.md`. Una revisión de un abogado lo cerraría del todo (CL-34).

---

## 1. La página (lo que ve al escanear el cartel)

### Cabecera

**Club CAYLA**

Recibe un descuento en tu cumpleaños y un vale de compra por cada año en CAYLA. Si quieres, también te contamos primero lo nuevo y nuestras promociones por WhatsApp.

### Qué recibes

- **Cupón de cumpleaños:** {pct} % de descuento en una compra en cualquier tienda CAYLA durante el mes de tu cumpleaños.
- **Vale de aniversario:** al cumplir cada año como miembro, si en ese año hiciste 6 compras o sumaste S/ 600 en compras, recibes un vale para comprar lo que quieras en cualquier tienda CAYLA. El vale crece cada año: {escala}.
- **Novedades y promociones por WhatsApp** (opcional): lo nuevo que llega a CAYLA, rebajas, promociones y el aviso de tus cupones.

Las condiciones de cada beneficio están en los Términos del Club CAYLA (sección 3).

### Formulario

| Campo | Regla | Texto de ayuda |
|---|---|---|
| Tipo de documento | DNI por defecto; carné de extranjería o pasaporte | — |
| Número de documento | Obligatorio | «Lo usamos para reconocerte en caja y aplicar tus cupones.» |
| Confirmación (solo DNI) | «¿Eres {nombre a medias}?» · «Sí, soy yo» / «No, corregir» | «Lo tomamos del padrón público para que tu nombre quede bien escrito.» |
| Nombres y apellidos (carné o pasaporte) | Obligatorio | — |
| Celular con WhatsApp | Obligatorio, 9 dígitos que empiezan con 9 | «Aquí te llegarán nuestras novedades y tus cupones.» |
| Fecha de nacimiento | Obligatoria: día, mes y año | «Para tu cupón de cumpleaños.» |
| Correo electrónico | Opcional | «Opcional. Solo para contactarte si lo necesitamos.» |

### Casillas (ninguna viene marcada)

1. **Obligatoria:** ☐ Confirmo que soy mayor de 18 años.
2. **Obligatoria:** ☐ Acepto la Política de privacidad y los Términos del Club CAYLA.
3. **Opcional:** ☐ Quiero recibir por WhatsApp novedades y promociones de CAYLA. (Opcional.)

Las dos son breves a propósito (Felipe, 2026-10-02): para qué se usan los datos, quién es responsable, el envío según sus
compras y su talla, y cómo dejar de recibir mensajes (BAJA) están en la Política de privacidad que enlaza la casilla 2.

**Botón:** «Unirme al Club CAYLA» (se habilita cuando están las dos casillas obligatorias). Sin la casilla 3 es miembro igual, con sus beneficios en tienda y sin mensajes.

**Debajo del botón, en letra chica:** «CAYLA S.A.C. (RUC {ruc}) es la responsable de tus datos. Puedes acceder a ellos,
corregirlos, pedir que los borremos u oponerte a su uso en cualquier tienda CAYLA o en {email}.» (Dónde se guardan, Brasil,
lo dice la Política, 2.5.)

### Después de «Unirme»

**¡Te damos la bienvenida, {nombre}!** Ya eres miembro del Club CAYLA.

Tu código de miembro es **{código}**. Dilo en caja o muestra tu documento para usar tus cupones.

**Último paso: salúdanos por WhatsApp.** Así guardas nuestro número oficial y nuestros mensajes te llegan con los enlaces
activos. (Solo si marcó la casilla 3; si no la marcó, la página termina en su código.)

Botón: «Saludar a CAYLA por WhatsApp» → abre el WhatsApp de {tienda} con este mensaje, que envía ella:

> Hola CAYLA, soy {nombre}. Me acabo de unir al Club CAYLA ({código}) y quiero recibir sus novedades y promociones por este
> WhatsApp.

(Saludo versión 2, 2026-10-01, ADR-0288 act. j: Felipe quitó la frase final «Sé que me doy de baja escribiendo BAJA.». Cómo
darse de baja lo siguen diciendo la casilla 3 y la sección 2.8.)

### Si su documento ya era miembro

Mismo formulario. Al terminar: «Actualizamos tus datos. Eres miembro del Club CAYLA desde el {fecha de su primera inscripción}.»

### Mensajes de error (sin revelar datos de nadie)

- Documento que no está en el padrón: «No encontramos ese DNI. Revisa el número; si es correcto, acércate a caja y te
  ayudamos.»
- Demasiados intentos: «Hiciste varios intentos seguidos. Vuelve a intentarlo en una hora o acércate a caja.»
- Menor de 18 por la fecha: «El Club CAYLA es para mayores de 18 años.»

---

## 2. Política de privacidad del Club CAYLA

**Versión 2 · vigente desde el 2026-10-02**

### 2.1 Quién es responsable de tus datos

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
pediremos una nueva autorización.

---

## 3. Términos del Club CAYLA

**Versión 2 · vigente desde el 2026-10-02**

1. **Quién puede ser miembro:** personas mayores de 18 años, con documento de identidad (DNI, carné de extranjería o pasaporte) y
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
   miembro (ver la Política de privacidad, punto 2.6).

---

## Lo que falta para publicar

| Dato | Estado |
|---|---|
| Inscripción del banco de datos | **Listo:** PJ-2026-4550 (INS-2026-5132, 08/09/2026). |
| Casilla de WhatsApp | **Opcional** (Felipe, 2026-10-01): cierra el riesgo del art. 3.2. |
| Vale de aniversario | **Decidido** (Felipe, 2026-10-01): 6 compras o S/ 600 netos; se pausa; 60 días. Montos **propuestos** S/ 20 · 30 · 40 · 50 · 60 (año 5 en adelante), editables sin tocar código. |
| Plazo de conservación | **Decidido:** 3 años desde la última compra, con anonimización automática. |
| Aviso antes de cambiar o terminar el Club | **Propuesto:** 15 días. |
| Fecha de publicación | Al publicar. |
