# Gobierno del dato — quién manda sobre qué

> Con 6 personas tocando la misma base, la pregunta "¿puedo cambiar esta tabla?" no
> puede responderse con criterio personal. Este archivo dice **quién decide**, **qué
> hay que hacer antes de cambiar algo**, **quién puede tocar la base de las tiendas**,
> y **qué hacer cuando dos personas trabajan a la vez sobre lo mismo**.
>
> El *cómo* se pega un cambio en producción, paso a paso, vive en `08-OPERACION.md`.
> Acá está **quién puede** y **qué tiene que haber escrito antes**.

---

## 1. Los pájaros

Cada módulo tiene un dueño. El dueño no es quien escribe todo el código de ese
módulo: es **a quién hay que preguntarle antes de cambiarle el esquema**, y quien
responde cuando algo ahí se rompe.

El apodo existe para que la responsabilidad se pueda nombrar sin que suene a
organigrama. "Eso es de Halcón" es una frase que se dice en un pasillo; "eso es del
área de gestión de inventario" no.

| # | Pájaro | Módulo | Lo lleva | Por qué ese pájaro |
|---|---|---|---|---|
| 01 | **Ganso** | Identidad y acceso | _libre_ | Grita cuando entra alguien que no debería. Los gansos son mejores guardianes que los perros |
| 02 | **Loro** | Catálogo y vocabulario | _libre_ | Nombra y repite. Este módulo decide cómo se llama cada cosa, y esa palabra se repite en toda la empresa |
| 03 | **Tucán** | Taxonomía universal | _libre_ | Pico enorme para un trabajo de clasificar |
| 04 | **Golondrina** | Importación de catálogo | _libre_ | Llega de afuera trayendo todo de golpe |
| 05 | **Halcón** | **Inventario y movimientos** | _libre_ | No se le escapa nada. Es el núcleo: el pájaro más pesado de llevar |
| 06 | **Lechuza** | Conteo y censo físico | _libre_ | Cuenta de noche, cuando la tienda está cerrada |
| 07 | **Colibrí** | Ventas y caja | _libre_ | Rápido o no sirve |
| 08 | **Cuervo** | Facturación SUNAT | _libre_ | Formal, memorioso, se acuerda de todos los papeles |
| 09 | **Pelícano** | Compras y proveedores | _libre_ | Carga en el buche lo que todavía no se usó |
| 10 | **Gallito** | Producción del Taller | _libre_ | El gallito de las rocas es peruano y hace ruido cuando trabaja |
| 11 | **Garza** | Finanzas operativas | _libre_ | Paciente, parada en el agua, esperando que cuadre |
| 12 | **Urraca** | Contabilidad | _libre_ | Junta todo, lo archiva y no suelta nada — y sabe distinguir lo que brilla de lo que no |
| 13 | **Águila** | Inteligencia y reportes | _libre_ | Ve el patrón desde arriba antes que nadie |
| 14 | **Gorrión** | Plataforma y esquema | _libre_ | Está en todos lados y nadie lo nota hasta que falta |

**El pájaro es el puesto, no la persona.** Nadie reparte los pájaros desde arriba:
**cada uno se apunta al suyo**. Se dice "yo estoy en Loro", "yo llevo Colibrí", y con
eso el equipo ya sabe a quién preguntarle sin consultar ningún organigrama.

**Cómo te apuntas:** editas **una línea** de la tabla de arriba —pones tu nombre en la
columna «Lo lleva»— y la commiteas. Eso es todo. Queda a la vista de los seis y el
`git log` registra desde cuándo.

**Tres reglas y ninguna más:**
- Una persona puede llevar **varios pájaros** (son 14 y somos ~6, así que va a pasar).
- Un pájaro puede llevarlo **más de una persona**, si de verdad lo comparten.
- **Ningún pájaro puede quedarse en `_libre_` para siempre.** Un módulo sin nadie
  encima es un módulo donde cualquiera cambia lo que quiere y nadie responde cuando se
  rompe. Si al mirar esta tabla ves varios `_libre_`, eso no es una tabla incompleta:
  es una lista de riesgos.

