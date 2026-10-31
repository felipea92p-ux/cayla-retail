# ADR-0594 — Los consumibles del Taller son un gasto de su sede, y un activo fijo empieza en ¼ de la UIT

- **Fecha:** 2026-10-31 · **Estado:** actividades 1 y 2 **construidas y probadas en local**; la actividad 3 es un **SQL ensayado que pega Felipe**. **La migración `20261031195000` y el SQL de la actividad 3 NO están en producción.**
- **Decidió:** Felipe, 2026-10-31, con preguntas. Nace de una captura de Insumos: «los gastos como agujas o tijeras que usa el taller no deben ir asociados a la prenda, ¿cómo registramos eso?».
- **Toca:** ADR-0335 (su mínimo de «S/ 150 por unidad» queda reemplazado), ADR-0570 (actividad 9, «consumibles con monto fijo por prenda», se **descarta**), ADR-0477 (el mismo patrón de categoría de gasto). **Respeta:** P-31 y ADR-0547 (el Taller se mide como una unidad aparte).

## El problema primero

Las agujas y el hilo general entraron a Insumos como avíos (la captura mostraba «Aguja Clase B +12 unid» y «Hilo General +24 conos»). Un consumible no pertenece a ninguna orden de producción, y el libro de insumos exige una orden para todo «consumo» (`movimientos_insumo_produccion_segun_tipo`, `20260917145000:166`). Lo único que le quedaba a una aguja era salir como «merma» (una pérdida) o quedarse en el estante contando como capital para siempre.

Y lo que decía ADR-0570 («gasto del Taller **más un monto fijo por prenda**») choca con cómo ya está decidido el Taller: P-31 (16-oct) saca lo que cuesta el Taller en sí del costo de la prenda, y ADR-0547 (27-oct) lo mide como una unidad independiente con su propio resultado.

## Decisión

DECIDÍ: **un consumible es un gasto de la sede Taller**, con su categoría `consumibles_taller` («Consumibles del Taller», cuenta 656 · Suministros, orden 21, sin reparto con CLAURE). Agujas, hilo general, aceite de máquina y tiza. No va al estante de Insumos, y **no se suma al costo de la prenda**.

DESCARTÉ:
- **Un monto fijo por prenda dentro de `variantes.costo`** (lo que decía ADR-0570 act. 9). El Estado de resultados toma el «Costo de lo vendido» (cuenta 691) de `variantes.costo × cantidad` (`20260925130000:214`). Con el monto fijo dentro y la compra de agujas ya en el gasto del Taller, **el mismo dinero se cuenta dos veces**: al comprar y al vender. Con S/ 300 al mes de consumibles y 200 prendas, son S/ 300 de más. Además tocaba `cerrar_produccion` (stock y dinero, con parches vivos) y chocaba con P-31.
- **Un tipo «consumible» dentro de Insumos con una salida «uso del taller» sin orden.** Habría que abrir el candado central del libro y tocar las 4 funciones que abren lotes, y contradecía el «sin estante» que Felipe decidió el 29-oct.
- **Reusar «Suministros y útiles».** Mezcla bolsas, papel y limpieza de las tres sedes; sumar solo el consumible del Taller obligaría a leer cada descripción a mano (lo mismo que ADR-0477 resolvió con Luz y Agua). Con categoría propia, «consumible por prenda» sale después de una división exacta: gasto real del Taller ÷ prendas buenas del mes.

SE ROMPE SI: un consumible empieza a costar mucho o a faltar seguido (agujas especiales que paran el taller). Ahí sí hace falta saber el stock, y habría que pasar al tipo «consumible» en Insumos. También si alguien registra el gasto en una tienda y no en la sede Taller: caería en el resultado de la tienda, no en el del Taller.

### Umbral de activo fijo: ¼ de la UIT, y es un aviso

DECIDÍ: **un bien es activo fijo desde más de ¼ de la UIT por unidad** (S/ 1,375 con la UIT de 2026, S/ 5,500; Reglamento de la Ley del IR art. 23, que deja llevar a gasto «hasta» ese monto, salvo un conjunto necesario para funcionar). Reemplaza el «S/ 150» de ADR-0335, que solo estaba escrito: ni la base ni la pantalla lo hacían cumplir (medido: ningún `150` en migraciones ni en la web). **Se actualiza solo con la UIT**: el ¼ es fijo y la UIT ya vive en Configuración ▸ Impuestos, así que **no hay parámetro nuevo ni migración**. «Registrar activo fijo» muestra un aviso ámbar si el costo sin IGV está en ese monto o por debajo; no bloquea. «Hasta» incluye el tope.

DESCARTÉ: **un candado en la base.** Un conjunto de piezas que solo funcionan juntas sí es activo, y esa decisión es del contador; un candado la haría imposible. **Un parámetro nuevo** (`activo_umbral_uit`): el ¼ lo fija la ley, lo único que cambia es la UIT, y una fila de más obliga a tocar la función que guarda parámetros tributarios.

SE ROMPE SI: la UIT de un año no está cargada (sin ella no se avisa, y se prefiere callar a avisar con un número inventado), o si quien registra no es líder (la lectura de la UIT es solo del líder: ese usuario registra sin ver el aviso).

### Los 10 equipos ya cargados (decisión de Felipe, por grupos)

