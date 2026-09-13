# ADR-0030 — La taxonomía universal va DEBAJO del vocabulario propio, no en su lugar

**Fecha:** 2026-09-10
**Estado:** Construido y verificado — 1.849 categorías y 10.216 valores cargados
contra el Postgres local, pantalla `/inventario/taxonomia` compilando, 108 tests
en verde. Falta ejecutar el anclaje automático: no hay `ANTHROPIC_API_KEY`.

## Contexto

El sistema se está construyendo para venderse a otras marcas, y el onboarding de
cada cliente nuevo empieza con su inventario en un archivo propio: un Excel con
columnas inventadas por él, un PDF de un sistema viejo, la foto de un cuaderno.
Hoy la única forma de meterlo es tipearlo prenda por prenda.

Al diseñar ese importador apareció el problema real, que no es leer el archivo:
es **hacia dónde traducirlo**. `categorias` (32) y `colores` (30) son el
vocabulario de CAYLA. Una marca deportiva no tiene "Bisutería"; una zapatería
infantil no tiene "Blusas". Un importador que apunte a ese vocabulario no se
puede generalizar a un segundo cliente — que es exactamente para lo que existiría.

## Lo que se investigó

| | **Shopify** | Google Product Taxonomy | GS1 GPC | Color/Size NRF (hoy GS1 US) |
|---|---|---|---|---|
| Última versión | **v2026-08** | **2021-09-21** (congelada) | viva | viva |
| Licencia | **MIT, gratis** | gratis | miembro GS1 | **$250, de pago** |
| Español | **sí** (+25 idiomas) | sí | parcial | no |
| Categorías de ropa | **663** | 240 | ~40K total | — |
| Atributos con valores | **sí — 8.240** | **no** | sí (bricks) | solo color/talla |

Lo decisivo no son las categorías, son los **atributos por categoría**: una
camiseta trae 14 (Color, Talla, Tipo de talla, Tejido, Cuello, Patrón, Grupo de
edad, Sexo objetivo…) con valores predefinidos en español. Google no tiene
atributos y lleva cinco años sin tocarse; GS1 GPC es el más riguroso pero es de
pago y está diseñado para EDI entre fabricantes, no para leer el Excel de una
boutique.

## Decisión

**DECIDÍ: adoptar la Shopify Standard Product Taxonomy como nivel universal, con
el vocabulario propio de cada marca COLGANDO de él.**

```
NIVEL UNIVERSAL   (compartido, versionado, igual para todo tenant)
  Beige · Rosa                      Ropa y accesorios > … > Blusas (aa-1-2-3)
     ▲        ▲                                    ▲
NIVEL DEL TENANT  (propio, editable, nace de SU archivo)
  Arena · Palo rosa                              Blusas (prefijo BLU)
```

El dato que fuerza esta forma: **Shopify tiene 19 colores, CAYLA tiene 30.** El
estándar universal es MÁS POBRE que el vocabulario del tenant, y eso no es un
defecto — es lo que significa interoperar. Forzar a todos a los 19 le quita a
CAYLA "Arena", "Palo rosa" y "Animal print", que son distinciones que su clienta
sí hace en mostrador.

La consecuencia que justifica todo el trabajo: **el trabajo de la IA cambia de
naturaleza.** Deja de ser "adivina a qué categoría de CAYLA va esto" —imposible
de generalizar— y pasa a ser "mapea al universal", que es el mismo trabajo para
todos los clientes, para siempre. Un solo prompt sirve para una zapatería y para
una marca de bikinis.

**DECIDÍ: capa de traducción, no columna vertebral.** Dos columnas nuevas
(`categorias.taxonomia_categoria_id`, `colores.taxonomia_valor_id`) y cinco
tablas nuevas. `productos`, `variantes` y `codigos` no se tocan.

**DESCARTÉ: apuntar `productos` directo a la categoría universal.** Es más limpio
a diez años, pero el prefijo de 3 letras que genera los códigos de barras vive en
`categorias` (0047): moverlo arrastraría `fn_asignar_codigo_producto`,
`codigos_correlativos` y toda etiqueta ya impresa. Principio 1.

