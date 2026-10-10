# ADR-0352 — Plan del piso, primera entrega: los grupos del mix, la propuesta frente al piso real y la foto del espacio

**Fecha:** 2026-10-05
**Estado:** **Aceptado** (decisiones de Felipe del 2026-10-05: alcance solo lectura, tabla propia de grupos que asigna él, foto semanal del riel desde ya, entrada propia en Inventario con el tope del menú en 8). **Una decisión quedó a mi propuesta por defecto:** cómo pesar la venta propia (punto 2); Felipe preguntó «qué sugieres» y no la objetó.
**Módulo:** Inventario, Plan del piso (nuevo módulo `plan_piso`).
**Actualiza:** ADR-0329 (act. 2026-10-04, punto 3: el peso `días ÷ (días + 28)` pasa a medirse en prendas confirmadas) y la actividad 12 de ADR-0328.
**Documento de respaldo:** `docs/investigacion/2026-10-05-como-deciden-el-mix-zara-gap-lvmh-ralph-lauren.md` (cinco investigadores, un escéptico, las cuentas con cifras de TRU).

## El problema

ADR-0329 dejó decidido el mix del piso (total = m² × 30, reparto por roles, la venta propia ganando peso) pero no se podía ver ni comprobar nada: había un total por sede y ninguna pantalla donde el líder viera qué le tocaría a cada grupo. La investigación del 2026-10-05 agregó dos cosas: ninguna casa grande publica su mix de piso ni existe un modelo publicado que lo decida, y **nadie ha medido en ropa cuánto más vende una categoría por tener más lugar** (la elasticidad de 0,17 es de supermercado). Con ella, reasignar el piso vale entre ≈ 0,5 % y ≈ 3 % de ventas; con otra, 8 % o 19 %.

## Qué se construyó (solo lectura)

1. **Grupos** (`grupos_mix`, `categoria_grupo_mix`, `fn_grupos_mix`, `fn_categorias_grupo_mix`, `fijar_grupos_de_categorias`; migración `20261006100000`). 8 grupos con su rol; la propuesta de a qué grupo va cada categoría se siembra por prefijo y queda «por revisar»; el líder la confirma o la cambia.
2. **Propuesta** (`lib/mix-piso.ts`, `lib/mix-piso-partida.ts`; sin SQL nuevo): qué cuelga hoy por grupo, la industria, la venta propia con su rango y la propuesta en prendas que suma la capacidad.
3. **Foto del espacio** (`espacio_piso`, `fn_registrar_espacio_piso`, `fn_espacio_piso`; migración `20261006110000`; cron `/api/inventario/espacio-piso`): cada lunes, las prendas libres en el piso por sede y categoría.

## Decisiones

**1. Los grupos viven en tablas propias, y el rol vive en el grupo.**
DECIDÍ: `grupos_mix` (el grupo y su rol) y `categoria_grupo_mix` (una categoría, un grupo, con firma, versión e historial); sin políticas, solo funciones; escritura solo del líder y todo o nada.
DESCARTÉ: (a) una columna en `categorias`, porque el `alter` toma un candado exclusivo sobre una tabla que lee cada pantalla (el deadlock del 24-sep, ADR-0195) y cualquiera con el módulo Categorías la cambiaría sin firma; (b) partir `familias` en subfamilias, porque la familia decide de qué lado del riel va una prenda y se usa en otros lados; (c) seis grupos fijos en el código, porque una categoría creada por un líder quedaría fuera y cada cambio pediría un deploy.
SE ROMPE SI: una categoría cambia de familia con grupo ya asignado (el disparador solo mira al escribir en esta tabla).

