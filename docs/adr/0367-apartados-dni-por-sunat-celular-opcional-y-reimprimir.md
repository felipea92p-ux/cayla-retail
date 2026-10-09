# ADR-0367 — Apartados: DNI por SUNAT, celular opcional y reimprimir desde el Historial

- Fecha: 2026-10-09
- Estado: aceptado (Felipe, 2026-10-09). Web lista; la migración `20261009200000_apartado_sin_celular.sql` está **solo en local**.

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
   `apartar_stock` pide un contacto: recibe el celular, «DNI …» o «sin celular». `pedir_prenda_para_apartar` (pedir a
   otra sede) sigue pidiendo celular: no se tocó.
3. **Historial y reimprimir.** La pestaña «Todos» se llama **«Historial»** (la clave interna sigue `todos`). Cada fila con
   boleta de anticipo lleva un botón de impresora que abre `ReimprimirApartadoModal`: el ticket de 80 mm con «COPIA ·
   REIMPRESA EL …»; un apartado entregado elige entre la boleta final y la del anticipo. En la final reimpresa el saldo va en
   una línea («Saldo pagado al recoger») porque la lista no trae con qué medios se pagó. No escribe nada en la base.

## Producción

`20261009200000_apartado_sin_celular.sql`: un `alter` de `retail.separaciones` (sin políticas) y cuatro reemplazos anclados
en `separar_prendas`, con validación al final; idempotente y con `lock_timeout`. **Espera el OK de Felipe.** Hasta que se
pegue, la web en producción con un celular vacío recibe el rechazo de la base («El celular de la clienta tiene 9 dígitos»):
publicar la web DESPUÉS de la migración.