**DESCARTÉ: reemplazar el vocabulario propio por el universal.** Es el diseño más
simple de todos y el que hace desaparecer "Palo rosa" del sistema.

**DECIDÍ: versión fijada, con aviso cuando salga una nueva.** El estándar saca
release cada trimestre y v2026-08 sumó 2.000 categorías. Un catálogo que se
reclasifica solo de un día para otro es peor que uno desactualizado: la prenda
que ayer era "Blusas" hoy aparece en otro lado sin que nadie lo pidiera.

**DECIDÍ: la IA propone, una persona confirma.** `POST /api/taxonomia/anclar`
nunca escribe. Anclar mal es invisible —nada falla, "Palo rosa" queda colgando de
Beige y no se nota hasta que un reporte agrupa mal meses después—, y un error que
no avisa hay que atajarlo antes, no después.

**DECIDÍ: dos pasadas, y la primera sin IA.** De los 30 colores de CAYLA, la
mitad coincide por nombre exacto con el universal. Mandarlos al modelo sería
pagar por una comparación de cadenas y aceptar que se equivoque donde `===` no
puede. `anclarPorNombre` (puro, testeado) se queda con lo obvio; el modelo solo
ve lo que pide criterio: "Palo rosa", "Camel", "Animal print". Es el mismo
principio que gobernará el importador entero: **lo que resuelve el código no se
le pregunta a la IA.**

**SE ROMPE SI:** llega una marca de un rubro que no está en los verticales
cargados (`aa`, `hb`, `os`, `lb`). Se carga el que falte con el mismo script y
`--verticales`; no requiere migración.

## Dos cosas que se descubrieron construyendo, y conviene no olvidar

1. **`packages/database` genera tipos contra PRODUCCIÓN, y local tiene drift.**
   `gen-types` apunta al project-id de producción. Regenerar desde local
   —tentador, porque es donde están las tablas nuevas— habría borrado
   `catalogo_con_stock`, `configuracion_empresa`, `sede_meta`,
   `sede_datos_fiscales`, `persona_actual` y `puede_operar_sede`, que existen en
   producción y no en local. Los tipos de taxonomía se insertaron a mano.
   Regenerar a ciegas rompe la app.
2. **`server-only` rompe vitest**, y eso señaló un problema de diseño real: las
   funciones puras no tenían por qué ser server-only. `anclar.ts` (puro,
   testeable, usable en el navegador) y `anclar-ia.ts` (toca la API que se paga)
   quedaron separados por eso, y es mejor así.

## Verificación (no "debería funcionar")

- `select count(*) from taxonomia_categorias where vertical='aa'` → **663**.
  Totales: 1.849 categorías · 993 atributos · 10.216 valores · 16.527 relaciones.
- `aa-1-1-2-4` resuelve a *Ropa y accesorios > Prendas de vestir > Ropa deportiva
  > Tops deportivos > Camisetas de capa base*, con sus **14 atributos**.
- El atributo `color` devuelve los **19** valores universales en español.
- `fn_clave_texto` de Postgres y `claveTexto` de TypeScript dan el mismo resultado
  en los 10 casos de `anclar.test.ts` (verificado corriendo la función real).
- `pnpm typecheck` 3/3 · `vitest` 108/108 · `next build` con
  `/inventario/taxonomia` y `/api/taxonomia/anclar` registradas.

**Lo que NO está verificado:** el anclaje automático nunca corrió. No hay
`ANTHROPIC_API_KEY` en el entorno, y sin ella `POST /api/taxonomia/anclar`
responde 503 con el mensaje que lo explica. La calidad real de las propuestas del
modelo —lo único que este ADR no puede afirmar— se juzga el día que haya clave.

## Cómo se revierte

`drop table taxonomia_categoria_atributos, taxonomia_valores, taxonomia_atributos,
taxonomia_categorias, taxonomia_versiones;` y quitar las dos columnas de anclaje.
Nada existente depende de ellas: son nullable y ninguna pantalla vieja las lee.