**2. El peso de la venta propia se mide en prendas confirmadas, con una muestra efectiva menor y un techo.**
DECIDÍ: `peso = n_ef / (n_ef + 50)`, con `n_ef = confirmadas / 1,5` y techo de 75 %. Solo cuentan las ventas escaneadas (con prenda real); las «sin registrar» se muestran aparte y no mueven la propuesta hasta regularizarlas. 50 equivale a decir que el mix real de una sede puede apartarse de la industria ±6 puntos en una categoría del 26 %; el 1,5 y el techo son criterio, no dato.
DESCARTÉ: `días ÷ (días + 28)`, porque cuenta días (un día de TRU no es un día de AQP: ≈ 686 y ≈ 987 prendas) y equivale a decir que TRU y la industria difieren solo ±1,7 puntos, lo que los propios catálogos desmienten (Topitop y Oechsle difieren 11 puntos en polos). También descarté dejar la venta propia fuera del todo hasta el mes: ignora lo que TRU ya vende.
SE ROMPE SI: una campaña corta duplica una categoría y entra al cálculo (el techo la limita pero no la frena del todo; la frena el tope de ±3 puntos al mes de la entrega siguiente). Si en cambio casi todo se anota «sin registrar», las ventas confirmadas son pocas y el peso se queda bajo, que es lo correcto.

**3. Cada porcentaje de venta lleva su rango de Wilson.**
DECIDÍ: «entre a y b» con el intervalo de Wilson al 95 % sobre la muestra efectiva.
DESCARTÉ: «p ± 1,96·√(p(1−p)/n)», porque con 0 ventas da «0 ± 0» (seguro que no se vende) cuando con 45 ventas efectivas el valor real puede llegar a ≈ 8 %.
SE ROMPE SI: hay tan pocas ventas que ningún grupo tiene muestra (se dice «sin ventas», nunca un 0).

**4. La foto del espacio: llave por fecha, función del servidor, cron de Vercel.**
DECIDÍ: una fila por (tienda, fecha, categoría), tomada por `fn_registrar_espacio_piso` (solo `service_role`, todo o nada, idempotente por día) desde el cron del lunes 3:00 de Lima, igual que la conservación del club. Lo colgado es `fn_existencias_base` (ADR-0270), la misma fórmula que la pantalla.
DESCARTÉ: (a) una columna `semana`, porque fijaría la cadencia en el esquema (pasar a diario son 46 mil filas al año, nada, pero habría que migrar); (b) `pg_cron`, que este repo no usa en ningún lado; (c) tomarla al abrir la pantalla, porque depende de que alguien la abra y escribe desde una lectura.
SE ROMPE SI: el cron falla (esa semana queda sin foto, que la pestaña muestra como hueco y no como cero) o se mide la elasticidad con fotos «por cuadrar» (se guardan marcadas y salen apagadas: no sirven).

**5. Plan del piso entra directo en Inventario y el tope del menú sube a 8.**
DECIDÍ (Felipe, preguntado con las dos opciones): fila propia en Inventario, tope 7 → 8, y la fotografía del menú del líder se actualiza con su aprobación. Una pestaña de Existencias no era un módulo (ADR-0306): quien ve Existencias vería el plan.
DESCARTÉ: el subgrupo «El piso» (Frescura + Plan del piso), que deja Frescura un clic más adentro, justo lo que Felipe descartó el 27-sep.
SE ROMPE SI: Inventario suma otra pantalla o aparece un rol que vea Análisis, Frescura, Plan del piso y Recibir sin Compras: ahí sí se regrupa, y el 8 no vuelve a subir.

## Estados imposibles que la base niega

Una categoría en dos grupos; un rol inventado; un vestido en un grupo de fuera del riel o un cinturón en el riel; una firma sin fecha; dos fotos del mismo día para la misma tienda y categoría; modelos más que prendas, prendas negativas o una foto de 2025; un cambio sin firma ni historial (RLS sin políticas); dos líderes que se pisan (PT409, nunca una sobrescritura silenciosa).

## Lo que queda fuera (siguiente entrega)

Guardar y aprobar el mix con motivo e historial; el ajuste del encargado; **el tope de ±3 puntos al mes con zona muerta** (hoy no hay un mix aprobado contra el que acotar: la investigación mostró que el tope solo es del tamaño del ruido de un mes de ventas, ±3,2 puntos al 95 %, así que por sí solo deja pasar el ruido); la cobertura de Little; «entra una, sale una»; la prueba de 4 semanas de Jeans; el mínimo por talla en el motor; la reserva de prueba por rol.