**Si nadie quiere un pájaro**, eso también es información: probablemente ese módulo
está mal entendido o mal documentado. Se arregla el documento antes de forzar a
alguien a cargarlo.

**Regla del pájaro ausente:** si el dueño de un módulo no está disponible y el cambio
no puede esperar, decide Admin (Felipe) y se anota en la nota del cambio quién decidió
y por qué no se esperó.

### Qué hace un dueño de módulo, en concreto

Un pájaro **no** es "el único que puede tocar eso" ni "el que escribe todo el código
de ahí". Son cuatro cosas, y ninguna es un cargo:

1. **A quién le preguntas primero** antes de cambiarle el esquema a una de sus tablas,
   sin tener que escalar a Felipe.
2. **Quien revisa el cambio** antes de que llegue a producción, cuando toca su módulo.
3. **A quien se llama cuando algo de ahí se rompe** a las 8 de la noche.
4. **Quien mantiene honesto su archivo** en `modulos/`. Si su tabla cambió y el
   documento sigue diciendo lo de antes, esa deuda es suya.

### De quién es cada tabla

Esto es el índice de ruteo: **tienes un nombre de tabla, quieres el pájaro**. El
*porqué* de cada tabla está en su módulo; acá solo está a quién le toca.

| # | Pájaro | Tablas que cubre (nombre exacto en el schema `retail`) |
|---|---|---|
| 01 | Ganso | `personas` *(vista)*, `sedes` *(vista)*, `sede_meta` |
| 02 | Loro | `productos`, `variantes`, `categorias`, `colores`, `codigos_barras`, `codigos_correlativos`, `producto_atributos` |
| 03 | Tucán | `taxonomia_versiones`, `taxonomia_categorias`, `taxonomia_atributos`, `taxonomia_valores`, `taxonomia_categoria_atributos` |
| 04 | Golondrina | `importaciones` |
| 05 | **Halcón** | `movimientos`, `stock`, `stock_almacen`, `contenedores`, `lotes` |
| 06 | Lechuza | `conteos`, `conteo_lineas` |
| 07 | Colibrí | `ventas`, `cajas`, `proformas` |
| 08 | Cuervo | `comprobantes`, `series_comprobantes`, `sede_datos_fiscales`, `configuracion_empresa` |
| 09 | Pelícano | `proveedores`, `ordenes_compra`, `ordenes_compra_items` |
| 10 | Gallito | `producciones`, `produccion_lineas`, 💀 `ordenes_produccion`, 💀 `bom_items` |
| 11 | Garza | `gastos`, `depositos_bancarios`, `ajustes_efectivo` |
| 12 | Urraca | `cuentas_contables`, `asientos`, `asiento_lineas`, `activos_fijos`, `patrimonio_items` |
| 13 | Águila | `ventas_historicas_mensuales` (la única propia; el resto lo **lee**, no lo escribe) |
| 14 | Gorrión | `migraciones_aplicadas`, y las carpetas `supabase/migrations/` y `supabase/unificacion/` |

💀 = tabla muerta: sigue existiendo porque nunca se borra estructura con historial,
pero **ninguna pantalla nueva escribe ahí** (ver `modulos/10-produccion-del-taller.md`).

**La suma cierra: 47 objetos.** 3+7+5+1+5+2+3+4+3+4+3+5+1+1 = 47, que son las **45
tablas + 2 vistas** que tiene el schema `retail` en producción (verificado contra la
base el 2026-09-12). Ninguna quedó sin pájaro y ninguna tiene dos. Si mañana nace una
tabla nueva, nace con dueño o no nace.

**Cuatro repartos que no son obvios y por qué son así:**

