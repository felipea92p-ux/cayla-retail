# ADR-0349 — Plan de campaña: cuánto comprar para diciembre, con tres escenarios, y compararlo en enero

- Fecha: 2026-10-05
- Estado: aceptado. Felipe decidió el 2026-10-05: tres escenarios, la curva la propone el sistema y la cabecera es la de Ventas e
  Inventario.
- Es la etapa 4 del motor de demanda (ADR-0346/0347) mientras no hay datos. Diseño: `docs/investigacion/2026-10-05-algoritmo-de-inventario.md`, §5.
- Migración `20261005220000_plan_de_campana.sql`. **En producción desde el 2026-10-05** (pegada por el MCP de Supabase con el OK de Felipe; `supabase_migrations.schema_migrations` la registra como versión `20261005203752`, la hora de aplicación, no la del archivo; huella del cuerpo idéntica a la local).

## Problema

Diciembre triplica un mes promedio y es «la decisión del año» (R-19). El motor de demanda no puede sugerir cuánto comprar hasta
tener una temporada completa de datos limpios, y no hay historia fuera del ERP. Hoy la compra de diciembre se decide a ojo, y nadie
puede revisar después qué se supuso.

Comprar «lo que espero vender» además trata igual dos categorías distintas:
- Una donde lo que sobra se vende casi al mismo precio después. Pasarse cuesta poco.
- Otra que pasa de moda. Pasarse cuesta caro.

## Decisión

1. **Compras ▸ Plan de campaña** (`/compras/plan`) es un módulo nuevo, `plan_compra`:
   - Va en el grupo Compras, con orden 195, primero en el menú: se planifica antes de comprar.
   - Nace sin rol (solo el líder) y es delegable (ADR-0161).
   - Muestra costos e inversión, así que pide `verDineroCompras`, como sus hermanas de Compras (ADR-0126). Un rol que reciba el
     módulo necesita también ver el dinero de Compras (Facturas de compra, Por pagar o Notas de crédito).
2. **Por categoría, quien arma el plan llena:**
   - cuántas prendas vendería en un diciembre flojo, uno normal y uno bueno;
   - el precio y el costo promedio;
   - a qué porcentaje del precio vende lo que sobre.
3. **Así decide el sistema cuánto comprar** (`lib/plan-compra-reglas.ts`, modelo del vendedor de diarios):
   - Calcula el cuantil crítico, que compara lo que se pierde por faltar con lo que se pierde por sobrar:
     `(precio − costo) ÷ [(precio − costo) + (costo − lo que se recupera)]`.
   - Los tres escenarios forman una distribución triangular, y se compra hasta ese cuantil menos lo que ya hay libre en la red
     (sin apartados ni Cuarentena).
   - Con eso, la misma venta esperada lleva a comprar más en un básico que en una prenda de moda.
   - Cada número dice su porqué en una línea.
4. **El sistema propone la curva de tallas, que se puede corregir:**
   - Sale de lo vendido en 90 días (con su prenda o anotado «sin registrar»).
   - Se apoya en un reparto parejo con peso n/(n+10): el mismo encogimiento del motor de demanda.
   - Cada talla es un porcentaje entero, y entre todas suman 100.
5. **En enero se ve lo que pasó:** la misma tabla muestra lo que se vendió de verdad dentro de las fechas de la campaña, por
   ejemplo «Se vendieron 140: entre el normal y el bueno». Es el primer dato real para calibrar la etapa 4 del motor.
6. **La base hace imposible un plan incoherente:**
   - flojo ≤ normal ≤ bueno, costo < precio y recupero entre 0 y 100, con CHECK en la tabla;
   - la curva solo lleva tallas de la categoría y suma 100, lo que valida la función;
   - las tablas tienen RLS sin políticas: solo se tocan con `fn_plan_compra` y `guardar_plan_compra_linea`, que piden el módulo
     y firman con `fn_actor_persona_id(true)`.
7. **Guía de foco (ADR-0284):** la ventana de cada categoría dice qué está hecho, qué sigue y qué falta. Usa las mismas reglas
   que la base, y una prueba recorre 20 combinaciones para comprobar que coinciden.

## Alternativas descartadas

- **Un solo número por categoría.** Felipe lo descartó. Con un solo número no se distingue una categoría donde sobrar sale caro
  de una donde no.
- **Esperar al motor para diciembre.** No hay datos para diciembre 2026. Esperar significaría comprar a ojo sin dejar registro.
- **Hacer la hoja en una página fuera del ERP.** En enero no se podría comparar con las ventas reales sin copiarlas a mano.

## Cómo se pega en producción

Una sola parte: tablas nuevas (nadie las usa todavía), un insert del módulo y de la campaña, y dos funciones. No lleva políticas
ni `drop trigger` (ADR-0195), y es idempotente.

## Cómo se verificó

- `pnpm pruebas:plan-compra`: 6 de 6. Cubre:
  - el módulo sin rol;
  - las puertas: 42501 sin el módulo y nada directo a las tablas;
  - los cinco rechazos con su mensaje;
  - guardar dos veces deja una sola línea;
  - la hoja trae la línea, el stock libre, la curva de 90 días (no cuenta ventas futuras) y lo vendido dentro de la campaña.
- `vitest`: `plan-compra-reglas` (45, incluida la guía contra la validación), `menu` y `modulos`. Las líneas base del menú del
  líder suman «Plan de campaña» primero en Compras.
- En el navegador local llené Camisas y Blusas: flojo 300, normal 450, bueno 650, precio 69,90, costo 28 y 40 % de recupero.
  - La guía encendió cada campo en orden.
  - El resultado fue «Comprar 315 · S/ 8.820,00», con la curva repartiendo las 315 prendas.
  - Al guardar salió el aviso y la tabla se actualizó.

  Después borré esa línea de prueba de la base local.
