# ADR-0392 · «Gestión»: un grupo de primer nivel del lateral, debajo de Inicio, para mirar y decidir

- **Fecha:** 2026-10-13 · **Estado:** construido y verificado en local (seis actividades, un commit cada una; rama
  `claude/erp-floor-management-logic-d7a466`). Migración `20261013134000_frescura_y_plan_del_piso_al_grupo_gestion.sql`
  **en producción desde el 2026-10-13** (la pegó Felipe; la comprobación devolvió analisis 210 · frescura 212 · plan_piso 214 ·
  colaboradores 220, los tres últimos en «Gestión»). PR #1023.
- **Número:** reservado con `pnpm reservar adr` al empezar (ADR-0381); la migración, con `pnpm reservar migracion`.
- **Pedido:** Felipe, 2026-10-13, mirando Frescura del piso y Plan del piso una al lado de la otra: «¿fusionarlas? ¿un módulo para esas
  dos? ¿o “Gestión de piso” con Análisis, Frescura del piso y Plan del piso?». Después, con el análisis en la mano: «no deberían ir en
  Inventario, deben estar al alcance de que una encargada lo vea más directo», y «¿no crees que debería ir debajo de Inicio? Este ERP
  su finalidad es mejorar la gestión comercial».
- **Reescribe:** la decisión 5 de ADR-0352 (Plan del piso directo en Inventario con el tope subido a 8) y el «Dónde vive» de ADR-0208
  («Actualización 2026-09-27 — diseño 3c»: Frescura directa en Inventario, subgrupo «Diagnóstico» descartado). Las dos descartaban
  un **subgrupo** porque escondía un clic más adentro la pantalla que se mira cada semana; esto no es un subgrupo, es una puerta de
  primer nivel, y por eso no las contradice: las cumple de otra forma.
- **Complementa:** ADR-0071 (Inventario se lee como cuatro pantallas: vuelve a ser exactamente eso), ADR-0144 (el menú es un árbol
  de datos), ADR-0155 (D-84, los topes del lateral), ADR-0161 y ADR-0306 (un módulo es una entrada del menú; nada cambia de rol),
  ADR-0219 (Rendimiento), ADR-0357 (Análisis v4), ADR-0389 (las guías agrupan como el lateral).

## El problema

Tres pantallas responden tres preguntas distintas sobre el mismo piso, con grano, horizonte y dueño distintos, y vivían repartidas:

| Pantalla | Pregunta | Grano | Horizonte | Quién decide |
|---|---|---|---|---|
| Análisis (ADR-0357) | ¿Qué hago hoy? | prenda, con botón que abre el flujo | hoy | quien atiende |
| Frescura del piso (ADR-0208) | ¿Mi piso está fresco? | prenda contra el ritmo de su categoría, «Ya decidí» | semanas | encargada o líder |
| Plan del piso (ADR-0329/0352) | ¿Cuánto lugar le toca a cada grupo? | 8 grupos, por temporada | temporada | Felipe |

No comparten ni una función de la base ni una librería (Frescura lee `fn_frescura_sede`; Plan, `fn_categorias_grupo_mix` y
`fn_espacio_piso`; lo único que Frescura importa de Análisis es la regla de «¿ya se puede confiar en el dato?»). Comparten el pájaro
(13 Águila), el piso y esa duda. Eran las filas 5.ª a 7.ª de Inventario, con el tope de hijas subido a 8 a propósito (ADR-0352), y
Rendimiento (también Águila, también «solo para el líder hasta que se la des a las encargadas») era una hoja suelta al final del
lateral. Inventario mezclaba cuatro pantallas de **operar** stock con tres de **mirar y decidir**.

## Decisiones

**1. No se fusionan, no se les copian las pestañas.**
DECIDÍ: tres pantallas, tres preguntas. Una sola hoja tendría 9 pestañas (1 + 3 + 5), contra la ley 2 de Formidable («una pregunta,
una respuesta»); y una pestaña no es un módulo (ADR-0306): quien viera Frescura vería el plan, que por naturaleza es de Felipe. Las dos
ya comparten la cabecera (`EncabezadoPagina`, ADR-0220); Plan tiene pestañas porque responde tres cosas, Frescura responde una y se lee
de arriba abajo: pestañas ahí serían adorno (ADR-0358 solo las admite cuando cambian de sección).
DESCARTÉ: fusionarlas (el mismo motivo por el que el 5-oct Plan no fue una pestaña de Existencias) y «alinear el diseño» poniéndole
pestañas a Frescura.
SE ROMPE SI: alguien les da el mismo módulo «porque están juntas»: siguen siendo tres módulos y tres roles posibles.