- **`sede_datos_fiscales` y `configuracion_empresa` están en Facturación, no en
  Identidad**, aunque hablen de la sede. Lo que guardan —RUC, razón social,
  `resolucion_autorizacion`, dirección, ubigeo— es exactamente lo que se imprime en la
  boleta. Si se rompen, lo que se rompe es un comprobante.
- **`proformas` está en Ventas, no en Facturación.** Una proforma es la cotización que
  se le da a la clienta en el mostrador; nunca viaja a SUNAT. Recién cuando alguien
  corre `convertir_proforma_a_comprobante` el asunto cruza al módulo 08.
- **`activos_fijos` y `patrimonio_items` están en Contabilidad, no en Finanzas
  operativas.** Finanzas operativas es la plata del día (gasto, depósito, cuadre de
  efectivo); esas dos son posiciones de balance.
- **El módulo 13 casi no tiene tablas propias, y eso es correcto.** Águila lee
  `movimientos`, `ventas`, `stock` y `producciones`. El día que empiece a escribir sus
  propias tablas de resumen, esas tablas nacen bajo Águila.

**Dos avisos sobre esa lista, para que nadie la use mal:**

- `personas` y `sedes` **no son tablas: son vistas** sobre el schema `public` (el
  sistema de personal). Ganso no es dueño de la fuente del dato, es dueño de la
  frontera. Cambiarle una columna a esa vista es negociar con el otro sistema, no
  escribir una migración — ver `14-DYNAMIC.md`.
- La `sede_meta` de producción la crea `supabase/unificacion/01_sedes.sql:19` con otro
  nombre (`public.retail_sede_meta`) y `03_candados.sql:18` ya hace join contra
  `retail.sede_meta`. **El archivo que hace el renombrado no está en el repo.** Es de
  Gorrión, y es deuda abierta (`modulos/14-plataforma-y-esquema.md`, hueco 2).

### Ser dueño de un módulo que todavía no existe

Varios de los 14 están en cero: `cuentas_contables`, `asientos` y `asiento_lineas` con
0 filas; `gastos`, `depositos_bancarios` y `ajustes_efectivo` con 0 filas;
`importaciones` con 0 filas; `conteo_lineas` con 0 filas. Y hay cosas decididas y sin
tabla: los insumos del Taller (D-47), las clientas (D-48), el cierre con llave (D-23),
las cuentas por pagar (D-46).

**El trabajo del pájaro de un módulo vacío no es esperar. Es que nadie invente un
esquema paralelo mientras tanto.** Cuatro cosas:

1. **Ser la ventanilla única.** Quien necesita guardar algo que "va ahí" pasa por él.
   Así es como se evita que aparezcan `clientes`, `clientas` y `clientes_fidelizacion`
   creadas por tres personas distintas en la misma semana.
2. **Escribir el hueco antes que la tabla.** El archivo del módulo se escribe igual,
   diciendo con esas palabras **"decidido, no construido"**, qué tabla o función haría
   falta, y qué decisión lo respalda.
3. **Decir en voz alta lo que hoy se está disfrazando.** Casi siempre lo que falta ya
   está pasando por otro lado: las devoluciones de clienta se registran hoy como ajuste
   de stock porque no existe el tipo `devolucion` en `movimientos` (D-43). Eso es dato
   sucio acumulándose, y el pájaro del módulo lleva la cuenta de cuánto.
4. **No dejar que se use "provisionalmente" la tabla de otro.** Meter el gasto del
   Taller dentro de `producciones` porque `gastos` todavía no se usa es la clase de
   atajo que después cuesta una migración de datos.

**Ganas:** el día que el módulo se construya de verdad, se construye sobre una decisión
escrita y no sobre tres tablas improvisadas que hay que fusionar. **Pagas:** alguien
tiene que decir que no durante los meses en que el módulo es solo un plan, y decir que
no siempre se siente como frenar.

