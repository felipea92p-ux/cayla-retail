# Club CAYLA · textos de la página de registro (borrador v1, 2026-10-01)

Para aprobar por Felipe antes de publicar (ADR-0288, actualización (g), G-11). Una vez aprobados, cada texto entra a
`retail.club_textos` con su versión: la base guarda qué versión aceptó cada socia y a qué hora (prueba del consentimiento,
art. 9 del reglamento de la Ley 29733).

**Marcas:** `[PENDIENTE: …]` es un dato que falta y bloquea la publicación. `{…}` lo completa el sistema (la tienda del
cartel, el % de cumpleaños vigente, el código de socia). Los datos de CAYLA S.A.C. salen de `apps/web/lib/emisor.ts`, los
mismos que van impresos en cada boleta.

**No es asesoría legal.** Está escrito contra la Ley 29733, su reglamento (DS 016-2024-JUS), el Código de Protección y
Defensa del Consumidor (Ley 29571) con la modificación de la Ley 32323, y lo investigado en
`docs/investigacion/2026-09-30-whatsapp-bot-y-consentimiento.md`. Una revisión de un abogado lo cerraría del todo (CL-34).

---

## 1. La página (lo que ella ve al escanear el cartel)

### Cabecera

**Club CAYLA**

Entérate primero de lo nuevo y de nuestras promociones, y recibe un regalo por tu cumpleaños y por cada año con nosotras.

### Qué recibes

- **Novedades y promociones por WhatsApp:** lo nuevo que llega a CAYLA, rebajas y promociones, al número que registres.
- **Cupón de cumpleaños:** {pct} % de descuento en una compra en cualquier tienda CAYLA durante el mes de tu cumpleaños.
- **Beneficio de aniversario:** por cada año como socia en el que hayas comprado en CAYLA, [PENDIENTE: qué recibe].
- **Te avisamos por WhatsApp** cuando tengas un cupón listo para usar.

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
2. **Obligatoria:** ☐ He leído la Política de privacidad y los Términos del Club CAYLA, y acepto que CAYLA S.A.C. use mis
   datos para administrar mi membresía y mis beneficios.
3. [PENDIENTE: obligatoria u opcional, decisión de Felipe sobre el riesgo del art. 3.2] ☐ Acepto que CAYLA S.A.C. me envíe
   por WhatsApp, al número que registro, novedades, promociones y avisos de mis cupones, elegidos según mis compras y mi
   talla. Puedo dejar de recibirlos cuando quiera escribiendo BAJA al WhatsApp de cualquier tienda CAYLA.

**Botón:** «Unirme al Club CAYLA» (se habilita cuando están las casillas obligatorias).

**Debajo del botón, en letra chica:** «CAYLA S.A.C. (RUC {ruc}) es la responsable de tus datos. Se guardan en servidores en
Brasil. Puedes acceder a ellos, corregirlos, pedir que los borremos u oponerte a su uso en cualquier tienda CAYLA o en
{email}.»

### Después de «Unirme»

**¡Bienvenida al Club CAYLA, {nombre}!**

Tu código de socia es **{código}**. Dilo en caja o muestra tu documento para usar tus cupones.

**Último paso: salúdanos por WhatsApp.** Así guardas nuestro número oficial y nuestros mensajes te llegan con los enlaces
activos.

Botón: «Saludar a CAYLA por WhatsApp» → abre el WhatsApp de {tienda} con este mensaje, que envía ella:

> Hola CAYLA, soy {nombre}. Me acabo de unir al Club CAYLA ({código}) y quiero recibir sus novedades y promociones por este
> WhatsApp.

### Si su documento ya era socia

Mismo formulario. Al terminar: «Actualizamos tus datos. Eres socia del Club CAYLA desde el {fecha de su primera inscripción}.»

### Mensajes de error (sin revelar datos de nadie)

- Documento que no está en el padrón: «No encontramos ese DNI. Revisa el número; si es correcto, acércate a caja y te
  ayudamos.»
- Demasiados intentos: «Hiciste varios intentos seguidos. Vuelve a intentarlo en una hora o acércate a caja.»
- Menor de 18 por la fecha: «El Club CAYLA es para mayores de 18 años.»

---

