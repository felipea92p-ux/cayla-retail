# ADR-0701 — Tickets compartidos: del piso a la caja (ADR-0511, paso 2)

**Estado:** aceptada y construida en la rama `claude/tickets-compartidos-0511` (5 actividades, cada una con su commit). La migración
`20261124172000_tickets_compartidos.sql` **está en producción desde el 2026-11-24** (la pegó Felipe; el check «SQL pegado» la comprobó).
**Fecha:** 2026-11-24 · **Decidió:** Felipe («Sí, constrúyelo», con la lista de 6 actividades aprobada el mismo día) ·
**Sigue a:** ADR-0511 (varios clientes a la vez, paso 1), ADR-0161 (quién atiende), ADR-0195 (SQL por partes), ADR-0389 (guías)

## Contexto

En la Tienda TRU el cobro es el cuello de botella de los sábados. Los datos de producción (6 sábados): en la hora pico entran 10 ventas
por hora, y en 65 de 206 ventanas de 15 minutos hubo 3 o más ventas (lo que se espera si los clientes llegan al azar). La tienda tiene
20 m², una MacBook con impresora y dos celulares, y hoy **cada asesora lleva a su cliente a la caja y ahí hace siete pasos seguidos**
(armar el ticket, DNI, tarjeta, imprimir, gancho, doblar, embolsar). Una simulación de 4.000 sábados con esas llegadas dio una espera
promedio de unos 2 minutos con el diseño de hoy y de unos 9 segundos si la compu solo cobra.

La decisión de piso (Felipe, 24-nov) son **tres estaciones**: ARMAR en el piso con el celular, COBRAR en la MacBook, ENTREGAR aparte. La
asesora acompaña a su cliente de principio a fin (no hay comisiones). Lo que faltaba en el sistema: el ticket que se arma en el celular no
llegaba a la MacBook, porque «Dejar en espera» guarda solo en el navegador (`lib/almacen-local.ts`). Era el paso 2 de ADR-0511.

## Decisión

1. **Un ticket compartido es una FOTO del ticket del piso**, guardada en `retail.tickets_compartidos` con la sede de la caja. Nace
   «esperando» y termina una sola vez: «tomado» (un equipo lo abrió y pasa a ser un ticket suyo) o «descartado». Nunca se borra.
2. **Al abrirlo, entra por la misma puerta que un ticket en espera** (`retomar` de `PuntoDeVenta.tsx`): precios del día, cliente, lo del
   cobro y quién atendió. `registrar_venta` vuelve a validar todo al cobrar. El ticket compartido **no reserva stock**.
3. **De dos que abren el mismo ticket a la vez, solo uno se lo lleva** (UPDATE condicionado a «esperando»); el otro lee quién lo abrió.
   **Cada «Abrir» lleva su apertura** (`apertura_id`, un id que elige el equipo, como el id al mandar): si la respuesta se pierde en la
   red, la web pide otra vez con la misma (dos reintentos solos en menos de 3 s) y la base devuelve el ticket en vez de «ya lo abrió»,
   mientras no se haya cobrado. Si los tres se pierden, el ticket se sigue viendo en «Del piso» y se abre al tocar otra vez (/chaos g2,
   decidido por Felipe el 24-nov). No se usó «la misma persona puede reabrir»: la misma cuenta en dos equipos lo tendría en dos cajas.
4. **La caja pregunta cada 5 s** (`useTicketsDelPiso`), solo con la caja abierta y la pestaña a la vista, y sin el contenido. Si una
   pregunta falla se queda la última lista buena.
5. **Al cobrarlo se anota la venta** (`marcar_ticket_compartido_cobrado`): `enviado_en → tomado_en → ventas.created_at` es el tiempo real
   de cada cobro, sin cronómetro.
6. **Permisos:** quien ve Vender en esa sede (`fn_ve_modulo('vender')` + `fn_puede_operar_ubicacion`); firma `fn_actor_persona_id(true)`.
   Tope de 20 esperando por caja.

## Lo que se ve

