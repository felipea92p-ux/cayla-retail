# ADR-0213 · Un proveedor puede tener varios rubros

> Nació como ADR-0211. Renumerado a 0213 al subir: `main` ya tenía el 0211 de los desplegables (#442) y el 0212
> estaba tomado en otro worktree.

**Fecha:** 2026-09-25 · **Estado:** construido y verificado en local; **sin pegar en producción** · **Alcance:** Compras ▸ Proveedores

## Problema

Felipe, en «Editar proveedor»: «tiene que dejarme seleccionar varias categorías por proveedor». El rubro era UN
texto (`proveedores.rubro`, ADR-0094). Un proveedor que vende polos y casacas tenía que quedarse con uno, y al
filtrar la lista por «Casacas» no aparecía: la lista le mentía a quien buscaba a quién pedirle casacas.

En producción (consultado el 2026-09-25): 76 proveedores, 73 con rubro, 10 rubros distintos (Polos 23, Camisas y
Blusas 13, Casacas 10…), que salieron de la carga inicial (ADR-0140) y calzan casi uno a uno con categorías del
catálogo.

## Decisión

- **DECIDÍ:** `proveedores.rubros text[] not null default '{}'` en lugar de `rubro text`. Sigue siendo texto libre
  (la razón de ADR-0094 no cambió: agrupa, no cuadra inventario). La base hace imposible lo que antes solo evitaba
  la pantalla: el CHECK `proveedores_rubros_limpios` exige `rubros = fn_rubros_limpios(rubros)` — sin vacíos, sin
  espacios sobrantes, uno solo por clave (`fn_clave_texto`: «Polos» y «pólos » son el mismo) — y «sin rubro» se
  escribe de una sola forma, `{}` (NOT NULL). Cada rubro que había pasa a ser el primero de la lista de su proveedor.
- **DESCARTÉ:** una tabla puente `proveedor_rubros (proveedor_id, rubro)`, porque suma una tabla, sus políticas y un
  `array_agg` en cada lectura para ~80 proveedores con 1–3 rubros cada uno, sin ganar nada que el arreglo no dé (el
  filtro se hace en memoria, ADR-0128). Y **descarté** atar los rubros a `categorias` del catálogo (FK), porque es
  otra decisión: cambia qué significa «rubro» (hoy hay «Accesorios» y «Bodys y ropa interior», que no son una
  categoría) y obliga a decidir qué pasa con los proveedores de Gastos y de servicios. Queda abierta abajo.
- **SE ROMPE SI:** alguien necesita preguntar en SQL «quién vende X» sobre miles de proveedores (un `= any(rubros)`
  no usa índice sin GIN — a esta escala no importa), o si se decide que los rubros SON las categorías del catálogo:
  ese día se migra `rubros text[]` a una tabla con FK, mapeando nombre por nombre.

## Cómo se aplicó

`supabase/migrations/20260926110000_proveedores_varios_rubros.sql`, una sola transacción:
(Nació como `20260926100000`; se renombró porque `main` ya tenía esa hora con la paleta de colores, aplicada en
producción. Supabase identifica cada migración por su hora: dos iguales rompen `supabase start`.)

1. `fn_rubros_limpios(text[])` (IMMUTABLE, la regla), la columna nueva, la copia y el CHECK.
2. Las 4 funciones que tocan el rubro, **parchadas sobre su definición viva** (patrón de
   `pg_temp.reescribir`, 20260925150000): `fn_proveedores()` tiene parches en vivo (20260923130000 y siguientes)
   que un `create function` copiado de un archivo viejo desharía. Cada patrón tiene que aparecer el número exacto
   de veces o la migración se detiene sin tocar nada. Se verificó que las 4 definiciones del local son idénticas
   (md5) a las de producción, así que el ensayo local es el de producción.
   - `fn_proveedores()` devuelve `rubros text[]` en el lugar de `rubro text` (se quita y se crea: `create or replace`
     no puede cambiar lo que devuelve).
   - `registrar_proveedor` / `actualizar_proveedor`: `p_rubro text` → `p_rubros text[]` en el mismo lugar; la vieja se
     quita (una sola firma, ADR-0009). Mandar `{}` o nada deja al proveedor sin rubro, como antes.
   - `registrar_proveedor_de_gasto` sigue creando al proveedor con el rubro «Gastos» (`{Gastos}`).
3. La columna vieja se quita solo si ningún rubro quedó sin copiar (si no, se detiene y avisa).

Se puede pegar dos veces. No crea políticas (regla de deadlocks, ADR-0195). Ninguna vista usa la columna
(`compras_resumen` depende de la tabla, no de `rubro`). `proveedores_produccion.rubro` (Taller) es otra tabla y
otro vocabulario cerrado: no se toca.

**Orden al publicar:** pegar el SQL y enseguida desplegar la web. Entre los dos, la web vieja no ve rubros en la
lista y «Guardar» un proveedor falla con un error que se reintenta (no guarda a medias).

## Pantalla

`ProveedorModal`: «Rubros (elige todos los que vende)» son botones que se prenden y apagan (tocar de nuevo quita);
debajo, «Otro rubro» para uno que no está (Enter o «Agregar» lo suma como botón; lo escrito sin presionar
«Agregar» también se guarda al guardar, porque quien lo escribió lo quería). Si lo escrito ya existe con otra
escritura («polos»), se usa la de la lista, para no abrir un filtro nuevo por una mayúscula. La lista muestra
«Contacto · Polos, Casacas», el filtro por rubro encuentra al proveedor bajo cada uno de sus rubros (el conteo de
cada botón es de proveedores, por eso la suma puede pasar de «Todos»), y la vista rápida pone un chip por rubro.

## Verificación

- Postgres desechable (UTF-8, las 290 migraciones en una sesión como CI): `pruebas:proveedores-rubros` 15/15;
  `pruebas:proveedores-cuentas` 28/28 (con y sin `--en-seco`); batería completa 80/87 — las 7 rojas fallan igual
  en una base idéntica **sin** esta migración (fallas previas, ajenas a proveedores de Compras).
- `pnpm typecheck`, eslint de los archivos tocados, `vitest` de `proveedores-reglas` (53 en verde).
- Navegador (andamio temporal sin base, ya borrado): elegir varios, quitar, «Lencería» con Enter sin enviar el
  formulario, lo escrito sin «Agregar» se suma al guardar, la pantalla manda
  `p_rubros: ["Casacas","Lencería","chalecos"]`, editar abre con sus rubros marcados, filtro «Casacas» muestra al
  proveedor de «Polos, Casacas», y a 375 px.

## Pendiente

- Pegar en producción y desplegar; después `pnpm datos:generar:produccion` para que el diccionario diga `rubros`.
- Decisión de Felipe: ¿los rubros de Compras son las categorías del catálogo? Si sí, hoy se escriben dos veces
  (en el proveedor y en el producto) y pueden separarse.
