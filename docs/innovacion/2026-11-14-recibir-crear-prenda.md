# Innovar · Recibir ▸ crear la prenda que llegó — 2026-11-14

> Pasada rápida — sin escéptico, puede traer ideas que no aguantan.

- **Alcance:** rama `claude/recibir-igual-que-anterior-7212c1` (Recibir ▸ un envío ▸ Contar ▸ «Crear la prenda que llegó» y «Otro modelo») · **Modo:** rápido
- **SHA analizado:** `691cb0677` · **Radar usado:** 2026-11-13
- **Corrieron:** pasada rápida — sin agentes, sin web, con el radar como fuente. Cada idea se buscó antes en el código, la base y los PR abiertos.
- **Resultado:** 6 propuestas (3 Ahora · 3 Visión) · 3 descartadas · 1 derivada

## Qué es y qué problema resuelve hoy
Cuando llega un envío, quien recibe cuenta cada modelo y crea en el catálogo los que son nuevos. En producción eso toma 14 minutos por modelo nuevo
y 9 por reposición, y la mitad de los modelos son nuevos. La tarea 7 (PR #1860) ya ofrece «Igual que la anterior»: tejido, patrón y tallas de la
prenda recién creada, de un toque. Lo que sigue costando es crear los modelos **uno por uno**, volver a escribir lo mismo de **un envío a otro** y
reconocer a mano una **reposición** que trae su etiqueta del proveedor.

## Ahora — lo que se construye con el stack de hoy
| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| recibir-crear-prenda#1 | «La anterior» sale de la base: sobrevive a recargar y llega a «Crear ahora» | quien recibe | Linear Triage Intelligence (radar #40) | 3 | M | Alta | 1,50 |
| recibir-crear-prenda#2 | La etiqueta del proveedor reconoce la reposición | quien recibe | Shopify POS: recibir escaneando (radar #5) | 4 | M | Media | 1,40 |
| recibir-crear-prenda#3 | Crear los nuevos del envío en una planilla | quien recibe | Square Squaremates: catálogo en lote (radar #20/#21) | 5 | L | Media | 1,17 |

## Visión — las apuestas grandes
| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| recibir-crear-prenda#4 | La foto arma la ficha: tejido, patrón y nombre propuestos | quien recibe | Shopify Magic / Lightspeed AI (radar #24) + salidas estructuradas de Claude | 4 | L | Media | 0,93 |
| recibir-crear-prenda#5 | Lo de siempre del proveedor, con su porqué | quien recibe | Linear: sugerencia explicada que se aplica sola bajo reglas (radar #40) | 3 | L | Media | 0,70 |
| recibir-crear-prenda#6 | La factura del proveedor arma los modelos del envío sin aviso | quien recibe, Compras | Odoo 19 OCR, Square Managerbot (radar #31) | 5 | XL | Media | 0,70 |

## Detalle de cada propuesta

### recibir-crear-prenda#1 · «La anterior» sale de la base  ·  Ahora · impacto 3 · esfuerzo M · confianza Alta
- **Hoy:** lo recuerda `ContarEnvio` en un `useState` (`apps/web/components/recepcion-conteo/ContarEnvio.tsx`, «Igual que la anterior»). Si se recarga
  la pantalla, se pierde. «Para después ▸ Crear ahora» (`HacerAhora.tsx`) no lo tiene.
- **Propuesta:** leerlo de lo que la base ya guarda. `retail.variantes_nacidas_al_recibir` tiene `despacho_id` y `creada_at`: la última prenda creada
  en este envío y en esta categoría, con su tejido, patrón y tallas, sale de una consulta. Una sola fuente para Contar y para «Crear ahora». Lectura pura, sin migración de datos.
- **El momento que mejora:** se corta la luz o se recarga a mitad de un envío de 13 modelos, y la ficha sigue ahí.
- **Cómo lo hacen los mejores:** Linear sugiere desde el historial y dice por qué ([fuente](https://linear.app/docs/triage-intelligence), consultado 2026-11-13).
- **DECIDÍ** leer de la base y no de `localStorage`, porque la base ya lo tiene y vale en cualquier equipo. **DESCARTÉ** una tabla nueva de «plantillas»: duplicaría lo que ya está.
  **SE ROMPE SI** la prenda anterior se edita después en Productos: la ficha mostraría lo editado, lo que también está bien.
- **Primer paso:** la función de lectura con su prueba, y conectarla a `anterior` en `ContarEnvio`.

### recibir-crear-prenda#2 · La etiqueta del proveedor reconoce la reposición  ·  Ahora · impacto 4 · esfuerzo M · confianza Media
- **Hoy:** `retail.codigos_barras` acepta `origen = 'fabrica'` (`supabase/migrations/0002_esquema.sql:69`). Solo lo escribe el censo
  (`20260918020000_censo_alta_al_vuelo.sql:168`; 12 filas en la base local) y Recibir no lo usa. Una reposición se reconoce a la vista, en la galería «Ya la tenemos».
- **Propuesta:** al crear una prenda en Recibir, un campo opcional «Código del proveedor» guarda el código de su etiqueta como `fabrica`. En la
  siguiente reposición, escanear esa etiqueta lleva directo a contarla.
- **El momento que mejora:** la reposición, que hoy toma 9 minutos por modelo: escanear y contar, sin buscar en la galería.
- **Cómo lo hacen los mejores:** Shopify POS 11.8 recibe la mercadería del proveedor escaneando en el POS (radar #5, ADOPTAR).
- **DECIDÍ** reusar `codigos_barras` y no crear otra tabla. **DESCARTÉ** exigir el código: muchos proveedores no etiquetan.
  **SE ROMPE SI** dos proveedores usan el mismo código: la base ya lo frena (código único); habría que decir cuál es.
- **Primer paso:** preguntarle a Felipe cuántos proveedores traen etiqueta con código de barras. Sin eso, la confianza no sube.
- ⚠ Toca lo delicado (stock: lo que se cuenta al escanear): espera el OK de Felipe.

### recibir-crear-prenda#3 · Crear los nuevos del envío en una planilla  ·  Ahora · impacto 5 · esfuerzo L · confianza Media
- **Hoy:** cada modelo nuevo abre su propia hoja de tres pasos (`HojaPrenda.tsx`). En un envío con 6 blusas nuevas, son 6 hojas y 18 pasos.
- **Propuesta:** «Crear las 6 nuevas»: una planilla con una fila por modelo nuevo de la categoría (nombre, fotos y colores, tallas y precio).
  Tejido, patrón y tallas se llenan una vez arriba y bajan a todas las filas, que se pueden corregir. Se crean todas juntas, cada una con su token.
- **El momento que mejora:** el envío de 13 modelos, que hoy son unos 90 minutos solo de crear prendas.
- **Cómo lo hacen los mejores:** Square Squaremates edita el catálogo en lote (radar, GA EE. UU. 12-nov-2026). Lightspeed aplica umbrales en lote (radar #2). Sin fuente para «alta en lote al recibir»: confianza Media.
- **DECIDÍ** reusar `preparar_prenda_al_recibir` fila por fila, sin RPC nueva. **DESCARTÉ** una sola transacción para todas: si una falla por nombre repetido, las demás deben quedar.
  **SE ROMPE SI** la planilla no cabe a 1024 px: se necesitan fichas por fila, no una tabla ancha.
- **Primer paso:** contar en producción cuántos envíos traen 3 o más nuevos de una misma categoría (solo lectura).
- ⚠ Toca lo delicado (precio de venta de cada prenda): espera el OK de Felipe.

### recibir-crear-prenda#4 · La foto arma la ficha  ·  Visión · impacto 4 · esfuerzo L · confianza Media
- **Hoy:** el PR #1859 (ADR-0663) saca el **color** de la foto, localmente y sin IA. Tejido, patrón, tipo y nombre se siguen eligiendo a mano.
- **Propuesta:** con la misma foto, Claude con salida estructurada propone tejido, patrón y tipo («Blusa · Lino · Liso»), siempre entre los valores
  del vocabulario de la categoría. Sale como una ficha que se acepta, con su porqué («se ve trama de lino»), igual que «Igual que la anterior».
- **Lo que lo habilita:** salidas estructuradas de Claude (radar del stack, ADOPTAR) y visión de alta resolución (PROBAR); el tope de gasto de «precio propuesto con IA» (radar #49).
- **DECIDÍ** que sea una ficha y nunca un valor puesto: la blusa de encaje marcada «Liso» (3-nov) es justamente el error que no se puede repetir.
  **DESCARTÉ** proponer el nombre propio («Dalia»): es decisión de la tienda. **SE ROMPE SI** el vocabulario crece y la respuesta inventa un valor: se valida contra la lista y, si no está, se calla.
- **Primer paso:** medir con 50 fotos reales de producción (solo lectura) cuántas acierta, como se hizo con el color.

### recibir-crear-prenda#5 · Lo de siempre del proveedor, con su porqué  ·  Visión · impacto 3 · esfuerzo L · confianza Media
- **Propuesta:** pasar de «la anterior de este envío» a «lo de siempre de este proveedor y marca en esta categoría» («Tejidos Norte · Blusas: Lino, S a L, en 8 de 10 envíos»). Es la misma ficha, con su porqué a la vista.
- **Cómo lo hacen los mejores:** Linear sugiere desde el historial, explica por qué y, si el admin lo permite, la sugerencia se aplica sola (radar #40).
- ↻ **Cambia una regla de Felipe** si se aplica sola: hoy tallas y marca arrancan vacías (2026-10-13, 2026-11-03). Como ficha que se toca, no cambia nada.
- **Primer paso:** con datos de producción, medir qué tan repetitivo es cada proveedor. Si menos de 6 de cada 10 se repiten, no vale.

### recibir-crear-prenda#6 · La factura del proveedor arma los modelos del envío sin aviso  ·  Visión · impacto 5 · esfuerzo XL · confianza Media
- **Hoy:** la foto o el PDF de la factura ya se suben («Subir foto de facturas»; `compras_adjuntos`, `20260914180000`), pero solo se guardan.
- **Propuesta:** leer esas líneas (descripción, tallas y cantidad) y proponer los modelos del envío sin aviso, ya separados por categoría. Quien recibe confirma.
- **Cómo lo hacen los mejores:** Odoo 19 hace OCR corregible; Square Managerbot crea la orden desde la factura (radar #31, PROBAR). Con el XML de la factura electrónica peruana sería casi determinista.
- ⚠ Toca lo delicado (costos y lo que se le debe al proveedor): espera el OK de Felipe.
- **Primer paso:** ver cuántos envíos sin aviso traen el XML y cuántos solo una foto.

## Para otras skills
- Pendiente de esta misma tarea, no es innovación: «Para después ▸ Crear ahora» (`HacerAhora.tsx`) todavía no ofrece «Igual que la anterior». Lo resuelve #1, o una línea en su backlog.

## Descartadas (para que nadie las vuelva a proponer)
| Propuesta | Por qué no |
|---|---|
| El color sale de la foto | Ya existe: PR #1859 (ADR-0663) |
| Precio de venta propuesto con IA al crear | Ya existe: «precio propuesto con IA», `PropuestaDePrecio` en `HojaPrenda.tsx` (PR #1762 y #1769) |
| Que la ficha venga ya aplicada | Choca con la decisión de Felipe: tallas y marca arrancan vacías, y tejido y patrón son opcionales desde el 3-nov |

## Lo que no se miró
- No hubo web ni escéptico: los referentes salen solo del radar del 2026-11-13.
- No se midió en producción cuántos envíos traen varios nuevos de una categoría (#3) ni cuántos proveedores etiquetan con código (#2).