**2. «Gestión» es un grupo de PRIMER nivel, no un subgrupo, y absorbe a Rendimiento.**
DECIDÍ (Felipe, preguntado con tres opciones): un grupo del lateral con Análisis, Frescura del piso, Plan del piso y Rendimiento.
El primer nivel ya estaba en el tope de 8 (Inicio, Ventas, Inventario, Catálogo, Compras, Finanzas, Clientes, Rendimiento) y
`menu.test.ts` no deja subirlo; Rendimiento deja su fila suelta y el primer nivel sigue en 8. Inventario vuelve a Existencias,
Movimientos, Traslados y Conteo (ADR-0071 literal; más «Recibir mercadería» para quien no ve Compras) y la excepción `inventario: 8`
del tope de hijas se borra. El nombre es el del grupo de Roles y accesos donde ya vivían Análisis y Rendimiento (`MODULOS`,
`grupo: "Gestión"`): no se inventa una segunda palabra.
DESCARTÉ: (a) «Gestión del piso» con tres, porque deja 9 filas de primer nivel; (b) un subgrupo dentro de Inventario, porque se abre
solo al aterrizar adentro y no recuerda su estado: desde Existencias llegar a Frescura pasa de 1 clic a 2, justo lo que Felipe
descartó el 27-sep («Diagnóstico») y el 5-oct («El piso»); (c) dejar las 7 filas y que solo Inicio muestre el piso (resuelve la
visibilidad, no la mezcla de operar y decidir).
SE ROMPE SI: Gestión gana una quinta pantalla y Felipe quiere otra puerta de primer nivel: el tope de 8 ya está lleno y el
remedio vuelve a ser regrupar, no subirlo.

**3. Debajo de Inicio; en el Taller, después de Producción.**
DECIDÍ (Felipe): Inicio y Gestión son «mirar y decidir»; el resto del lateral es operar. Arriba lo que piensa, abajo lo que hace. Como
el menú es por rol, a la integrante no le cambia nada (no tiene ninguna de las cuatro) y a la líder le queda la gestión al alcance de
la mano. En el Taller, Producción sigue pegada a Inicio porque allí el día es fabricar, y Gestión va después. En el árbol, el grupo va
**antes de Inventario a propósito**: `grupoDe` asigna una ruta al primer grupo que la cubre, y la raíz `/inventario` cubría
`/inventario/frescura`; estando Gestión primero, sus hojas ganan por su ruta exacta.
DESCARTÉ: después de Ventas (el mostrador seguía viendo sus filas primero; la líder bajaba una fila).
SE ROMPE SI: se antepone un grupo nuevo a Gestión cuya raíz cubra alguna de sus rutas (hoy, `/gestion/…` y `/rendimiento` no cuelgan
de ninguna otra raíz).
*Lo que se paga, dicho antes de decidir:* la **Terminal de ventas** no ve Inicio, así que su primera fila es «Gestión» (Frescura y
Plan, que Felipe le dio en Roles y accesos), encima del Punto de venta. Igual aterriza en Vender (`aterrizajeDe`); si molesta, se
resuelve en Roles y accesos quitándole esos dos módulos al aparato, sin código.

**4. Qué ve cada cuenta: lo decide su rol, como siempre; solo cambia el lugar.**
Consultado en producción el 2026-10-13 (solo lectura): el Líder de equipo (14 cuentas) ve las cuatro por ser líder; la Integrante
(12) no tiene ninguna, así que no ve Gestión; la Terminal de ventas y la Terminal Almacén (aparatos, uno por tienda) tienen Frescura y
Plan y ven Gestión con dos filas; el rol Producción (1) tiene Análisis y ve una fila «Análisis». Las cuatro hojas llevan
`conservaNombre`: un rol que ve una sola ve esa fila con su nombre, nunca una fila «Gestión» que abre otra cosa. Existe además un rol
llamado «Gestión & Visión» (solo Inicio): no choca con nada; Felipe lo sabe.

**5. Las rutas se mudan a `/gestion/…` con redirecciones.**
DECIDÍ (Felipe): `/gestion/analisis` (antes `/inventario/resumen`), `/gestion/frescura`, `/gestion/plan-del-piso`; `/rendimiento` no se
mueve (no colgaba de Inventario). `next.config.ts` redirige las tres rutas viejas y `/inventario/frescura/tienda` (la que cambia de
tienda desde CAYLA Global) con `permanent: false`, conservando la query (`?vista=`, `?cat=`, `?tienda=`), como `/almacen`. La puerta
`/gestion` redirige a la primera de las cuatro que la cuenta ve. `gestion/layout.tsx` repite el envoltorio de espaciado de Inventario y
«/gestion» entra a `SIN_TOPE_DE_ANCHO`: las tres iban a ancho completo bajo `/inventario` y lo conservan. Los **ids de guía** no
cambian (`inventario.resumen`, `inventario.frescura`, `inventario.plan-del-piso`): son identificadores, no rutas, y renombrarlos tocaría
cada `data-guia`; sus huellas se aceptaron porque solo cambió la carpeta de la página. `/api/inventario/frescura-vara-cayla` (el
cron) no se toca.
DESCARTÉ: dejar las URL bajo `/inventario` enseñándole a `grupoDe` que la hoja gana sobre la raíz (más barato, pero la URL contaría
otra historia que el menú).
SE ROMPE SI: un enlace externo guardado apunta a `/inventario/resumen?…`: llega igual, por la redirección; lo que no se redirige es
una ruta que nunca existió.

