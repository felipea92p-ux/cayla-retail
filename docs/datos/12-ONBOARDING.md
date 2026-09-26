# Tu primer día con la base de datos de CAYLA

> Esta es la ruta de lectura y trabajo para alguien que entra hoy al equipo. Está
> diseñada para que al final del día **entiendas el modelo y hayas hecho un cambio
> real de punta a punta** — no para que hayas leído mucho.
>
> Sirve igual para una persona nueva y para un agente de IA que entra a este repo por
> primera vez.

---

## Antes de empezar: las dos cosas que te van a confundir

Te las decimos ahora para que no pierdas la mañana en ellas. Las dos son reales, las
dos ya le costaron horas a alguien del equipo.

**1. En esta máquina hay DOS bases de datos locales, y la que viene por defecto NO es
la nuestra.** El otro sistema de CAYLA (el de personal) corre en el puerto 54321, que
es el puerto por defecto de Supabase. El nuestro corre en **54421**. Apuntar al
equivocado no explota: catálogo, stock y ventas responden normal, y solo fallan
las pantallas nuevas. Se diagnostica como un bug del código durante una hora.

Antes de creerle a cualquier síntoma raro:

```bash
pnpm local:donde
```

**2. Tu base local y la de las tiendas no son la misma.** Producción tiene **45 tablas
+ 2 vistas** en `retail` (verificado el 2026-09-12); las migraciones del repo crean 44.
Y la diferencia no va en la dirección que uno esperaría: **hay tablas y funciones vivas
en producción que ningún archivo del repo crea**. O sea que "funciona en mi máquina" es,
aquí, literalmente cierto y literalmente insuficiente — y "lo reconstruyo desde el repo"
te da una base distinta a la real.

Antes de asumir que algo está roto, corre `pnpm datos:comparar` y mira
`generado/DRIFT.md`: te dice si esa pantalla está rota en las tiendas o solo en tu
cabeza.

---

## Mañana — entender (2-3 horas)

### 1. El mapa (30 min)
Lee **[`00-MAPA.md`](00-MAPA.md)** entero. No saltees las **seis frases que hay que
entender sí o sí**: son el 80% del sistema.

Al terminar deberías poder responder sin mirar:
- ¿Por qué `movimientos` nunca se borra?
- ¿Cuál es la diferencia entre `stock` y `stock_almacen`?
- ¿Qué es una variante y por qué el stock cuelga de ahí y no del producto?
- ¿Qué separa a una sede de otra?

Si alguna te cuesta, vuelve al mapa antes de seguir. Todo lo demás se apoya en eso.

### 2. Los candados (20 min)
Lee **[`01-INVARIANTES.md`](01-INVARIANTES.md)**. Es corto a propósito. Es la lista
de cosas que la base **impide** que pasen: stock negativo, dos cajas abiertas en una
sede, un asiento contable descuadrado, una factura sin RUC.

La idea de fondo del sistema es esta: **si un estado imposible se puede alcanzar, el
diseño está mal, no el código**. No se parcha con una validación en el formulario, se
arregla el esquema.

### 3. Tu módulo (40 min)
Abre el archivo del módulo en el que vas a trabajar, en
[`modulos/`](modulos/). Lee la sección "Para qué existe", el diagrama, y **los huecos
conocidos**. Los huecos conocidos te van a ahorrar más tiempo que cualquier otra
sección: son las cosas que ya sabemos que están mal y que podrías tardar días en
descubrir solo.

Averigua **quién es el pájaro** de tu módulo (en
[`07-GOBIERNO.md`](07-GOBIERNO.md)). Es la persona a la que le vas a preguntar.

### 4. El vocabulario (10 min)
Lee la sección de vocabulario de `CLAUDE.md`, en la raíz del repo. Es corta y es
obligatoria:

- Nunca "empleado", "jefe" ni "sucursal".
- Se dice **colaborador / integrante**, **líder de equipo**, **sede / tienda /
  boutique**, **clienta** (la compradora final).
- Las tablas están en español. No se renombran.
- Los comentarios que explican lógica de negocio van en español; los nombres de
  variables y funciones siguen la convención estándar en inglés.

---

## Mediodía — levantar el entorno (1 hora)

```bash
pnpm install
npx supabase start
```

Eso levanta Postgres, la API, autenticación y el panel; aplica todas las migraciones;
y corre el archivo de semilla, que mueve las tablas al schema `retail` (igual que
producción) y siembra lo mínimo para poder entrar.

Copia las claves que imprime a `apps/web/.env.local`:

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
pnpm dev
```

Entra en `http://localhost:3000` con **felipe@cayla.local** / **cayla-local**.

**Lo que no funciona en local, a propósito:** subir fotos de producto (el servicio de
archivos está apagado porque hacía fallar el arranque entero). Todo lo demás funciona
igual que en las tiendas.

