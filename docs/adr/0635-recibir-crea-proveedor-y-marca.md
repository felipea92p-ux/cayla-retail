# ADR-0635 — Quien recibe crea el proveedor y la marca que no están, sin los otros módulos

- **Fecha:** 2026-11-09 · **Estado:** construido en la rama `claude/provider-brands-creation-e1ae21`; la migración `20261109230000` no está en producción.
- **Nace de:** Felipe, mirando «Algo que no estaba en la guía»: «Aquí debería permitirme crear un nuevo proveedor y nuevas marcas, pero no me deja».
  Después: «Al agregar nuevo proveedor solo pida la razón social y el RUC (opcional)», «Debería poder crear proveedores y marcas sin necesidad de
  tener los otros módulos», «Yo a lo que me refería es al recibir mercadería sin aviso». Maqueta: `docs/maquetas/recibir-alta-proveedor-marca-2026-11/`.
- **Relacionados:** ADR-0393 (recibir sin aviso; act. 2026-11-07 c: cada marca con su proveedor), ADR-0480 (`registrar_marca_de_compra`, la marca
  nueva de Mis compras), `20261021202000` (`registrar_proveedor_de_orden`, el proveedor nuevo de Mis compras), ADR-0306 (un botón no es un módulo),
  ADR-0178 (solo das lo que tienes), ADR-0452 (proveedores solo de gastos).

## El problema

En Recibir, los combos de proveedor y de marca eran listas cerradas. Si llegaba un fardo de un proveedor que nunca se registró, o una marca nueva,
quien recibía no podía seguir: crear un proveedor pide el módulo Proveedores (`registrar_proveedor`) y crear una marca pide el Catálogo
(`crear_marca`), y la tienda que recibe casi nunca tiene ninguno. «+ Agregar proveedor» solo existía en la entrada «¿Llegó algo sin aviso?», solo
con el módulo Proveedores y con el formulario largo (contacto, plazo, banco).

## Decisión

DECIDÍ: dos funciones nuevas y estrechas, por el módulo **Recibir mercadería**, y dos hojas cortas que las usan en cada combo de Recibir.

1. **Base** (`20261109230000`): `registrar_proveedor_de_recepcion(nombre, ruc)` devuelve un proveedor activo, el que ya estaba (por RUC y después
   por el nombre) o uno nuevo con solo su razón social y su RUC si se escribió; `registrar_marca_de_recepcion(nombre, proveedor)` crea la marca
   unida a su proveedor o, si ya existe una que se escribe igual, le suma el proveedor. Firman con quien recibe y anotan en la Actividad. Son
   copia del molde de Mis compras con el permiso de Recibir escrito en cada una.
2. **Hojas** (`components/recepcion-conteo/ProveedorNuevoRecepcion.tsx` y `MarcaNuevaRecepcion.tsx`): el proveedor pide razón social y RUC
   opcional, sin la nota de «lo demás se completa después» (Felipe la quitó); la marca pide el nombre y «¿Quién te la trae?». Las dos preguntan
   «¿no será uno/una que ya existe?» antes de crear.
3. **Dónde:** «+ Marca nueva» en la marca de «¿Qué llegó?» / «Algo que no estaba en la guía»; «+ Agregar proveedor» en «¿Quién te la trae?» de la
   marca nueva (sin aviso), en «De quién llegó» del cierre y en «Todo es de un solo proveedor» de la entrada, que ya no pide el módulo
   Proveedores. Lo creado entra a las listas de la pantalla sin recargar (`conAltas`, `lib/recepcion-altas-reglas.ts`).

## La excepción: un envío de Compras

En un envío que vino de Compras (con guía), lo que llega se cruza al cerrar con la orden de su proveedor («Regalo», «Se cobra aparte», «Se arregla
en la próxima compra»). `guardar_conteo_envio` y `preparar_prenda_al_recibir` rechazan un proveedor que no viene en ese envío, y con razón: un
proveedor ajeno no tiene orden con qué cruzarse. Ahí el combo de proveedor sigue mostrando solo los de la guía y dice «¿Llegó de otro proveedor?
Recíbelo aparte con «¿Llegó algo sin aviso?»». La marca nueva sí se crea, unida a uno de los proveedores de la guía. En un envío sin aviso la base
ya acepta cualquier proveedor activo (ADR-0393 act. 2026-11-07 c).

## Descarté

- **Abrir `registrar_proveedor_de_orden` y `registrar_marca_de_compra` también a Recibir:** son de Mis compras, están en producción y su Actividad
  dice «desde una orden» / «desde una compra»; mezclar dos permisos en una función viva es tocar lo que ya se usa.
- **Abrir `registrar_proveedor` o `crear_marca`:** dejarían escribir banco y CCI, o editar el catálogo, sin esos permisos.
- **Aceptar en un envío de Compras un proveedor que no está en su guía:** cambia tres funciones de recepción y el cierre (stock, lote y costo) y
  pide una regla nueva para prendas sin orden ni factura. Felipe lo aclaró: lo que quería era recibir sin aviso.
- **Los grupos «Vienen en este envío / Otros proveedores» de la maqueta:** con la excepción de arriba ya no se mezclan en ningún combo.

## Se rompe si

Alguien registra «Hilos del Sur» sin RUC y ya existía «Hilos del Sur S.A.C.» con otra escritura que la pregunta no vio: quedan dos fichas y no
existe fusionar proveedores. La pregunta «¿no será…?» (`proveedoresParecidos`, sin «SAC»/«EIRL») es lo que lo evita. Con más gente pudiendo crear,
el directorio de Proveedores puede llenarse de fichas sin datos de pago: quien administra Proveedores las completa desde ahí.

## Verificación

- `pnpm pruebas:recibir-crea-proveedor-y-marca`: 7 casos (sin Recibir no crea; con solo Recibir crea y anota; no duplica por nombre ni por RUC;
  RUC mal escrito y mismo nombre con otro RUC se rechazan; la marca se une y suma vínculos; `anon` no ejecuta).
- `lib/recepcion-altas-reglas.test.ts` (12 casos) y los registros de la guía de foco, guías interactivas y altas fuera del `<form>`.
- En el navegador, en un banco propio con una cuenta que solo ve Recibir: proveedor nuevo en la entrada sin aviso; marca nueva con un proveedor
  nuevo creado dentro de su hoja (la línea quedó con ese proveedor solo, por su marca); proveedor nuevo en «De quién llegó» del cierre.
  No se probó en el navegador un envío de Compras (el banco no tenía uno).