**6. Roles y accesos: Frescura y Plan pasan al grupo «Gestión», y el grupo se queda donde está.**
DECIDÍ: migración `20261013134000`: `frescura` y `plan_piso` pasan a `grupo = 'Gestión'` con orden 212 y 214, justo después de
Análisis (210) y antes de Colaboradores (220); `CLAVES_MODULO` y `MODULOS` lo espejan y `modulos.test.ts` aprende a leer un
`update … set grupo = …, orden = …`. Roles y accesos **no** cambia de lugar su grupo «Gestión» (sigue después de Producción, como
antes): es el segundo desvío escrito frente al lateral, igual que Producción (`lib/menu.ts`, «el orden»).
DESCARTÉ (Felipe): subir Gestión también en Roles y accesos, porque exige una migración que cambia el orden de nueve módulos y que la
prueba del catálogo aprenda ese cambio, para que el líder vea el mismo orden en dos pantallas que ya difieren por Producción.
SE ROMPE SI: una migración vuelve a insertar `frescura` o `plan_piso` con `on conflict do update` del `orden` viejo.

**7. Lo que NO hace este cambio.** Ningún rol gana ni pierde un módulo (`rol_modulos` intacto, ADR-0161). Ninguna pantalla cambia
por dentro. Las guías no cambian un paso (ningún paso decía dónde vive la pantalla; «Mi perfil ▸ Demo» agrupa como el lateral y ya
las muestra bajo Gestión): solo se mudaron a `pantallas/gestion.ts`, un archivo por módulo como pide `/guia`.

## Lo que queda fuera (siguiente paso, con el OK de Felipe)

- **Inicio no dice nada del piso.** El Inicio de la encargada carga traslados, cajas, equipo, meta y comprobantes; «que lo vea más
  directo» también es que Inicio le diga «tu piso: 20 % fresca · 1 por decidir · riel al 56 %» con su enlace. Felipe lo dejó como paso
  siguiente, no de este cambio.
- **La señal «todavía no te fíes del dato».** Las tres pantallas la dicen con tres vocabularios: Análisis «Datos incompletos» (`Aviso`),
  Frescura «Aproximado» + «Aún no se sabe» + «Registrar N sin prenda», Plan «Por cuadrar» + «según el sistema» + «Falta contar tu
  piso». Felipe dijo que sí a una sola pieza para las tres (una familia de `/unificar`): es otro PR.
- **Plan del piso y Rendimiento comparten ícono** (cuatro recuadros) una fila debajo de la otra. Es una elección visual de Felipe
  (Rendimiento podría llevar el de personas).

## SQL para producción

`20261013134000_frescura_y_plan_del_piso_al_grupo_gestion.sql`: dos `update` idempotentes sobre `retail.modulos`, sin `alter`, sin
políticas, sin `rol_modulos`. Se pega sola, a cualquier hora, antes o después de publicar la web (la web no lee `grupo` de la base; lo
usa Roles y accesos desde `lib/modulos.ts`). Comprobación: `select clave, grupo, orden from retail.modulos where clave in
('analisis','frescura','plan_piso','colaboradores') order by orden` → 210 · 212 · 214 · 220, los tres últimos en «Gestión».

## Verificación

- `menu.test.ts`, `modulos.test.ts`, `roles-reglas.test.ts`, `guias.test.ts`, `guia-de-foco.test.ts`, `vista-global.test.ts`,
  `plan-compra-resultados.test.ts`, `pantallas-con-vuelta.test.ts`, `ancho-completo.test.ts` y la suite completa en cada commit
  (el gancho de pre-commit), `tsc` y eslint limpios. La foto del menú (`menu-hoy.golden.json`) se cambió a propósito con la
  aprobación de Felipe, y `grupoActivoPorRuta` dice que aterrizar en `/gestion/…` abre «gestion».
- El lateral mirado en el navegador sin base, con un andamio temporal bajo `/login` que dibujó el `AppShell` real (como en
  ADR-0155) para líder de tienda, integrante, Terminal de ventas y líder del Taller; el andamio se borró antes del commit.
- En el dev server, las cuatro URL viejas responden 307 a las nuevas con su query intacta, y las nuevas piden sesión en vez de 404.
- **No se corrió** `guias:recorrer` ni `tema:auditar`: esta máquina no tiene base local desde el 2026-10-11 (Docker desinstalado).