> **Nota para quien conoció la tabla vieja de 6 dominios:** ahí Colibrí era catálogo,
> Cuervo era ventas y Gorrión era producción. Los tres pájaros los nombró Felipe y se
> conservan, pero cambiaron de módulo al pasar de 6 a 14. **Manda la tabla de arriba**,
> que es la misma de `00-MAPA.md` y del `README.md`.

---

## 2. Los cuatro niveles de permiso

Un solo vocabulario para los dos sistemas de CAYLA (Retail y el de personal). Antes
había dos vocabularios distintos para lo mismo, y eso obligaba a traducir mentalmente
cada vez que se cruzaba de un sistema al otro.

| Nivel | Alcance | Qué puede |
|---|---|---|
| **Admin** | Todas las sedes | Todo. Es el único que pega SQL en producción |
| **Líder de equipo** | Su sede (y otra temporalmente, con vencimiento) | Cerrar la caja del día · Ver costos y márgenes · Ajustar stock sin venta · Registrar gastos y depósitos · Ver las métricas de su sede |
| **Integrante** | Su sede | Vender, recibir mercadería, mover entre piso y almacén de su sede, contar |
| **Solo lectura** | Lo que se le habilite | Ver. No toca nada. Pensado para el contador externo |

> **Por qué "Líder de equipo" y no "Encargada":** en las tiendas de CAYLA hay hombres
> y mujeres. El vocabulario de la casa (`CLAUDE.md`) ya manda "líder de equipo /
> encargado de sede" y nunca "jefe" ni "empleado". Es el mismo puesto, con el nombre
> que no deja gente afuera.

**Estado real hoy:** el sistema solo conoce **dos** niveles (`lider` / `integrante`).
Admin y Solo lectura están decididos (D-12) y **no construidos**. Mientras no lo
estén, un Líder de equipo tiene sobre la plata el mismo poder que Felipe.

### Lo que la base dice de verdad, y es peor que "faltan dos niveles"

Tres hechos verificados contra producción el 2026-09-12. Los tres cambian quién puede
qué **hoy**, no en el plan:

- **En producción, "Líder" quiere decir `admin` a secas.**
  `supabase/unificacion/03_candados.sql:62-64` define
  `retail.es_lider()` como `coalesce(public.fn_rol_actual() = 'admin', false)`. El rol
  `supervisor_sede` **no pasa ese candado**. Consecuencia operativa: dar de alta
  catálogo en una tienda, hoy, solo lo puede hacer Felipe. La función que sí lee ese
  rol —`retail.es_supervisor()`, definida tres líneas abajo— **no la llama ninguna
  policy ni ninguna RPC**: existe y está muerta.
- **El hueco del NULL está abierto en local y cerrado en producción — al revés de lo
  que se suponía.** `supabase/unificacion/03_candados.sql:76-79` envuelve las dos ramas
  de `puede_operar_sede` en `coalesce(..., false)`. El local no:
  `supabase/migrations/0012_rpc_valida_sede.sql:15-27` deja
  `p_sede_id = fn_sede_actual_persona()` sin envolver, y si esa función devuelve NULL la
  expresión entera da NULL. En una policy de RLS, NULL deniega. En el `if not
  fn_puede_operar_sede(...) then raise exception` que usan todas las RPC del repo,
  **`not null` no es true y la excepción no se dispara**: el permiso pasa solo.
- **Producción está adelante, no atrás.** Ese `coalesce` lo parchó alguien a mano y
  nunca quedó escrito; el archivo del repo siguió con la versión floja. O sea: **volver
  a pegar el archivo del repo deshacía el arreglo en silencio.** Se corrigió el archivo
  el 2026-09-10, y `unificacion/36_candados_no_null.sql` es el paso suelto para una base
  que haya recibido la versión vieja.

El detalle campo por campo de los roles, con la traducción de `mapearRol()`
(`apps/web/lib/persona.ts:47-51`), está en `modulos/01-identidad-y-acceso.md`. No se
repite acá.

---

## 3. Qué hay que hacer antes de cambiar el esquema