De los 33 activos de la carga inicial, **16 quedaban bajo S/ 1,375** (S/ 13,084.46). Felipe decidió por grupo:
- **Maquinaria del Taller** (2 Remalladoras SIRUBA a S/ 1,337.70 y la Cortadora de tela) y **muebles y mejoras** (Maniquí, Infraestructura Lima, Oficina Lima): **se quedan como activo.** Las remalladoras son lo que produce, y sus S/ 1,337.70 salen de repartir una compra en partes iguales, así que un contador podría verlas como un conjunto.
- **Equipos de tienda, oficina y cómputo** (3 parlantes JBL, iPhone 12, Aspiradora, Monitor de diseño, 2 Xiaomi, Ventilador, Cámara y tarjeta; **10 filas, S/ 8,388.16**): **pasan a gasto.** Se anula su carga inicial; **no se registra ningún gasto nuevo**, porque las compras son anteriores al 1-oct-2026 (arranque del Balance) y su gasto ya quedó fuera de Finanzas. Lo único que cambia es que dejan de estar en el Balance y de depreciarse.

## Qué se construyó

1. **Migración `20261031195000`:** una fila en `categorias_gasto`, idempotente, con su verificación `QUEDÓ BIEN`. Más su ícono (`regla`, `PencilRuler`, único entre las 21) y 7 casos nuevos en `scripts/pruebas/gastos.mjs` (la cuenta, el orden, la sede Taller, la línea 656 del Estado de resultados que sube exactamente S/ 75.50, la lista de Gastos, sin CLAURE). «Nuevo avío» y su guía dicen que agujas, hilo general y aceite no son avíos.
2. **`lib/activo-umbral-reglas.ts`** (8 pruebas; una mutación del borde la atrapan 2) y el aviso en `RegistrarGastoModal`, alimentado desde `finanzas/gastos/page.tsx`.
3. **`scripts/produccion/2026-10-31-equipos-bajo-umbral-y-consumibles.sql`:** anula los 10 equipos y elimina con motivo las 2 entradas del 31-oct (`eliminar_ingreso_insumo`, ADR-0570 act. 6a: el lote queda en cero y «Restaurar» lo devuelve). **Modo ensayo por defecto**: hace todo, dice qué haría y se deshace solo. Se detiene sin cambiar nada si no hay exactamente 10 equipos por S/ 8,388.16 cargados por una sola persona Admin y Líder, o exactamente 2 ingresos.

## Lo que el ensayo atrapó

El ensayo local (base privada, transacción revertida) encontró **un error mío**: el camino de vuelta para un equipo no puede ser un `update`; la base lo prohíbe (`fn_activos_validar`: «un activo dado de baja o anulado no se modifica»). La vuelta atrás es volver a cargarlo con `cargar_activo_inicial` (como ya decía ADR-0335), y el script imprime esa instrucción lista para cada equipo. Probado: anular los 10, ejecutar esas instrucciones y encontrar los 10 de nuevo en uso por S/ 8,388.16.

## Verificación

- `pnpm pruebas:gastos` (con 7 casos nuevos): todo en verde contra la base local.
- Web: la suite completa (hook del commit) en verde; tipos y lint en verde; `activo-umbral-reglas.test.ts`: 8 casos.
- En el navegador, con login real: con un activo de S/ 300 sale el aviso («Cuesta S/ 254.24 sin IGV: ¼ de la UIT es S/ 1,375.00»), con S/ 2,000 no sale. La verificación visual atrapó un error mío: el texto mostraba el código de escape «u00f1» en vez de la ñ (escapes escritos dentro de JSX, que no los interpreta); corregido, y la misma regla vale para cualquier texto que se escriba en un componente: caracteres reales, no escapes.
- La actividad 3 contra una base local: ensayo, aplicar (10 anulados, 3 siguen activos, 2 lotes en cero con su historia), vuelta atrás y repetición (se detiene con `REVISAR`).

## No verificado

- Nada de esto está en producción, y producción negó la lectura a mitad de la sesión: los 10 equipos y los 2 ingresos se identificaron con una consulta anterior de ese mismo día (nombre, sede, costo y fecha), y el SQL se detiene si no los encuentra tal cual.
- No se abrió «Nuevo avío» en el navegador (solo cambió un texto de ayuda), ni se corrió `tema:auditar`, `guias:recorrer` ni `/chaos` sobre el aviso nuevo.
- Si el SQL Editor de producción acepta el script tal cual (temp tables y bloques `DO`): el script evita `select … into` fuera de un cuerpo `$$` (ADR-0288), pero no se probó en el editor.

## Lo que queda

- **«Consumible por prenda» como lectura derivada** (gasto del Taller ÷ prendas buenas del mes): su lugar es «Resultado por negocio» de ADR-0547, que sigue sin construirse.
- Quien registra el gasto de agujas e hilo necesita ver Finanzas ▸ Gastos: si el encargado del Taller no lo ve, la puerta natural es «Llegó una compra» (ADR-0570 act. 7, sin construir).

## SQL para producción

En este orden, cada uno completo:
1. `supabase/migrations/20261031195000_categoria_gasto_consumibles_del_taller.sql` (una sola parte; su última sentencia debe responder `QUEDÓ BIEN`).
2. `scripts/produccion/2026-10-31-equipos-bajo-umbral-y-consumibles.sql`: primero **tal cual** (modo `ensayo`: debe terminar en un error que empieza con «ENSAYO TERMINADO … 10 equipos por S/ 8388.16 y eliminado 2 ingresos»), y solo entonces cambiando `'ensayo'` por `'aplicar'`. Requiere que `20261030134000` ya esté en producción (lo está desde el 30-oct).
