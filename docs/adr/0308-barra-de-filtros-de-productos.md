# ADR-0308 — La barra de filtros de Productos dice la verdad

**Fecha:** 2026-10-02 · **Estado:** tanda 1 construida y verificada en local (sin migración); tanda 2 diseñada, por construir ·
**Decide:** Felipe (las 19 decisiones de negocio y de forma, en preguntas del 2026-10-02); Claude (lo técnico) ·
**Rama:** `claude/filtro-pantalla-mejora-dba838` · **Análisis:** `docs/pantallas/productos-filtros.md`

## 1. El problema, primero

Felipe mostró la barra con el panel abierto y una pregunta: «si ningún producto llega a 999, ¿por qué mostrarlo así?». El
análisis (`/pantalla`, con datos de producción del 2026-10-02) encontró que la barra le mentía a quien la usa en cuatro lugares:

1. **Precio inventado.** El control iba de S/ 0 a S/ 999 escrito a mano; la prenda más cara cuesta S/ 119. El 88 % del
   recorrido no filtraba nada, cada píxel valía unos S/ 10 y en el tope el filtro no tenía techo aunque dijera «999».
2. **Píldoras sin nombre.** La pieza compartida mostraba el valor elegido, y el de fábrica es «Todas»: se leía «TODAS · TODAS ·
   TODOS…», distinguibles solo por el ícono. Pasaba en seis pantallas.
3. **El 63 % de las opciones llevaba a una lista vacía** (179 de 284: 44 categorías activas, 14 con prendas).
4. **«Sin stock» medía la red y la tarjeta, la sede.** Lima tenía 0 prendas y «Sin stock» le devolvía 0 resultados.

Y, en el código, un estado que se separaba de la URL (el chip «Hasta S/100» seguía a la vista con la lista sin filtrar),
dos controles para el mismo orden (flechas ↑↓ y «Ordenar») dentro del panel de filtros, y el panel naciendo cerrado.

## 2. Decisiones de Felipe (2026-10-02)

| Tema | Decisión |
|---|---|
| Apertura | Abierto en la computadora; en el celular, plegado y en una hoja con «Ver N productos». Si alguien lo cierra, en ese equipo vuelve cerrado |
| Píldoras | «Categoría ▾» sin elegir, «Categoría: Blusas ✕» elegida, **en las seis pantallas** que usan la pieza compartida |
| Orden | Un solo «Ordenar por», fuera del panel, junto a «N productos». Abre con **«Más recientes»** (Felipe eligió esto en vez de la recomendación, Nombre A–Z) |
| Precio | Cajas «Desde / Hasta», control con límites reales y tramos con conteo. Los límites, de lo que se está viendo sin el propio precio |
| Opciones vacías | Esconderlas y mostrar el conteo («Blusas (12)») |
| Stock | Las dos medidas, rotuladas: Hay en [sede] · Sin stock en [sede] · Sin stock en ninguna sede · Pedir a proveedor |
| Filtros nuevos | Talla, Temporada, Color agrupado por familia (no un filtro aparte) y «Por completar» (sin foto, temporada, marca o proveedor) |
| Varias opciones | Sí en Talla y Color; una sola en el resto |
| Estado | «Activos» por defecto; los descontinuados con un clic |
| Buscador | Sin tildes, por categoría y color, «%» literal, atajo «/» |
| Disposición | Dos filas con nombre: «Prenda» y «Gestión» |
| Atajos fijos (pestañas) | No por ahora: repetirían los filtros y hoy «Stock bajo» y «Pedir a proveedor» darían siempre 0 |
| Compartir | «Copiar enlace» |
| Entrega | Dos tandas: primero la pantalla (sin migración), después la base |

## 3. Decisiones técnicas

```
DECIDÍ:    la URL es la única fuente de verdad de la barra; las cajas (buscador y precio) guardan solo lo que se está escribiendo,
           caja por caja (la que tiene el cursor no se suelta hasta salir), y todo cambio se aplica sobre la URL vigente: la
           pedida que aún no llega, o la del navegador en el momento de usarla. Cualquier URL que llega cierra lo pedido
           (Next descarta la navegación pendiente cuando empieza otra); un enlace de afuera de la barra hace esperar al
           temporizador del buscador, que se rearma al llegar la URL y manda lo que la caja todavía dice.
           Lógica pura en lib/productos-filtros.ts.
DESCARTÉ:  (a) copiar la URL a un estado local al montar (lo que había): se separaba al navegar desde fuera (A quién pedirle,
           Atrás) y volvía a mandar un precio que ya no estaba; (b) leer `params` del momento en que se programó el temporizador:
           un clic dentro de los 350 ms se perdía (medido: el orden elegido desaparecía); (c) soltar la caja apenas la URL dice
           lo mismo recortado: el espacio antes de la palabra siguiente se borraba bajo el cursor («blusaroja»; lo encontró
           la revisión adversaria).
SE ROMPE SI: la navegación ajena no es un enlace (<a>) ni nace en la barra —un router.push de otro componente— dentro de los
           350 ms de una tecla: el temporizador la puede descartar. Hoy el único caso es «A quién pedirle», que conserva los
           filtros y la búsqueda.
```

