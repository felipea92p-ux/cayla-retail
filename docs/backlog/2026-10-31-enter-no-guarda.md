# Backlog — guardar es un acto explícito (2026-10-31)

## NO TRAE SQL

Solo web: una pieza (`components/ui/enterNoGuarda.ts`), 16 hojas y su candado. Nada que pegar en producción.

## LA DEUDA, CONTADA: 130 formularios

El candado (`lib/enter-no-guarda.test.ts`) cuenta cuántos formularios con `onSubmit` no llevan todavía la guardia:
hoy **130**. Son hojas de todo el ERP, y repartirla es un **despliegue módulo por módulo**, no un PR. Lo importante
es que el número **solo baja**: una hoja nueva no puede nacer sin la guardia, porque entonces el candado se pone en
rojo y dice cuál se coló.

**Cómo bajar la deuda** cuando toque un módulo: al `<form onSubmit={…}>` se le añade `onKeyDown={enterNoGuarda}` y
se baja `PENDIENTES_HOY` al número que diga la prueba. Si esa hoja de verdad tiene que enviarse con Enter (un
buscador), va a `FUERA` con su motivo.

**Qué priorizaría yo:** las hojas que cobran, mueven stock o emiten un comprobante. De las 130, las de Vender,
Caja, Cambios y Devoluciones son las que más caro salen si se envían sin querer.

## CERRADAS EN ESTE PR (16)

Las 10 que `/chaos` señaló expuestas: Nuevo avío, Nueva tela, Editar tela, Nueva orden de compra, Nueva orden de
insumo, Gasto del viaje, Papeles por completar, Roles (tres formularios), Recibir mercadería y Alta al vuelo.
Y las 6 que ya se protegían a mano y ahora usan la pieza: Nuevo producto, Editar producto, los dos comprobantes de
orden, el formulario de recepción y su hoja de prenda.

## LO QUE EL CANDADO NO VE

Un formulario que no use `<form onSubmit>` (un modal con botones sueltos y su propio `onClick`) no entra en la
cuenta: ahí no hay envío implícito y no hace falta la guardia, pero tampoco se vigila nada. Y el candado mira el
texto del archivo: si alguien escribe la guardia de otra manera, no la reconoce.

## SIGUE PENDIENTE DE `/chaos` SOBRE «NUEVO AVÍO» (informe en `.chaos/`)

Tres hallazgos:

1. **Una clase nueva se recorta a 60 letras en silencio** (g2) y el aviso de éxito muestra el nombre mutilado. De
   esa clase sale el prefijo del código de todos sus avíos.
2. **«Si cierras ahora, se pierde lo que escribiste» … y se guarda** (g3): con la escritura en camino, «Salir sin
   guardar» no la detiene.
3. **Un botón sin medida no se puede registrar** (g3), aunque el diseño y la base la hacen opcional.

Y aparte: **en «Nuevo avío» el costo por unidad usa el lector de plata**, así que 0,045 —lo que cuesta un botón— se
rechaza (`lib/avio-nuevo-reglas.ts:97`). Es el G13 ya arreglado para telas que no llegó a avíos.

## SIGUE PENDIENTE DE ADR-0580

- `pnpm --filter web tema:auditar` con escenarios para «Nuevo avío» y Catálogo ▸ Atributos ▸ Avíos.
- `guias:recorrer`: las dos huellas se aceptaron revisando los pasos a mano.
- `/formidable` con una persona sin contexto.