## Actualización 2026-10-05 (tarde) — la propuesta se ve y se lee mejor

Tras revisar el informe interactivo «Mix del Piso» (artefacto del 5-oct), se aplicó lo que sirve a la pantalla, con los colores de la guía:
- **El riel a escala** (`RielAEscala.tsx`): dos rieles de ganchos, Hoy y Propuesta, con la MISMA capacidad. Muestra lo que una tabla no dice: TRU está al 10 % (61 de 600). Una barra al 100 % de lo colgado escondía el volumen.
- **La mancuerna** (`Mancuerna.tsx`): hoy, industria, venta propia (con su rango de Wilson) y propuesta de cada grupo en una línea, para ver cuál empuja hacia dónde.
- **La lectura en palabras** (`lecturaDeGrupo`): «Faltan 88: cuelga más», «Dentro de lo esperado», «Sobran 20: no cuelgues más hasta llegar a su parte; no se retira nada», «es destino, no baja sin el OK del líder».
- La barra del peso de la venta en su tarjeta y la mezcla por fila en la Historia.

DECIDÍ: el signo de la lectura sale de la META EN PRENDAS (`capacidad × %`, la misma que usa el motor del piso), con tolerancia de ±3 puntos de la capacidad; solo sin capacidad conocida se compara el porcentaje.
DESCARTÉ: comparar el % de lo que cuelga con el % propuesto: con el riel a medias (300 de 600) polos tenía 66 % de lo colgado (más que su 48 %) y aun así le faltaban 88 prendas, y el texto se contradecía. Lo cazó la prueba antes de verlo en pantalla.
DESCARTÉ también el rojo para colorear un grupo (la guía lo reserva: «acento sagrado, máx. 2 por pantalla»): los seis grupos usan tinta, pizarra, verde, ámbar, taupe y sand.
SE ROMPE SI: se agregan más de seis grupos en el riel (los colores se reutilizan y dos grupos se confundirían) o el riel pasa de unos 2.000 ganchos (el canvas se pone ilegible).

## Para producción

1. Pegar `20261006100000_plan_del_piso_grupos_del_mix.sql` y después `20261006110000_plan_del_piso_foto_del_espacio.sql`, cada una sola en el SQL Editor, **antes de publicar la web**. Ninguna crea políticas ni toca tablas en uso. La verificación de cada una está en su encabezado.
2. Publicar la web. `CRON_SECRET` y la llave de servicio ya existen (los usa la conservación del club): no hay variables nuevas.
3. La primera foto se toma el próximo lunes a las 3:00 de Lima. Si se prefiere diaria, es una línea en `vercel.json`.
4. Refrescar el diccionario de datos cuando estén aplicadas (`generado/COMO-REFRESCAR.md`).
5. Darle el módulo «Plan del piso» a quien corresponda en Roles y accesos (nace solo para el líder).

## Objeción y riesgos abiertos

- La elasticidad de espacio en ropa sigue sin medirse: lo que esta entrega muestra no justifica un optimizador (el valor de reasignar es chico y depende de ella). Por eso se construyó la foto.
- El peso (n₀ = 50, efecto de diseño 1,5, techo 75 %) es criterio. Está a la vista en la pantalla («Cómo se calcula») y en `lib/mix-piso.ts`, para que Felipe lo discuta.
- La cobertura de TRU no cuadra: con 98 prendas en 4 días son ≈ 3,5 semanas de piso y ADR-0329 dice «7 a 9». Hay que reconciliarlo antes de fijar un objetivo de cobertura.
- Las ventas «sin registrar» (≈ 7 de cada 10 en TRU) siguen fuera de la propuesta hasta regularizarlas (PR #788, parte 2).
- AQP sigue con 1.800 prendas provisionales: hay que contarla.