**La regla corta:** una migración no está terminada hasta que su tabla está en el
diccionario y su porqué está escrito.

**La lista completa**, en orden:

0. **Mirar si alguien más ya lo está haciendo.** `git status --short` y los archivos
   tocados en las últimas horas. Es el paso que más barato es y más caro sale saltarse
   — ver §6.
1. **¿Es realmente un cambio de esquema?** Agregar una columna, una tabla, un
   candado, un índice, una policy o una función: sí. Cambiar una consulta: no.
2. **Avisarle al pájaro** del módulo que toca. Si toca dos módulos, a los dos.
3. **Escribir el porqué** — una nota corta (§7) con tres cosas: qué cambié, por qué
   así, y qué se rompería sin esto. No hace falta que sea largo; hace falta que exista.
4. **La migración va en `supabase/migrations/`**, sin el prefijo `retail.`, numerada
   en secuencia **mirando `origin`, no la carpeta local** (§6).
5. **Si reemplazas una función y le cambias los parámetros, borra la firma vieja
   explícitamente.** En Postgres, reemplazar una función con parámetros distintos **no
   la reemplaza: crea una segunda**, y cuál de las dos atiende cada llamada depende de
   los tipos que mande la pantalla. Así llegaron a convivir dos versiones de
   `recibir_lote` en producción sin que nadie lo notara (ADR-0004). El arreglo está en
   `supabase/migrations/0049_una_sola_firma_por_funcion.sql` y en
   `unificacion/31_una_sola_firma_por_funcion.sql`.
6. **Regenerar los tipos y el diccionario, y comprobar que no aparecen firmas
   duplicadas.** *Estado hoy:* **producción no tiene ninguna función con firma
   duplicada** (verificado 2026-09-12; ADR-0026 ya la había medido limpia el 09-09).
   Eso es una foto, no una garantía: el paso 5 es lo que la mantiene así.
7. **Correr las dos alarmas, no una:**
   ``
   pnpm datos:generar     # reescribe el diccionario desde la base
   pnpm datos:comparar    # avisa si una pantalla llama a algo que producción no acepta
   ``
   `datos:comparar` es el que encuentra lo que `typecheck` no puede: **la pantalla
   contra la base real.** Hoy encuentra dos rotas, y lo están en las tiendas ahora mismo
   (§8).
8. **Commitear el diccionario regenerado** junto con la migración, en el mismo commit.
   Separarlos es cómo se empieza a no creerle al diccionario.
9. **Anotar en la bitácora** qué se hizo, y dejar la fila en `migraciones_aplicadas`
   cuando el script se pegue en producción (§4).

**Lo que NO necesita todo esto:** una corrección de un dato, una consulta nueva, un
cambio de pantalla que no toca la base. Ahí se ejecuta directo.

### Por qué la nota corta y no un proceso de aprobación

Se evaluaron tres formas. La elegida es la primera, y el motivo está en lo que cuesta
cada una:

**1. Nota corta antes de cambiar — la elegida (D-10).** Antes de escribir el SQL,
alguien escribe 3-5 líneas. **Ganas:** cero fricción real —tres líneas se escriben en
un minuto— y queda el rastro de por qué existe cada cosa, que es justo lo que este
directorio necesita para no envejecer. **Pagas:** depende de la disciplina de cada
quien; nadie te obliga si tienes prisa.

**2. Nota + visto bueno del pájaro antes de aplicar.** **Ganas:** dos personas piensan
el cambio antes de que sea permanente, y el esquema de datos es lo más caro de deshacer
una vez que hay datos reales adentro. **Pagas:** frena a quien quiere avanzar un sábado
sin nadie despierto para revisar.

**3. Cambiar y ya, sin nota.** **Ganas:** velocidad ahora mismo. **Pagas:** es
exactamente cómo se llegó a las dos versiones de `recibir_lote` conviviendo en
producción hasta que los tipos generados salieron raros. El costo no es teórico: ya se
pagó una vez.

