# DECISIONES — segunda ronda del Club de clientas: datos, caja, beneficios y avisos (2026-09-29)

**Quién decide:** Felipe, en 7 tandas (26 preguntas, `AskUserQuestion`, opción recomendada primero con
Ganas/Pagas), en la rama `claude/club-clientas-definition-5ae110`. **Continúa**
[`DECISIONES-2026-09-26-clientas.md`](DECISIONES-2026-09-26-clientas.md) (D-92 a D-111). Numeración propia
`CL-n` para no chocar con otras actas que se escriben en paralelo (ver memoria «renumerar sin pisar»).
**Si esta acta contradice a la del 2026-09-26, manda esta**: Felipe corrigió a sabiendas (se marca
«CORRIGE D-xx»). Las actas del 2026-09-12 y 2026-09-21 siguen mandando en lo que esta no toca.

**Por qué esta ronda:** Felipe pidió, antes de construir el paso 1 (Caja) y el paso 3 (avisos), definir
qué datos registrar de la clienta, qué hace la pantalla de Cobrar con el club, cómo se coordina con los
demás módulos y cómo impacta en la gestión comercial; con una investigación de cómo lo hacen Ralph Lauren,
LVMH, Zara y similares ([`docs/investigacion/2026-09-29-club-de-clientas-referentes.md`](../investigacion/2026-09-29-club-de-clientas-referentes.md)).

**Punto de partida** (2026-09-29): paso 2 del acta anterior (ficha `/clientas`, ADR-0249) en producción;
paso 1 (Caja liga la venta + pregunta del club) **sin construir** — lo de la captura de Cobrar es el spike
`docs/maquetas/punto-venta-spike-2026-09/`; pasos 3 (avisos) y 4 (medir), sin construir.

## El rumbo, actualizado en un párrafo

El club de CAYLA sigue **sin puntos, sin saldo y sin niveles de gasto**. La clienta entra en caja (o sin
comprar) con **documento + celular**; el nombre lo trae el padrón. La tienda la recuerda por lo que compra
y por lo que buscó y no encontró, y le escribe por el WhatsApp de la tienda solo cuando tiene algo que le
sirve. Los beneficios son **de acceso y de experiencia** (preventa, eventos, ticket sin papel) más dos
fechas suyas: su **cumpleaños** (el único descuento) y su **aniversario en el club** (regalos que crecen con
los años en que compró). Se mide por cuántas identificadas vuelven en 90 días, contra un grupo testigo.

---

## A. Datos de la clienta (tandas 1–2)