```
DECIDÍ:    la píldora compartida lee su nombre y, si tiene, su valor; `valorPorDefecto` dice qué vale sola (casi siempre «todos»;
           en Historial, la tienda de la cabecera), y solo distinta de eso se marca y lleva ✕.
DESCARTÉ:  un rótulo encima de cada píldora (dos líneas de alto) y «Categoría: Todas» siempre (ruido); arreglarlo solo en
           Productos (dos formas de leer la misma pieza en el ERP).
SE ROMPE SI: una pantalla pasa un `valorPorDefecto` que no está entre sus opciones: la píldora se marca sin ✕ (no hay a qué volver).
```

```
DECIDÍ:    los límites del precio salen de los precios reales de lo que se está viendo, sin el propio filtro de precio,
           redondeados hacia afuera a 10; el control avanza de a S/ 5 en rangos cortos y en sus puntas manda «sin tope».
           Tanda 1: dos páginas de UN producto de fn_productos (precio_asc / precio_desc), en paralelo con la lista.
DESCARTÉ:  límites de todo el catálogo (lo que hacen Zara y H&M): dentro de una categoría barata, medio control vacío; un tope
           fijo «o más»: sigue siendo inventado; calcularlo en la web leyendo variantes: incluiría el producto de «Monto manual»
           y las variantes desactivadas.
SE ROMPE SI: una prenda tiene tallas a precios distintos y otra con precio mínimo menor tiene el máximo más alto: el tope
           provisional se queda corto (el control igual manda «sin tope» en su punta). La tanda 2 lo vuelve exacto.
```

```
DECIDÍ:    el panel se abre en la computadora según una cookie (`cayla_filtros_panel`, leída en el servidor); en el celular vive
           en una hoja <Modal> que aplica cada cambio al momento. Con el panel abierto, los chips no se repiten.
DESCARTÉ:  localStorage (el panel aparecería y desaparecería al hidratar); abrirlo también en el celular (a 375 px empuja los
           productos bajo el pliegue y Baymard muestra que los controles fuera de la vista no se descubren).
SE ROMPE SI: alguien usa la tablet en vertical a menos de 768 px: ve la hoja, no el panel (es lo mismo que el celular).
```

Una revisión adversaria (4 lentes y un escéptico por hallazgo) confirmó 6 defectos de la propia tanda y ninguno se refutó;
están corregidos y reproducidos en el navegador (commit `fix(catalogo): lo que encontró la revisión adversaria…`).

Medido sin desborde horizontal a 375, 768, 1024, 1280, 1440 y 1920 px. A 768 el menú lateral deja ~420 px: el bloque de
precio se parte en dos líneas y el nombre de la fila va arriba.

## 4. Tanda 2 (por construir): la base

Funciones **nuevas** al lado de `fn_productos`/`fn_productos_resumen`, no reemplazos: así la web publicada sigue funcionando en el
rato entre que Felipe pega el SQL y se fusiona el PR (el error del #444). Las viejas se borran en una limpieza posterior.

- Listado nuevo: sin variantes desactivadas en precio y color (hoy el resumen cuenta 580 variantes y la lista 578), buscador sin
  tildes, por categoría y color y con `%`/`_` literales, Talla y Color con varias opciones (color por familia), Temporada,
  «Por completar» y Disponibilidad en la sede y en la red.
- Facetas: conteo disyuntivo por opción (cada filtro cuenta con todos los demás menos el suyo) en una sola pasada (3,7 ms medidos
  en producción hoy), límites y tramos de precio exactos. Reemplaza a `getPreciosExtremos`.

## 5. Referentes

Verificados por agentes de la sesión el 2026-10-02 (fuentes en el análisis, §9): Zara, H&M, Amazon, Uniqlo, Falabella y Ripley
en navegador; Baymard, NN/g, Shopify Polaris y Search & Discovery, Odoo 17, Lightspeed, Square, NetSuite, Zoho, Linear, Notion,
Stripe en su documentación. MercadoLibre no se pudo leer (pide sesión a un navegador automatizado): no se usó para decidir.

## 6. Archivos

`components/FiltrosProductos.tsx` · `components/ui/FiltrosPildora.tsx` (`DesplegablePildora` con `valorPorDefecto` y ✕,
`PanelPildoras filas`, `FilaPildoras`) · `lib/productos-filtros.ts` · `lib/productos-filtro-precio.ts` · `lib/pildora-reglas.ts` ·
`lib/panel-filtros.ts` · `lib/productos-orden.ts` · `lib/catalogo-v2.ts` (`getPreciosExtremos`, estado por defecto) ·
`lib/productos-stock.ts` (aviso de descontinuadas) · `app/(app)/productos/page.tsx` · `components/FiltrosHistorialVentas.tsx`
(la «Tienda» con `valorPorDefecto`) · `components/AQuienPedirle.tsx` (la píldora dice «Proveedor»).