**Empieza con la 1.** Es la que ya funciona con los ADR de código; extenderla al
esquema es gratis. Si en unos meses se cuela un cambio mal pensado, sube a la 2 — pero
arrancar con la 2, con 6 personas y ritmo alto, frena más de lo que protege.

### La plantilla exacta

```
## Cambio: <nombre corto>
QUÉ CAMBIÉ: <una línea — la tabla/campo/función>
POR QUÉ ASÍ: <1-2 líneas — el problema real que resuelve>
QUÉ SE ROMPERÍA SIN ESTO: <1-2 líneas>
A QUÉ PÁJARO TOCA: <uno o dos módulos, por nombre>
```

Va como ADR nuevo en `docs/adr/00NN-nombre.md` si es estructural (una tabla nueva, un
cambio de modelo), o como comentario en la cabecera de la propia migración si es menor
(un campo opcional, un índice). Es la misma regla del resto del repo — `CLAUDE.md`,
principio 8.

**La última línea es la que no estaba antes.** Decir a qué pájaro toca es lo que
convierte la tabla del §1 en algo vivo en vez de un cuadro decorativo.

---

## 4. Quién puede tocar la base de las tiendas

**Solo Admin (Felipe). Y queda anotado.**

Los cambios a producción se pegan a mano en el SQL Editor del proyecto de Dynamic. Los
demás escriben la migración, la prueban en su máquina y la dejan lista; **el paso final
tiene un solo responsable.**

**Por qué una sola mano:** cuando algo no coincide entre tu máquina y las tiendas —y ya
pasó varias veces— la primera pregunta es *"¿quién cambió qué allá?"*. Con dos o más
personas pegando SQL sin registro, esa pregunta no tiene respuesta y la única salida es
comparar tabla por tabla.

**El registro:** `retail.migraciones_aplicadas` (`archivo` como llave primaria,
`aplicada_at`, `nota`) existe para esto. Cada script pegado deja su fila. Si una fila
falta, el estado de producción es una suposición, no un hecho.

**Y hoy es, en parte, una suposición.** El backfill sembró **17 filas**
(`unificacion/38_migraciones_aplicadas.sql:75-95`), de las cuales **11 dicen "según
BACKLOG.md, no re-verificado hoy"** — la fecha viene de lo que escribió otra sesión, no
de una medición. El volcado de producción reporta **18**, y esa fila de más no la
explica ningún archivo del repo. El procedimiento completo, los dos niveles de certeza
de la columna `nota` y lo que le falta arreglar están en `08-OPERACION.md §2`.

**Al pegar en producción, siempre:** anteponer `set search_path to retail, public;` al
script. Sin eso, el editor busca en `public`, que en ese proyecto es el schema del
sistema de personal, no el de retail. El síntoma es "la tabla no existe" cuando la tabla
existe perfectamente — solo que se está mirando el cajón equivocado. El prefijo **nunca**
va en el archivo del repo, para que `npx supabase db reset` siga corriendo limpio.

**El único escape del candado de `movimientos`.** Cuando se ponga el candado que rechaza
`UPDATE`/`DELETE` sobre el historial (D-22), ese candado bloquea a la aplicación pero no
a quien entra por el SQL Editor de producción. Es decir: no a Felipe. Eso es deliberado
— **imposible por accidente, posible a propósito y con rastro**. La regla de negocio no
cambia: un error no se borra, se corrige con un movimiento de signo contrario y su
motivo, para que el historial muestre las dos cosas.

---

## 5. Cómo se decide una excepción

A veces hay que romper una regla de arriba. La excepción es legítima si cumple las
tres:

1. **Está escrita** — en la nota del cambio, no en un chat.
2. **Tiene fecha de vencimiento o condición de salida** — "hasta que se construya X".
3. **El pájaro del módulo la conoce.**

Una excepción que no cumple las tres no es una excepción: es una regla nueva que
nadie acordó.

