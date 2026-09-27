# DECISIONES — ronda de 20 preguntas: Clientas y fidelización (2026-09-26)

**Quién decide:** Felipe, en 5 tandas de 4 preguntas (`AskUserQuestion`, opción
recomendada primero, con Ganas/Pagas), en la sesión de la rama
`claude/customer-loyalty-module-d94594`. Continúa la numeración de
[`DECISIONES-2026-09-21-menu-comercial.md`](DECISIONES-2026-09-21-menu-comercial.md)
(hasta D-91). Afina lo que allá quedó para después —D-48, D-76, D-77—; **si hay
contradicción, mandan las actas del 2026-09-12 y del 2026-09-21**, y por eso las dos
correcciones de la sección F esperan un «sí» explícito.

**Por qué esta ronda:** Felipe pidió «crear un módulo que se llame clientes» para la
fidelización, ideas de qué podría llevar y 20 preguntas para saber hacia dónde apunta.

**Punto de partida** (verificado el 2026-09-26 contra el código y, en solo lectura,
contra producción):

- El módulo ya existe: clave `clientas` en `apps/web/lib/modulos.ts` (grupo Ventas) y
  tabla `retail.clientas` en producción (ADR-0154). Pero `/clientas` es una pantalla
  mínima de verificación, `apps/web/lib/menu.ts` lo marca `estado: "futura"`, no hay
  función para editar una ficha y el Punto de venta no pide a la clienta.
- Producción: `retail.clientas` con **0 filas**; `pedidos_no_atendidos` y
  `separaciones`, 0. Ventas reales (sin `es_prueba`): **7, todas de Tienda TRU (24 y 25
  de setiembre), 0 con `cliente_id`**. Comprobantes: 4 boletas, las 4 con DNI escrito en
  `cliente_num_doc`, y 5 notas de venta sin documento; ninguno ligado a una ficha.

## El rumbo en un párrafo

«Clientas» es el club de CAYLA: la clienta se identifica en caja con su DNI o su
celular, la tienda la recuerda (talla, cumpleaños, lo que compró) y le escribe desde el
WhatsApp de la tienda solo cuando tiene algo que le sirve. Sin puntos, sin saldo y sin
niveles; un solo beneficio con costo —el de cumpleaños— dentro del 2%. Se mide por
cuántas clientas identificadas vuelven a comprar dentro de 90 días.

---

## A. Rumbo (tanda 1)

**D-92 · Nombre y lugar** → **crecer «Clientas»**: el módulo y la tabla que ya existen,
como grupo propio del menú (fichas, avisos, análisis). No se crea un módulo «Clientes»
aparte: serían dos lugares para la misma clienta, justo lo que ADR-0154 limpió al
retirar `retail.clientes`.

**D-93 · Objetivo de los próximos 3 meses** → **los cuatro**: saber quién compra, que
vuelvan más seguido, cuidar a las mejores y recuperar a las que se fueron. El orden lo
fija el dato, no la preferencia: sin clienta identificada no hay a quién avisar, cuidar
ni recuperar.

**D-94 · Mecánica** → **sigue D-77: la versión 1 no tiene puntos**, ni saldo, ni
niveles. El saldo o vale de PL-28 sigue su propio camino (BACKLOG) y no entra en esta
versión.

**D-95 · Presupuesto** → **hasta ~2% de lo que compran las clientas identificadas.** Se
aparta de R-33 («todos sin costo de margen»): alcanza para **un** beneficio con costo,
el de cumpleaños (D-102).

## B. Cómo funciona hoy (tanda 2) — datos duros de Felipe

**D-96 · Cómo se habla hoy con la clienta** → por el **WhatsApp de la tienda** y por
**Instagram/Facebook** de la marca; y muchas veces **no se habla**. Las asesoras **no**
usan su WhatsApp personal: la conversación ya es de la tienda, no de la persona.

**D-97 · Clientas anotadas fuera del ERP** → solo **contactos guardados en celulares**.

**D-98 · Ventas que empiezan por redes** → **casi nada (menos de 5%).** Afina R-42: la
clienta se identifica en el mostrador o no se identifica.