- **Celular (y cualquier equipo):** «Mandar a la caja», sobre «Cobrar», en peso secundario. Si no llega, el ticket se queda en el equipo.
- **Caja, ticket vacío:** «Del piso» dentro del ticket: «Ana · Cliente 1», prendas, total, hace cuánto, «Abrir» y el basurero.
- **Caja, ticket ocupado:** un chip en la cabecera abre la misma lista en una hoja (en 420 px queda el ícono con el número).
- **Cerrar caja:** la hoja de tickets sin cobrar muestra aparte los del piso: no se descartan al cerrar, siguen esperando.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** una foto que pasa entera de un equipo a otro, con un dueño a la vez.
**DESCARTÉ:** (a) un ticket «vivo» que dos equipos editan juntos: obliga a reconciliar versiones y a resolver choques de líneas, y nadie lo
necesita: el ticket lo arma una persona y lo cobra otra. (b) La conexión permanente de Supabase (realtime) para la lista: el entorno de
CAYLA no la usa en ninguna otra pantalla, y preguntar cada 5 s con un índice parcial cuesta decenas de filas por pregunta. (c) Reservar
stock al mandar: el choque es improbable y `registrar_venta` ya lo frena con `FOR UPDATE`.
**SE ROMPE SI:** la caja recarga la página justo después de una apertura cuya respuesta se perdió (la apertura vivía en la memoria de la
pestaña: el ticket queda tomado, sin venta y en ningún equipo; se ve en la medida como «tomado sin venta» y hay que escanear sus prendas);
la asesora sigue editando en su celular un ticket que ya mandó (no puede: al mandarlo se limpia); si alguien cobra un ticket
del piso desde la cola sin conexión (la venta se sube después y esa medida no se anota: queda sin `venta_id`); si se pega la web antes que
el SQL (no pasa nada: la opción no se dibuja hasta que `fn_tickets_compartidos` responde).

## Cómo se publica

Una sola parte, a cualquier hora: tabla nueva sin políticas (RLS encendido, solo funciones `security definer`) y cinco funciones nuevas. No
altera ninguna tabla en uso. Idempotente. **Para volver atrás:** `drop function` de `enviar_ticket_a_caja`, `fn_tickets_compartidos`,
`tomar_ticket_compartido`, `descartar_ticket_compartido`, `marcar_ticket_compartido_cobrado` y de los tres ayudantes, y
`drop table retail.tickets_compartidos`; la web vuelve sola a no dibujar la opción.

Medir el cobro, una vez en producción (solo lectura):

```sql
select date_trunc('day', t.enviado_en at time zone 'America/Lima') as dia, count(*) as cobros,
       percentile_cont(0.5) within group (order by extract(epoch from t.tomado_en - t.enviado_en)) as seg_hasta_abrir,
       percentile_cont(0.5) within group (order by extract(epoch from v.created_at - t.tomado_en)) as seg_abrir_a_cobrar
  from retail.tickets_compartidos t join retail.ventas v on v.id = t.venta_id
 where t.ubicacion_id = (select id from retail.ubicaciones where nombre = 'Tienda Trujillo')
 group by 1 order by 1 desc;
```

## Cómo se verificó

- `pnpm pruebas:tickets-compartidos`: 29 casos contra Postgres (forma, permisos, la cuenta en céntimos, idempotencia, forma del contenido,
  abrir, la misma apertura que pide otra vez, descartar, historia inmutable, estados imposibles, tope, la venta anotada y una **carrera
  real con COMMIT**). Una mutación que quita el candado del WHERE de `tomar_ticket_compartido` pone en rojo 3 casos; otra que le quita la
  rama de «la misma apertura», 1.
- `lib/tickets-compartidos-reglas.test.ts`: lectura tolerante, nombre en la caja y mensajes de error.
- En el navegador, contra una base local con todas las migraciones: a 375 px el ticket se manda y llega con su prenda y total; con 20
  esperando, avisa y el ticket se queda; en escritorio aparece en «Del piso», se abre, se descarta, se ve en la hoja de cierre y, cobrado en
  efectivo, la boleta queda unida al ticket (8 s hasta abrirlo, 16 s hasta cobrarlo).
- `/chaos` (dos hallazgos, cerrados el mismo día con el ataque repetido en el navegador: tres clics en «Abrir» = 1 pedido; respuesta
  perdida una vez → se abre solo; perdida tres veces → sigue en «Del piso» y se abre al tocar otra vez), `/milimetro auditar`, `/focus` y
  `/formidable` (informes en `docs/`).