---

## 6. Dos personas trabajando a la vez sobre lo mismo

**Pasó hoy, 2026-09-12: dos sesiones escribieron esta misma documentación en paralelo,
sin saberlo.** Dos carpetas `docs/datos/` completas, de la misma base, con números
distintos. Fusionarlas costó más que escribirlas.

No es la primera vez ni la más cara. El 2026-09-09 dos sesiones tomaron el mismo número
de migración; `npx supabase db reset` falló con `duplicate key … schema_migrations_pkey`
y **el entorno local quedó bloqueado para todo el equipo**
(`docs/BITACORA.md:1946-1958`). El hueco `0042 → 0044` en `supabase/migrations/` es la
cicatriz: no falta nada ahí, sobró un choque. El mismo choque ya ocurrió **cinco veces
más** entre renumeraciones de archivos de `unificacion/` y de ADR
(`modulos/14-plataforma-y-esquema.md`, hueco 1).

**El paso que lo evita, y cuesta diez segundos:**

```bash
git status --short          # ¿hay algo a medias que no es tuyo?
git fetch && git log --oneline origin/main -15
ls -lt supabase/migrations/ docs/adr/ | head   # ¿qué se tocó en las últimas horas?
```

**Las cuatro reglas que salen de haberlo pagado seis veces:**

1. **El número se toma de `origin`, no de tu carpeta.** Tu carpeta no sabe lo que
   alguien pusheó hace veinte minutos. Vale igual para `supabase/migrations/`,
   `supabase/unificacion/` y `docs/adr/`.
2. **Si dos números chocan, gana lo pusheado.** Lo que ya está en `origin` no se
   renumera; lo que sigue sin commitear, sí. Es la asimetría con la que se resolvió el
   `0043` y funciona porque es mecánica: no hay que discutir quién llegó primero.
3. **Antes de algo grande —un módulo entero, un documento largo, una tanda de
   migraciones— se dice en voz alta qué archivos vas a tocar**, y se toma el número
   ahí mismo. Reservar el número es más barato que fusionar dos versiones.
4. **Si ya pasó, se fusiona; no se elige un ganador.** Descartar la rama de otro
   descarta también lo que esa rama encontró. Hoy, la versión que decía 45 tablas y la
   que decía 36 tenían razón cada una en cosas distintas: una había mirado producción y
   la otra el repo.

**Cómo se resuelve un desacuerdo entre dos documentos:** manda el que preguntó a la
base. Si ninguno preguntó, se pregunta antes de escribir. El 2026-09-12 circulaban tres
números de tablas —36, 28 y 44— y **los tres estaban mal**: producción tiene 45 tablas +
2 vistas en `retail`, y 69 + 4 en `public`.

---

## 7. Las notas de decisión (ADR)

Se quedan donde están: `docs/adr/`, numeradas, una por decisión estructural. Son **40**
y funcionan. Ese mecanismo no se reemplaza: D-10 es **extenderlo al modelo de datos**,
no inventar un proceso nuevo al lado.

**Cuándo es ADR y cuándo es comentario en la migración:** si alguien dentro de seis
meses podría preguntar *"¿y por qué se hizo así?"*, es ADR. Si la respuesta es obvia
leyendo el SQL, es comentario. Un campo opcional o un índice, comentario. Una tabla
nueva, un cambio de modelo, una excepción a una regla de este archivo: ADR.

**Tres cosas que hay que arreglarle:**

- **Hay dos archivos numerados 0003** (`0003-modal-compartido-radix-sin-kit-visual.md`
  y `0003-taxonomia-captura-real.md`). Toda referencia a "ADR-0003" es ambigua. Hay que
  renumerar uno de los dos, y por la regla 2 del §6 le toca al que se pusheó después.
- **El número se sigue tomando mirando la carpeta local.** Es la misma causa del choque
  de migraciones, y ya cobró dos veces acá: el `git log` tiene los commits *"renumera
  0037 a 0038"* y *"renumera 0038 a 0039"*.