**D-99 · Con qué se identifica** → **DNI o celular.** Sin carné de extranjería ni
pasaporte: no vuelve el «tipo de documento» que D-76 y ADR-0154 dejaron fuera; la
clienta extranjera entra por su celular. Consecuencia: puede haber dos fichas de la
misma clienta (primero con celular, después con DNI), y hace falta poder **unirlas**.

## C. La ficha y el programa (tanda 3)

**D-100 · El programa** → **con nombre y sin enlace**: un nombre simple (de trabajo,
«Club CAYLA»; el definitivo lo pone Felipe) que la asesora ofrece en caja, sin página
ni enlace propio para la clienta.

**D-101 · La talla** → **deducida de lo que compra, por tipo de prenda** (blusa S,
pantalón 28), con un toque opcional en caja **«es para regalo»** que la saca del
cálculo.

**D-102 · Cumpleaños** → **descuento en una compra durante su mes**, una vez al año y
atado a su ficha. Propuesta: 10%, a contrastar con el 2% de D-95 apenas haya ventas
reales.

**D-103 · Clienta frecuente** → **regla fija y explicable**, que la clienta y la asesora
entiendan («te falta una compra»). Propuesta: 3 compras en 6 meses, ajustable cuando
haya datos.

## D. Avisos y WhatsApp (tanda 4)

**D-104 · «Llegó tu talla»** → **se le avisa y ella responde si quiere que se la
reserven**; si dice que sí, la asesora la reserva (la reserva de Existencias, ADR-0141).
Nada se aparta sin que la clienta lo pida. Es respuesta propia de Felipe, distinta de la
recomendada (reserva automática de 48 h).

**D-105 · Avisos de la versión 1** → además de «llegó tu talla» y el cumpleaños:
**novedades para frecuentes**, **te extrañamos** y **rebaja en su talla**. Queda fuera
«gracias + encuesta» (la encuesta de D-78 sigue por su lado).

**D-106 · Canal** → **un botón que arma el mensaje**: la asesora toca «Avisar», se abre
el WhatsApp de la tienda con el texto listo y ella lo envía. Sin WhatsApp Business API
por ahora.

**D-107 · Contactos de los celulares** → **no se cargan.** Cada clienta se registra
cuando vuelve a la tienda, con su permiso ahí mismo.

## E. Permiso, privacidad y cierre (tanda 5)

**D-108 · Constancia del permiso de WhatsApp** → **la clienta responde «SÍ» al primer
mensaje**, y solo entonces cuenta el permiso. Felipe eligió la prueba más sólida, no la
recomendada (marcar en caja + bienvenida).

**D-109 · Quién ve a las clientas** → **todas las cuentas que tienen el módulo ven a
todas las clientas.** Felipe se apartó de la recomendada («buscar sí, listar no»).

**D-110 · Cómo se mide el éxito a 6 meses** → **% de clientas identificadas que vuelven
a comprar dentro de 90 días.**

**D-111 · Fecha** → **sin fecha: «cuando esté listo».** Felipe no eligió llegar antes de
diciembre.

---

## F. Correcciones a actas anteriores — asumidas, esperan el «sí» de Felipe

Se anunciaron como supuestos al empezar la ronda y no hubo objeción, pero corrigen actas
que mandan sobre esta; no se aplican hasta un «sí» explícito.

1. **D-77 contra R-32: «ajuste de taller».** R-32 (`15-COMO-OPERA-CAYLA.md`) descartó el
   Taller como beneficio: está en Lima y ~80% de las ventas son de TRU y AQP. D-77 lo
   volvió a listar. Supuesto: **queda fuera.**
2. **D-66 contra D-76: ranking por identificar.** D-76: «nunca se paga ni se rankea por
   identificar (induce DNI inventados)». D-66 puso «clientas nuevas identificadas» como
   categoría del top 3. Supuesto: **esa categoría sale y queda «clientas que vuelven».**

## G. Propuestas del arquitecto — si Felipe no responde, se construye así

1. **«Llegó tu talla» no espera el «SÍ» general.** Que la clienta pida su talla en la
   tienda es el permiso para ESE aviso. Si el mensaje suma cualquier promoción, vuelve a
   ser publicidad y necesita el «SÍ».