**El catálogo llega vacío y es deliberado.** Los SKUs son reales y se cargan por la
pantalla de recibir mercadería. Un catálogo de juguete haría que el módulo de
inteligencia mienta, y mentiría de forma creíble.

Para volver todo a cero:

```bash
npx supabase db reset
```

---

## Tarde — hacer un cambio real (2-3 horas)

No leas más. Haz el ejercicio completo, aunque el cambio sea diminuto. **Lo que se
aprende es el circuito, no el cambio.**

### El ejercicio

Agrega una columna a una tabla que no sea del núcleo — por ejemplo, un campo de
notas en `proveedores` — y llévala de punta a punta:

1. **Escribe la migración** con `npx supabase migration new <nombre>`: nace con
   timestamp, nunca con «el número siguiente» (ADR-0034). **Con el prefijo `retail.`** en
   cada tabla, o `set search_path = retail, public, extensions;` al inicio: el Postgres
   local vive en `retail` igual que producción, y ese mismo archivo es el que se pega.
2. **Aplícala en local:** `npx supabase db reset`.
3. **Regenera los tipos** y mira el diff. Si aparecen dos firmas de la misma función,
   algo salió mal — lee el paso 5 de la lista de `07-GOBIERNO.md`.
4. **Regenera el diccionario:** `pnpm datos:generar`. Tu columna nueva tiene que
   aparecer ahí. Si no aparece, el cambio no está terminado.
5. **Úsala en una pantalla.** Una sola, la más simple.
6. **Commitea.** El hook de pre-commit va a revisar tipos, pruebas y estilo **solo de
   los archivos de tu commit** (tarda ~19 segundos). Los errores en archivos que no
   son tuyos avisan pero no te frenan: en este repo suele haber más de una sesión
   trabajando a la vez.

Cuando termines eso, ya sabes operar. Lo demás es conocer el negocio.

---

## Lo que puedes tocar sin preguntar, y lo que no

### Adelante, sin preguntar
- Pantallas y componentes de un módulo ya definido.
- Consultas de lectura, cálculos, reportes.
- Migraciones **en local** para probar una idea.
- Refactors dentro de un módulo.

### Pregunta primero, al pájaro del módulo
- Cualquier cambio a `movimientos`, `stock` o `stock_almacen`. **Ese es el núcleo:**
  se diseñó una vez, bien, y no se toca sin una razón de peso.
- Agregar o quitar un candado (constraint, índice único, trigger).
- Cambiar una función que escribe en la base.
- Cualquier cosa que toque dos módulos a la vez.

### Nunca, sin Admin
- **Pegar SQL en la base de las tiendas.** Solo Felipe, y queda anotado (D-11).
- **Borrar datos.** Nunca un `DELETE` en `movimientos` ni en catálogos con historial.
  Se archiva o se marca, no se borra.
- Tocar integraciones que mueven dinero real (SUNAT, el proveedor de facturación,
  pagos).

---

## Las cinco cosas que hoy están rotas y conviene que sepas

No para desanimarte: para que no pierdas tiempo diagnosticando lo que ya sabemos.

1. **La venta y su boleta no están unidas.** No se puede cuadrar lo vendido contra lo
   facturado. Decidido que se unan (D-34), aún no hecho.
2. **El libro contable no se llena solo.** Ninguna venta ni gasto postea un asiento.
   Los estados financieros se calculan por otro camino.
3. **No hay una sola prueba automática sobre el núcleo de stock.** Los cuatro errores
   de esa familia se encontraron a mano, y dos llevaban meses escondidos.
4. **Hay dos caminos de migración** (`supabase/migrations/` para local,
   `supabase/unificacion/` para producción). Es deuda declarada, con plan de salida.
5. **El historial todavía se puede borrar.** No hay candado físico que lo impida;
   lo sostiene la costumbre. Decidido ponerlo (D-22).

La lista completa, con nombre y apellido, está en
[`13-PROMESAS-INCUMPLIDAS.md`](13-PROMESAS-INCUMPLIDAS.md).

---

## Tu primer mes

| Semana | Qué deberías poder hacer solo |
|---|---|
| 1 | Levantar el entorno, leer el mapa, hacer una migración de punta a punta |
| 2 | Trabajar en tu módulo sin preguntar por dónde empezar; entender el historial de movimientos |
| 3 | Diagnosticar un problema de stock mirando `movimientos`, no adivinando |
| 4 | Proponer un cambio de esquema con su nota de decisión, y defenderlo ante el pájaro del módulo |

---

*Decisiones que gobiernan este archivo: D-01 (el trabajo principal de esta
documentación es el onboarding en un día), D-02 (para quien codea y para agentes de
IA).*
