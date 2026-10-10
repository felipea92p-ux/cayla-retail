# ADR-0367 — Apartados: DNI por SUNAT, celular opcional y reimprimir desde el Historial

- Fecha: 2026-10-09
- Estado: aceptado (Felipe, 2026-10-09). Migración **en producción desde el 2026-10-09** (versión `20261009231332`); web en PR.

## Contexto

Felipe, al usar Apartados: (1) al escribir el DNI se busca la ficha de clientes, pero si no está, no pasa nada más; (2) el
celular no debería ser obligatorio; (3) no hay cómo reimprimir el ticket de un apartado ya registrado.

## Decisiones

1. **DNI: primero la ficha, luego SUNAT.** El buscador «El cliente» de Apartar busca la ficha (si la cuenta ve Clientas) y, si
   no la encuentra y son 8 dígitos, pregunta a `/api/padron` (SUNAT público primero, apis.net.pe si está configurado:
   ADR-0008). El nombre llega partido en Nombres y Apellidos (`nombresYApellidos`, `lib/club-registro-reglas.ts`; SUNAT trae
   los apellidos primero, el proveedor los nombres) y se puede corregir. Si el padrón no responde, se escribe a mano: el
   apartado nunca se frena por un tercero (principio 9). Sin el módulo Clientas el buscador sigue, solo por DNI.
2. **Celular opcional.** `separaciones.clienta_celular` admite null; `separar_prendas` solo valida el celular que viene.
   Lo que el celular hacía sigue cubierto: sin celular no entra a la cola de WhatsApp («Recordar») y el número de Yape/Plin
   para devolver el adelanto **se pide aparte** (la base ya lo exigía; la pantalla lo dice). La regla de dinero no cambia.
   `apartar_stock` pide un contacto: recibe el celular, «DNI …» o «sin celular». **Pedir a otra sede** también (Felipe, el mismo
   día): `separacion_pedidos_clienta_completa` deja de exigir el celular junto con el nombre (sigue prohibiendo un celular
   sin cliente), `pedir_prenda_para_apartar` lo acepta vacío y `fn_apartar_pedidos_que_llegaron` le pasa «sin celular» a
   `apartar_stock` cuando llega la prenda. Al avisar que llegó, sin celular la ventana no abre WhatsApp: «Ya le avisé»
   deja la constancia del aviso dado de otra forma.
3. **Historial y reimprimir.** La pestaña «Todos» se llama **«Historial»** (la clave interna sigue `todos`). Cada fila con
   boleta de anticipo lleva un botón de impresora que abre `ReimprimirApartadoModal`: el ticket de 80 mm con «COPIA ·
   REIMPRESA EL …»; un apartado entregado elige entre la boleta final y la del anticipo. En la final reimpresa el saldo va en
   una línea («Saldo pagado al recoger») porque la lista no trae con qué medios se pagó. No escribe nada en la base.

## Producción

`20261009231332_apartado_sin_celular.sql`: un `alter` de `retail.separaciones` (sin políticas) y cuatro reemplazos anclados
en `separar_prendas`, con validación al final; idempotente y con `lock_timeout`. Pegada en producción el 2026-10-09 con el OK de Felipe, por MCP `apply_migration` (versión `20261009231332`, md5 de
`separar_prendas` `9fba5b394397c78b9026847106fc0c62`). Las cuatro anclas se verificaron en el texto vivo antes de aplicar.
La web antigua sigue funcionando igual: siempre manda celular.

`20261009232138_pedido_otra_sede_sin_celular.sql`: el check de `separacion_pedidos` y dos reemplazos anclados. Pegada el mismo
día por MCP (versión `20261009232138`; md5 `pedir_prenda_para_apartar` `590f170763612fc17ad28e7c940af6e5`,
`fn_apartar_pedidos_que_llegaron` `30c1a89669741d4f764bdc83b6fd792f`), con las anclas verificadas antes en el texto vivo.