- **Los ADR no dicen a qué pájaro tocan.** La línea nueva de la plantilla (§3) lo
  arregla de aquí en adelante; los 40 viejos no se reescriben hacia atrás.

---

## 8. Qué se revisa, cada cuánto

| Qué | Cada cuánto | Quién | Dónde queda |
|---|---|---|---|
| Diferencias entre lo que la pantalla llama y lo que producción acepta | En cada cambio, automático (`pnpm datos:comparar`) | Gorrión | `generado/DRIFT.md` |
| Diferencias de esquema entre tu base y la de las tiendas | Automático; avisa solo si difieren (D-19) | Gorrión | `08-OPERACION.md` |
| Comprobantes trabados camino a SUNAT (D-37) | Diario, automático | Cuervo | Alarma |
| Cierre del mes | Mensual | Urraca | `modulos/12-contabilidad.md` |
| Que el respaldo se pueda restaurar de verdad (D-29) | Trimestral | Gorrión | `08-OPERACION.md §4` |
| Que este documento no mienta | En cada cambio de esquema | El pájaro que tocó | El propio diccionario |

**Lo que esas alarmas encuentran ahora mismo — son dos, y están rotas en las tiendas
hoy:**

| Pantalla | Manda | Producción acepta |
|---|---|---|
| `RegistrarGastoModal.tsx:57` | `p_metodo_pago` de más | `registrar_gasto` con 6 parámetros |
| `RecibirLoteForm.tsx:431` | `p_orden_produccion_id` de más | `recibir_lote` con 7 parámetros |

No son intermitentes: **fallan siempre**, y solo en las tiendas. En tu máquina esas dos
funciones sí tienen el parámetro. Es exactamente el hueco que ni `typecheck` ni
`migraciones:verificar` podían ver.

### Dos cosas que hay que arreglarle a la vigilancia misma

- **El generador está leyendo la base equivocada.** `generado/DICCIONARIO-RETAIL.md`
  dice en su cabecera *"Origen: `supabase_db_cayla-dynamic` · Tablas y vistas
  encontradas: 28"*, y `generado/RPCS.md` dice *"Funciones en `retail`: 23"*.
  Producción tiene **45 tablas + 2 vistas** y **56 funciones**. O sea: la mitad que el
  `README.md` promete que está "siempre al día" está describiendo el contenedor local,
  no las tiendas. **Es de Gorrión y es lo primero de esta lista.**
- **La bitácora se contradice sobre lo que corrió allá.** `docs/BACKLOG.md:64` dice que
  `0052` (taxonomía) ya está en producción; `docs/BACKLOG.md:82` y `:87` dicen que no.
  Verificado el 2026-09-12: **sí está** — las cinco tablas de taxonomía, más
  `importaciones`, `producto_atributos`, `proformas`, `conteos`, `conteo_lineas`,
  `codigos_barras` y `migraciones_aplicadas`, existen todas en producción. Las líneas
  82 y 87 son las que están mal.

**La lección de gobierno, que es la misma en los dos casos:** una alarma en la que no se
confía es peor que ninguna, porque enseña a ignorar el color verde. El dueño de la
alarma es el dueño de que diga la verdad.

---

*Decisiones que gobiernan este archivo: D-09 (un dueño por módulo, con pájaro),
D-10 (se escribe el porqué antes de cambiar), D-11 (solo Felipe pega SQL en producción
y queda anotado), D-12 (cuatro niveles, un solo vocabulario), D-13 (qué puede un Líder
que un Integrante no), D-14 (dónde manda un Líder), D-19 (alarma automática de
diferencias), D-22 (el historial no se borra, y su única salida de emergencia),
D-26 (el Integrante opera el almacén de su sede), D-37 (alarma de comprobantes
trabados). El texto completo está en `DECISIONES-2026-09-12.md`, que manda sobre esto.*
