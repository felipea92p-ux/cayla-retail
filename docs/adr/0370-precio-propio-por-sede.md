# ADR-0370 — Precio propio por sede

- **Fecha:** 2026-10-09
- **Estado:** aceptado y **en producción** (las 4 migraciones, 2026-10-09, por el MCP de Supabase)
- **Decidió:** Felipe (qué y quién); Claude (cómo se guarda y se aplica)

## Contexto

En Arequipa a veces se vende una prenda a otro precio que en Trujillo. El ERP tenía un solo precio por variante
(`variantes.precio`) para todas las sedes, y las dos salidas que quedaban mentían: cambiar el precio de todas las tiendas, o
dar un «descuento» en la caja donde no lo hay. Felipe pidió que el precio por sede fuera **notorio y no confuso**.

## Decisión

**Un precio de sede reemplaza al general en esa tienda. No es un descuento ni un recargo: el cliente ve un solo precio.**

Decisiones de Felipe (2026-10-09):

1. **Quién:** quien ve el módulo «Productos» lo pone, **solo en su propia tienda** (el líder, en cualquiera). Es una acción dentro
   de Editar producto: no es un módulo (ADR-0306). La cuenta de almacén de la tienda puede hacerlo si su rol ve Productos.
2. **Alcance:** la prenda entera (todas sus variantes al mismo precio). Se guarda por variante para que el candado de la venta
   compare variante contra variante, como siempre.
3. **Duración:** vale hasta que alguien lo quite. Lo temporal ya lo cubren las campañas.

Candados que acompañan la decisión 1: motivo obligatorio, firma del Responsable (ADR-0162), aviso (sin bloquear) si el precio se
aleja más de un 30 % del general, y todo queda en el Historial de la prenda y en Actividad.

## Cómo se construyó

- **Base** (`20261010100000`): `retail.precios_sede`, con una fila vigente por variante y sede (índice parcial). Nunca se borra ni
  se edita: cambiar archiva la vigente y crea otra, y quitar la archiva. RLS está encendido y sin políticas: solo se lee y escribe por
  funciones `security definer`. La única regla del precio es **`fn_precio_en_sede(variante, sede)`**: el de la sede si existe, si
  no el general. Se escribe solo con `poner_precio_sede` y `quitar_precio_sede`, que bloquean la prenda (`for update`) para que dos
  pestañas a la vez se pongan en fila. Se lee con `fn_precios_sede_producto` (la ficha) y `fn_precios_en_sede` (las pantallas de
  una tienda).
- **Todo lo que fija o compara un precio usa `fn_precio_en_sede`**, cada función con un reemplazo anclado de una línea:
  `registrar_venta` (`20261010100200`), `separar_prendas`, `editar_separacion`, `registrar_cambio`, `crear_proforma` y
  `regularizar_prenda` (`20261010100300`). La campaña, el club y los topes de descuento se calculan sobre ese precio. Sin precios
  propios, todo es idéntico a antes. `pnpm pruebas:precio-sede` trae un guardián que falla si una de las seis deja de usarla.
- **Actividad** (`20261010100100`): `fn_actividad_precio_sede` dice «precio propio en Tienda Trujillo S/ 79.90 → S/ 89.90» en vez
  del JSON crudo.

## Cómo se ve (notorio, no confuso)

| Lugar | Qué se ve |
|---|---|
| Editar producto ▸ Variantes y precios | El bloque «Precio por tienda»: «Se vende a S/ 79.90 en todas las tiendas», o una fila por tienda con su precio, la insignia «Precio propio», el general, desde cuándo, quién y por qué, con «Cambiar» y «Quitar». La hoja «Precio distinto en una sede» tiene guía de foco y un ejemplo de motivo que sigue la tienda elegida (`/sugerir`). |
| Vender | El precio de la tienda; bajo él, «Precio de Lima», solo para la colaboradora. La boleta no cambia. El sondeo de 10 s también relee los precios propios (poner uno no sube la versión del catálogo). |
| Apartados, Cambios, Proformas, Ventas sin registrar | El precio de la tienda que corresponde (la de la venta, en Ventas sin registrar; la elegida, en la hoja de Proforma). |
| Catálogo ▸ Productos | «2 precios» junto al precio; al pasar el mouse y para el lector de pantalla, «Otro precio en Lima S/ 84.90». |
| Existencias | El precio de la sede que se mira, con «Precio de esta tienda» debajo. |
| Etiquetas impresas | El precio de la tienda donde se imprime (todos los orígenes, también lotes y producción). |
| Traslados | El pase avisa qué prendas llegan con una etiqueta que en destino no vale. Al recibir, «Imprimir etiquetas con el precio de aquí» va primero. |
| Historial de la prenda y Actividad | «puso precio propio en Tienda Trujillo · S/ 79.90 → S/ 89.90 · «motivo»». |

## Descartado

- **Una regla por porcentaje** («AQP +8 % en blusas»): da precios como S/ 128.29 y nadie sabe de dónde salen. Se fijan precios
  exactos.
- **Precio por talla y color en la sede:** son 12 casillas por blusa, y con una cuenta compartida es fácil dejar una sin cambiar:
  la misma prenda tendría dos precios en la misma tienda.
- **Fecha de término automática:** un día el precio cambiaría sin que nadie lo toque y la etiqueta colgada quedaría mintiendo.
- **Columna nueva en `variantes`:** una por sede no escala y obliga a tocar el núcleo (principio 1). La tabla aparte solo guarda
  las excepciones.

## Producción

Pegar en este orden: `20261010100000` → `20261010100100` → `20261010100200` → `20261010100300` → `20261010100400` (una prenda con precio propio frena «eliminar») → `20261010100500` (poner o quitar un precio de sede sube la versión del catálogo: toda pantalla abierta se pone al día sola). Ninguna tiene políticas ni
`drop trigger`; todas son re-ejecutables y fallan sin tocar nada si una función viva cambió. La web nueva se puede publicar antes o
después: sin la tabla, lee cero precios propios y cobra el general, que es lo mismo que exige la base vieja.

**Aplicadas en producción el 2026-10-09** con `apply_migration` (que registra la hora de aplicación como versión, no la del
archivo): `20261010002553 precio_propio_por_sede`, `20261010002608 precio_sede_en_actividad`, `20261010002617
venta_cobra_precio_de_sede`, `20261010002633 apartados_cambios_proformas_precio_de_sede`. Antes de aplicarlas se comprobó que cada
ancla calzaba en producción (1, 1, 1, 1, 1, 2 apariciones). Después: las seis funciones usan `fn_precio_en_sede`, `precios_sede`
vacía y con RLS encendido. El 2026-10-10 se sumaron `20261010125615 precio_sede_frena_eliminar_producto` y `20261010125617
precio_sede_sube_version_del_catalogo`, verificadas (renglón 22 en `fn_producto_historia`, disparador de versión en `precios_sede`). Y `20261010130947
precio_sede_cambiar_solo_el_motivo` (archivo `20261010100600`): corregir solo el motivo no se guardaba; lo destapó la prueba ciega de
`/formidable` (`docs/formidable/catalogo-precio-por-tienda.md`).

## Cómo se verifica

`pnpm pruebas:precio-sede` (20 escenarios: permisos, archivo, historial, Actividad, venta real en Trujillo, proforma, guardián),
`pnpm pruebas:registrar-venta`, `pruebas:separaciones`, `pruebas:registrar-cambio`, `pruebas:prendas-por-regularizar`. En el
navegador: Editar producto (poner, avisar, quitar), Vender a escritorio y a 375 px, Apartados a 375 px, Productos, Existencias,
Etiquetas y un traslado en camino.