**CL-1 · Mínimo para ser del club** → **documento + celular + nombre**. Al escribir el DNI, el nombre llega
del padrón (ADR-0008, hoy SUNAT público primero y proveedor de pago después, PR #628); **si la consulta no
responde, la asesora lo escribe a mano y la venta sigue** (principio 9). **CORRIGE D-99** («DNI *o*
celular»): para el club el celular es obligatorio, porque el club son avisos. Una venta puede seguir
ligándose a una ficha sin celular (compra identificada), pero esa ficha **no es socia**.

**CL-2 · Tipo de documento** → **en ventas y en la ficha se elige el tipo de documento: DNI por defecto,
carné de extranjería o pasaporte**. La extranjera entra con su documento. **CORRIGE D-76, D-99 y
ADR-0154**, que habían sacado el «tipo de documento». Solo el DNI se autocompleta con el padrón; carné y
pasaporte, nombre a mano. *Lo que exige al modelo* (lo decide el ADR del paso 1): `clientas.tipo_documento`
y el único parcial pasa de `(dni)` a `(tipo_documento, numero_documento)`; `comprobantes.cliente_tipo_doc`
hoy solo acepta `dni | ruc | sin_documento` y **necesita `carne_extranjeria` y `pasaporte`** (catálogo 06
de SUNAT: 4 y 7) — cambio de esquema en producción que toca facturación electrónica: **se confirma con
Felipe antes de pegarlo** (regla de CLAUDE.md sobre comprobantes).

**CL-3 · Cumpleaños** → **día y mes como mínimo; el año, opcional**. No es obligatorio para entrar al club,
pero la asesora lo pide al invitar: sin él no hay beneficio de cumpleaños. *(Criterio de Nordstrom: se pide
solo para ese beneficio.)*

**CL-4 · Correo** → **opcional, solo si la clienta pide la boleta por correo**. Sin campañas por correo en
la versión 1.

**CL-5 · Preferencias** → **lo que compra + 3 etiquetas de lista en la ficha** (no en caja): **OCASIÓN**
(trabajo · evento · día a día), **ESTILO** (clásico · tendencia · relajado) y **EVITA** (un color o una
tela). Sin nota libre: no se puede filtrar y ahí se cuelan datos sensibles (salud, embarazo, peso), que la
Ley 29733 protege aparte. *Pendiente de Felipe:* los valores finales de cada lista.

**CL-6 · «Su sede»** → **la sede donde más compró en los últimos 12 meses**, calculada al leer (nunca
guardada a mano). Es la que ve sus avisos en la bandeja del día.

**CL-7 · Registrar sin compra y señales de lo que hizo** → la clienta **se puede registrar sin una venta**
(vino, preguntó, se probó). Y se capturan dos señales, **dentro de una venta o en una atención sin venta**:
**«buscó y no había su talla»** (ya existe: `pedidos_no_atendidos`) y **«se probó y no llevó»** (nueva).
«Es para regalo» sigue como D-101. «Cómo nos conoció» no se pregunta.

## B. La pantalla de Cobrar (tanda 3)

**CL-8 · Invitar al club** → se ofrece **en cada compra** mientras no sea socia; «Ahora no» solo la calla en
esa venta. Es válido porque es **en persona**: el límite del reglamento de la Ley 29733 apunta a contactos
por llamada o mensaje. **Nunca** se invita por WhatsApp a quien no respondió «SÍ».

**CL-9 · Si ya es socia** → **una tarjeta con lo útil ahora**: nombre, «Frecuente» o «te falta N compra(s)»,
su talla por tipo de prenda, «cumple este mes: 10% disponible», «aniversario: tiene regalo» y «pidió X y ya
llegó». Es el *clienteling* de LVMH y Ralph Lauren, dentro del flujo de cobro.

**CL-10 · Cumpleaños en caja** → **aparece un botón y la asesora lo toca**; se canjea **solo durante su mes
de cumpleaños** y **una vez al año** (la base hace imposible el segundo canje: candado, no validación).

**CL-11 · Cómo se calcula** → el 10% se aplica **a toda la compra, en cascada sobre el precio ya rebajado**:
una prenda al 20% queda en 0,8 × 0,9 = **28%**, nunca 30%. **Riesgo anotado:** al aplicarse a toda la compra
y sobre rebajas, es lo que más acerca al tope del 2% (D-95); el paso 4 lo mide por mes para que Felipe lo
ajuste con datos.

## C. Coordinación con los demás módulos (tanda 4)

**CL-12 · «Llegó tu talla»** → cuando la talla pedida entra por **Recibir, Traslados o Producción**, el
aviso cae en **la bandeja de la sede donde la pidió**. Si llegó a otra sede, el aviso ofrece pedirla por
traslado (ADR-0233).

**CL-13 · Dónde se ve el club** → **una pestaña «Resumen» dentro de Clientas es el único dueño de las
cifras** (junto a «Fichas» y «Avisos», D-92); **Inicio de cada sede muestra una píldora** que lleva ahí. Las
dos leen la misma función (`lib/clientas-resumen-reglas.ts` + una RPC `resumen_club`), así que el número
nunca difiere. **Sin ranking de personas.** Resuelve la **corrección F.2** del acta anterior: «clientas
nuevas identificadas» sale del top 3 y queda «clientas que vuelven».

**CL-14 · Demanda para Compras y Taller** → sí: **«Tallas y prendas que faltaron»** en Análisis, por
modelo, talla y sede, alimentado por «buscó y no había» y «se probó y no llevó».

## D. Beneficios (tandas 4–6)

**CL-15 · Beneficios de la versión 1** (además del cumpleaños):
1. **Ticket y cambios sin papel** (sin costo): boleta por WhatsApp al celular de la ficha como opción por
   defecto; **cambio o devolución sin boleta** buscando por su documento; **apartado ligado a su ficha**.
2. **Preventa exclusiva** (sin costo): ve y aparta la colección nueva **48 h antes** de salir a piso.
3. **Eventos por invitación** (costo bajo y fijo): tarde de colección con aforo y confirmación desde el ERP.

**Fuera:** promo o descuento por monto, o «precio de socia». Compite con el cumpleaños por el 2% y enseña a
esperar el descuento.

**CL-16 · Frecuente** (3 compras en 6 meses, D-103) → gana **acceso primero**: la preventa y los eventos le
llegan antes, o solo a ella.

**CL-17 · Aniversario en el club** *(idea de Felipe, pulida)* → premia la **permanencia activa**:
- Un **año activo** es un año de membresía con **al menos 3 compras**. Si un año no llega, **el contador se
  pausa: no avanza, pero tampoco se pierde**.
- El premio son **regalos y experiencias que crecen**, nunca un % que crece: costo fijo, no compite con el
  cumpleaños ni con el 2%. Escalera propuesta:
  - año 1: mensaje personal + preventa;
  - año 2: accesorio de regalo en su siguiente compra;
  - año 3: invitación con acompañante al evento de colección;
  - año 5: pieza de edición limitada o su nombre bordado en una prenda.
- *Pendiente de Felipe:* el catálogo definitivo de premios por año y si el regalo sale del stock de la sede
  (entonces es un `movimiento` con motivo propio, principio 4).

**CL-18 · Taller como beneficio** → **fuera por ahora** (confirma R-32; resuelve la **corrección F.1**). Se
reabre si algún día hay costurera en cada sede.

## E. Permiso y avisos (tandas 6–7)

**CL-19 · «Llegó tu talla» sin el «SÍ» general** → **sí, si ella pidió esa talla** (aprueba G.1). El texto
va fijo y sin promoción; si suma una promoción, necesita el «SÍ».

**CL-20 · Grupo testigo** → **sí** (aprueba G.5): 1 de cada 5 clientas elegibles, al azar y anotada, no
recibe «Te extrañamos», «Novedades» ni «Rebaja». Nunca aplica a «Llegó tu talla», al cumpleaños ni al
aniversario: son promesas del club.

**CL-21 · Tope** → **máximo 2 avisos promocionales al mes** por clienta (aprueba G.7). «Llegó tu talla»,
cumpleaños y aniversario no cuentan.

**CL-22 · «Te extrañamos»** → a los **90 días** sin comprar para una frecuente y a los **180** para las demás
(aprueba G.7).

**CL-23 · «Rebaja en su talla»** → **a todas las del club** (**rechaza G.3**). *Riesgo anotado por el
arquitecto:* enseña a esperar la rebaja a quien hoy paga precio pleno. El paso 4 mide el % de compras a
precio pleno de las socias antes y después, para que Felipe lo revise con datos.

**CL-24 · Banco de datos ante la ANPD** → **ya está inscrito** (Felipe, 2026-09-29). Falta que el ERP guarde
**el texto del consentimiento con versión** y la historia del permiso (G.2).

---

## F. Decididas por el arquitecto (técnicas o legales; Felipe puede revertirlas)

- **CL-25 · Compra neta.** Para «frecuente», «año activo» y «Te extrañamos» cuenta la compra **neta**: una
  venta devuelta completa no cuenta; un cambio sí. Se calcula al leer, nunca se guarda.
- **CL-26 · El permiso es historia, no una fecha** (G.2). Cada paso (se le pidió, respondió «SÍ», se dio de
  baja) se guarda con quién, cuándo, en qué sede y **qué versión del texto** vio. No se edita, igual que
  `movimientos`. `whatsapp_consentimiento_en` pasa a ser la foto que se deriva de esa historia.
- **CL-27 · El documento de la boleta no crea ficha** (G.6). La ficha la crea el registro. Al registrarse,
  sus boletas anteriores con ese documento se ligan a su ficha. Usar el padrón para la boleta es una
  finalidad distinta del marketing.
- **CL-28 · Exportar la lista, solo Admin**, y queda registrado quién abre la lista completa (G.4). La Ley
  29733 pide proteger la base, no solo pedir el permiso.

## G. Lo que queda abierto (de Felipe)

1. Nombre definitivo del club (D-100; de trabajo, «Club CAYLA»).
2. Valores de las 3 listas de etiquetas (CL-5).
3. Catálogo de premios por año de aniversario (CL-17) y de dónde sale el regalo.
4. Calendario de preventas y eventos: sin él, CL-15 y CL-16 son promesas vacías.
5. Confirmar el 10% de cumpleaños cuando haya 2 meses de ventas identificadas (CL-11).
6. Texto del consentimiento (v1) que ve la clienta en caja.
7. Ajustar el cambio de esquema de comprobantes para carné y pasaporte (CL-2): toca SUNAT y se confirma
   antes de pegarlo.

## H. Cómo se construye: el plan del acta anterior, ajustado

| Paso | Qué | Cómo lo verifica Felipe |
|---|---|---|
| **1 · Caja** | Tipo de documento (DNI por defecto) + padrón con respaldo a mano; «Invitar» con celular, cumpleaños y el texto del consentimiento versionado; tarjeta de socia (CL-9); botón de cumpleaños con candado anual; «es para regalo», «se probó y no llevó» y registro sin venta; boletas anteriores que se ligan (CL-27) | Registra una clienta con DNI y otra con carné; vende a una socia en su mes, toca el 10% y no puede tocarlo otra vez |
| **2 · Ficha** ✅ | Ya en producción (ADR-0249). Se suman las 3 etiquetas, «su sede», «año activo N» y la historia del permiso | Ve la historia del permiso y las etiquetas en la ficha |
| **3 · Avisos** | Bandeja del día por sede; los cinco avisos + cumpleaños + aniversario; «Llegó tu talla» desde Recibir, Traslados y Producción; grupo testigo; tope de 2 al mes; registro de lo enviado | Toca «Avisar» y se abre WhatsApp con el texto; una clienta sin «SÍ» no aparece en los promocionales |
| **4 · Medir** | Pestaña «Resumen» + píldora en Inicio; vuelven en 90 días contra el testigo; costo del cumpleaños sobre el 2%; % a precio pleno de socias (CL-23); «Tallas y prendas que faltaron» en Análisis | Las cifras cuadran con una consulta de solo lectura |
| **5 · Beneficios de acceso** | Preventa de 48 h (una colección marcada «preventa» solo visible y apartable para socias), eventos con aforo y confirmación, aniversario con su catálogo | Crea un evento, invita a las frecuentes y ve quién confirmó |

**Estados que el esquema debe hacer imposibles** (se suman a los del acta anterior):
- Dos canjes de cumpleaños en el mismo año.
- Un canje de cumpleaños fuera de su mes.
- Dos fichas con el mismo `(tipo_documento, número)`.
- Un aviso promocional que pase el tope del mes.
- Un premio de aniversario entregado dos veces en el mismo año.
- Un permiso «SÍ» sin la versión del texto.

**Las tres preguntas antes de dar un paso por terminado:**
- *Concurrencia:* dos cajas registran a la misma clienta a la vez. El único por documento frena la segunda,
  y si solo había celular, se unen las fichas. Dos cajas canjean su cumpleaños a la vez: el candado deja
  pasar una sola.
- *Caída externa:* si el padrón no responde, el nombre se escribe a mano; si WhatsApp no abre, el aviso
  queda pendiente y no se pierde.
- *Persona sin contexto:* la asesora hace una pregunta, escribe dos números y toca un botón; la clienta
  responde «SÍ» desde su celular.