## 2. Política de privacidad del Club CAYLA

**Versión 1 · vigente desde [PENDIENTE: fecha de publicación]**

### 2.1 Quién es responsable de tus datos

CAYLA S.A.C., RUC 20605964550, con domicilio en Mz. Q Lt. 26, Urb. San Andrés V Etapa, Víctor Larco Herrera, Trujillo, La
Libertad, Perú. Correo: caylaperu@gmail.com.

Tus datos forman parte del banco de datos personales «Clientes», inscrito en el Registro Nacional de Protección de Datos
Personales con el código [PENDIENTE: código de inscripción ante la Autoridad Nacional de Protección de Datos Personales].

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
   y aplicar tus beneficios (cupón de cumpleaños y beneficio de aniversario).
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

Mientras seas socia y hasta [PENDIENTE: plazo] desde tu última compra. Si pides la cancelación, anonimizamos tu ficha: tu
nombre, documento, celular, fecha de nacimiento y correo dejan de estar asociados a tus compras. Los comprobantes de pago se
conservan el tiempo que exige la ley tributaria.

### 2.7 Tus derechos

Puedes **acceder** a tus datos, **rectificarlos**, pedir su **cancelación**, **oponerte** a su uso y **revocar** tus
autorizaciones, de forma gratuita:

- en cualquier tienda CAYLA, con tu documento, o
- escribiendo a caylaperu@gmail.com desde el correo o el celular que registraste.

Te respondemos dentro de los plazos de la Ley 29733 y su reglamento. Si no estás conforme con la respuesta, puedes acudir a la
Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.

### 2.8 Dejar de recibir WhatsApp

Escribe **BAJA** al WhatsApp de cualquier tienda CAYLA. Dejamos de enviarte mensajes desde ese momento, en todas las tiendas,
sin costo y sin que tengas que explicar por qué. Sigues siendo socia y puedes usar tus cupones en tienda.

### 2.9 Seguridad

Tus datos viajan cifrados, solo los ve el personal de CAYLA que los necesita para atenderte, según su función, y queda
registro de quién los crea o modifica.

### 2.10 Menores de edad

El Club CAYLA es solo para mayores de 18 años. Si detectamos datos de una menor, los eliminamos.

### 2.11 Cambios

Si cambiamos esta política, publicaremos la nueva versión con su fecha. Si el cambio afecta una finalidad que autorizaste, te
pediremos una nueva autorización.

---

## 3. Términos del Club CAYLA

**Versión 1 · vigente desde [PENDIENTE: fecha de publicación]**

1. **Quién puede ser socia:** personas mayores de 18 años, con documento de identidad (DNI, carné de extranjería o pasaporte) y
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
4. **Beneficio de aniversario:** por cada año cumplido como socia en el que hayas hecho al menos una compra en CAYLA,
   [PENDIENTE: qué recibe y cómo se usa].
5. **Avisos:** te avisamos por WhatsApp cuando tengas un cupón disponible, si autorizaste los mensajes. Si no recibes el aviso,
   el cupón igual está disponible en caja.
6. **Cambios y fin del programa:** CAYLA puede cambiar los beneficios o terminar el Club avisando con [PENDIENTE: días] días de
   anticipación por WhatsApp o en tienda. Los cupones ya disponibles se respetan hasta su vencimiento.
7. **Baja del Club:** puedes darte de baja cuando quieras en cualquier tienda CAYLA o en caylaperu@gmail.com.

---

## Lo que falta para publicar

| Dato | Quién | Por qué bloquea |
|---|---|---|
| Código de inscripción del banco de datos «Clientes» | Felipe | La Ley 29733 exige inscribirlo; sin código, la política afirmaría algo falso. El trámite es gratuito y en línea. |
| Casilla de WhatsApp: obligatoria u opcional | Felipe | Riesgo del art. 3.2 del reglamento (ADR-0288, actualización (g)). |
| Qué da el beneficio de aniversario | Felipe | El Código del Consumidor pide condiciones claras: no se publica un beneficio sin decir cuál es. |
| Plazo de conservación | Felipe | La ley exige informarlo. |
| Días de aviso antes de cambiar o terminar el Club | Felipe | Condición del programa. |
| Fecha de publicación | Al publicar | — |