2. **El permiso como historial, no como una fecha.** Cada paso —se le pidió, respondió
   «SÍ», se dio de baja— se guarda con quién lo registró y cuándo, y no se edita, igual
   que el stock sale de `movimientos`. La columna `whatsapp_consentimiento_en` de hoy pasa
   a ser la foto que se deriva de ese historial.
3. **«Rebaja en su talla» solo a quien ya compra en rebaja.** Nunca a la que paga precio
   pleno: le enseña a esperar la rebaja —el mismo motivo por el que ADR-0208 descartó la
   rebaja automática— y baja el % a precio pleno que mide D-63.
4. **Dos candados sobre D-109:** exportar la lista, solo Admin; y queda registrado quién
   abre la lista completa. La Ley 29733 pide proteger la base, no solo pedir el permiso.
5. **Grupo testigo.** En «te extrañamos», «novedades» y «rebaja», 1 de cada 5 clientas
   elegibles, al azar y anotada, no recibe el aviso; D-110 se mide comparando las que lo
   recibieron con las que no. Nunca en «llegó tu talla» ni en el cumpleaños: son promesas
   del club. Sin esto, D-110 sale alto aunque el club no haga nada, porque las que dan su
   DNI ya son las que más vuelven.
6. **El DNI de la boleta no crea ficha: la crea el «sí» al club.** Al unirse, sus boletas
   anteriores con ese DNI se ligan a su ficha. Es coherente con D-107: nada entra sin
   permiso.
7. **Topes por defecto:** como máximo 2 avisos promocionales al mes por clienta («llegó tu
   talla» no cuenta); «te extrañamos» a los 90 días sin comprar para una frecuente y a los
   180 para las demás.

## H. Cómo se construye — pasos verificables, en este orden

| Paso | Qué | Cómo lo verifica Felipe |
|---|---|---|
| 1 · Caja | Campo «DNI o celular», la pregunta del club y «es para regalo» en el Punto de venta; la venta queda ligada a la ficha | Hace una venta de prueba y la ve en la ficha de esa clienta |
| 2 · Ficha y lista | `/clientas` de verdad, como grupo propio del menú: buscar, talla deducida, cumpleaños, compras, cambios y devoluciones, «te falta N para frecuente», editar, unir fichas, anonimizar a pedido | Busca por DNI y por celular; une dos fichas de prueba |
| 3 · Permiso y avisos | Bienvenida con «responde SÍ», bandeja del día de cada tienda con el botón «Avisar», los cinco avisos, el grupo testigo y el registro de lo enviado | Toca «Avisar» y se abre WhatsApp con el texto listo; una clienta sin «SÍ» no aparece en avisos promocionales |
| 4 · Medir | % identificadas por sede (sin rankear personas), vuelven en 90 días contra el grupo testigo, y cada cuánto vuelve la clienta (el dato que ADR-0208 necesita) | Los números cuadran con una consulta de solo lectura |

Todo módulo nuevo nace visible solo para el líder y entra a Roles y accesos en el mismo
PR (ADR-0161).

**Lo que exigirá al modelo de datos** (se decide en el ADR del paso que lo necesite): el
historial del permiso (G.2); el registro de avisos con su estado y su grupo (G.5); «es
para regalo» por prenda vendida (D-101); la FK de `pedidos_no_atendidos.clienta_id`, que
en producción sigue sin ella (verificado el 2026-09-26); y «frecuente» calculada al leer,
nunca guardada a mano. **Estados que el esquema debe hacer imposibles:** un aviso
promocional a quien no respondió «SÍ»; dos descuentos de cumpleaños para la misma clienta
en el mismo año; un aviso «enviado» sin quién lo envió; dos fichas con el mismo DNI (este
ya lo impide `clientas_dni_unico`).

**Las tres preguntas antes de dar un paso por terminado:**
- *Concurrencia:* dos asesoras registran a la misma clienta a la vez → con DNI lo frena el
  índice único; con celular no, y por eso existe «unir fichas».
- *Caída externa:* si WhatsApp no abre, el aviso sigue pendiente y no se pierde; si la
  consulta de padrón (ADR-0008) no responde, el nombre se escribe a mano y la venta sigue.
- *Persona sin contexto:* la asesora hace una pregunta y escribe un número; la clienta
  responde «SÍ» desde su celular.
