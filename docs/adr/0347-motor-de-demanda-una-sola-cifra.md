# ADR-0347 — Motor de demanda, etapa 1: una sola cifra de demanda, y su primer uso en Producción

- Fecha: 2026-10-05
- Estado: aceptado. Felipe decidió el 2026-10-05 que la cifra del motor va al lado de la sugerencia de Producción, sin reemplazarla.
- Sigue a ADR-0346 (cuándo puede hablar el motor). Diseño completo: `docs/investigacion/2026-10-05-algoritmo-de-inventario.md`, capas 1 y 2.
- Migración `20261005215000_motor_demanda_lectura.sql`: una función de lectura. **En producción desde el 2026-10-05** (pegada por el MCP de Supabase con el OK de Felipe; `supabase_migrations.schema_migrations` la registra como versión `20261005203655`, la hora de aplicación, no la del archivo; huella del cuerpo idéntica a la local).

## Problema

«Cuánto se vende» tiene una definición distinta en cada pantalla:

| Pantalla | Cómo calcula «cuánto se vende» | Qué falla |
|---|---|---|
| Motor del piso | Lo vendido ÷ 14 días | No mira si la prenda estuvo colgada |
| Análisis | Lo vendido ÷ días con stock | — |
| Producción | Suma lo que dice Análisis | — |
| Catálogo | Salidas ÷ 30 días | No descuenta cambios ni anuladas |

Además, en CAYLA los modelos no se repiten. Una prenda vende 1 o 2 en toda su vida en una tienda, y su ritmo propio es ruido.
Y un día en que la prenda no estuvo a la vista no es un día sin demanda. Si se cuenta como tal, el sistema deja de reponer lo que
se agota.

## Decisión

1. **La base entrega la materia prima de la cifra:** `retail.fn_demanda_sede(p_ubicacion_id, p_dias default 28)`. Cuenta en días
   cerrados (hoy no cuenta) y desde el día siguiente al último cuadre del piso. Entrega:
   - **Por prenda:**
     - Lo que el cliente se llevó, con la misma definición que `fn_piso_plan_lectura`. Una prueba exige que den lo mismo.
     - Las jornadas de Lima en que estuvo colgada al menos 10 minutos seguidos. Salen del libro único (`fn_ledger_puntos`, cubeta
       `piso`), y los 10 minutos son los de Frescura.
     - Lo libre hoy en piso y almacén.
   - **Por grupo (categoría × talla × familia de color):**
     - Las ventas «sin registrar» que siguen sin prenda, pendientes o cerradas, con el contrato de ADR-0334.
     - Las jornadas en que hubo alguna prenda del grupo colgada.
2. **La cuenta vive en `lib/demanda-reglas.ts`.** Cada prenda se apoya en su grupo con un encogimiento gamma-Poisson:
   `ritmo = (vendidas + K·r_grupo) ÷ (días colgada + K)`, con `K = 14` días-prenda. Con 2 días colgada manda el grupo; con 60
   manda la prenda. Si no hay ventas ni días colgada, el resultado es `null`: no se inventa nada.
3. **Solo hablan las tiendas que cumplen ADR-0346.** Una tienda que no los cumple no suma nada a la red: ni un cero ni su número.
4. **El primer uso es «Nueva orden» de Producción**, que solo ve el líder. El bloque «Lo que dice el motor de demanda» va dentro de
   «Lo que dice la red», debajo de la curva de siempre:
   - Su curva se calcula sobre el mismo disponible que la curva de siempre, así que la única diferencia entre las dos es el ritmo.
   - Tiene un botón «Usar la del motor».
   - Muestra «Se vendió rápido y falta» en la categoría del modelo: los grupos cuyo stock, al ritmo de la red, no alcanza 14 días.
   - Si ninguna tienda puede hablar, muestra una línea por tienda que dice por qué (`fraseDelMotor`).

## Lo que se encontró al probar

`fn_ledger_puntos` sin lista de prendas devuelve solo las prendas que se movieron dentro de la ventana. Una prenda colgada todo
el mes sin que nadie la tocara salía con 0 días de exposición. Con una lista, devuelve solo las de la lista, así que una prenda
agotada ayer se perdía. La lista correcta es lo que la tienda tiene hoy más lo que se movió en ella durante la ventana. Lo vigilan
las pruebas K1 y E2. **Ojo:** cualquier otra función que lea el libro sin lista tiene el mismo hueco.

## Alternativas descartadas

- **Reemplazar ya la curva de Producción.** Felipe lo descartó: mientras ninguna tienda llegue al 90 %, Producción se quedaría
  sin sugerencia.
- **Reusar `fn_resumen_comparacion` o `fn_ritmo_reciente_json`.**
  - La primera exige el módulo Análisis y trae costos.
  - La segunda cuenta las ventas en la fecha en que se movió el libro: una venta regularizada caería en el día en que se
    regularizó, no en el día en que se cobró.
  - Ninguna empieza en el cuadre del piso.
- **Pronosticar por prenda sin grupo.** Con una venta por prenda, sería memorizar ruido. Es la trampa de sobreajuste de la
  investigación.

## Qué no hace todavía

- No toca el motor del piso, ni Análisis, ni Frescura. Pasarlos a esta cifra es la otra mitad de la etapa 1, y esas pantallas
  tienen dueños activos (ver `docs/SESIONES-ACTIVAS.md`).
- La talla rota y los traslados con cantidad (etapa 2) van a Inventario ▸ Tareas (ADR-0345), por decisión de Felipe. Se conectan
  cuando Tareas esté en main.
- La venta perdida todavía no entra en la cifra: hace falta que «Anotar que no había» guarde la prenda y el color (ADR-0348).

## Cómo se verificó

- `pnpm pruebas:motor-demanda-lectura`: 9 de 9. Cubre:
  - puertas;
  - exposición: 3 jornadas, 5 minutos que no cuentan, hoy fuera, el almacén fuera, la prenda agotada ayer;
  - la ventana desde el cuadre;
  - vendidas: anuladas, de prueba y la centinela fuera, y que el total sea igual al del motor del piso;
  - anotadas: pendientes y cerradas cuentan, anuladas no.
- `vitest lib/demanda-reglas.test.ts`: 22 de 22.
- En el navegador local, Nueva orden de producción muestra el bloque. Con los datos locales ninguna tienda puede hablar, así que
  muestra una línea por tienda que dice por qué. Sin errores en consola ni en el servidor.
