# ADR-0342 — Roles y accesos: tarjetas para los roles, baldosas para lo que ve

- Fecha: 2026-10-05
- Estado: aceptado (Felipe, 2026-10-05: «sigue con Roles y qué ve»)
- Entrega 3 de 4 del rediseño de Colaboradores (después de ADR-0340 y ADR-0341), con lo visual de la 4 (terminales). Sin migraciones.

## Problema

El editor de roles tenía tres columnas:
- **la izquierda:** una lista por familias («Del sistema», «Terminales», «A medida»);
- **el centro:** grupos plegables con un interruptor chico por módulo y su texto de «qué incluye» siempre a la vista;
- **la derecha:** la vista previa del menú.

Arriba iba un recuadro con tres ideas numeradas y, en cada rol, varias notas fijas. Felipe pidió menos texto y que se entienda mirando.

## Decisión

1. **Los roles son tarjetas**, en una grilla arriba. Cada una muestra:
   - el nombre;
   - una línea de para qué es;
   - los íconos de sus módulos;
   - una barra de cuánto ve;
   - las iniciales de quienes lo tienen;
   - si quedó sin uso o sin módulos.

   La última tarjeta es «+ Nuevo rol». Los archivados se despliegan debajo.
2. **Lo que ve el rol elegido son baldosas**, una por módulo y con su ícono (`components/colaboradores/IconoModulo.tsx`), agrupadas
   como siempre:
   - Negra = la ve.
   - Borde punteado con candado = no se puede tocar («Solo líder», «No lo tienes»…).
   - Un punto verde o rojo = se suma o se quita al guardar.

   Cada grupo tiene «Todos» / «Quitar todos».
3. **La ayuda aparece al tocar.** Qué incluye un módulo se lee en una línea arriba de las baldosas, solo el del módulo tocado.
   Se quitaron el texto fijo bajo cada módulo, el buscador de módulos (`modulosFiltrados`) y los grupos plegables.
4. **Menos texto fijo.** Se fueron:
   - el recuadro de tres ideas;
   - la línea de ayuda del combo Responsable;
   - la nota larga del Líder, que quedó en una línea: «Lo cambia solo un Admin… Roles y accesos no se le quita»;
   - la línea «Para archivarlo…» (el menú ya no ofrece archivar cuando no se puede);
   - la descripción genérica de un rol a medida.

   «Pantalla principal» pasa a llamarse «Pantalla al entrar».
5. **«Terminales», no «Aparatos»** (Felipe, 2026-10-05). En Equipo, la ficha y la vista de terminales, la palabra vuelve a ser
   terminal, en femenino («terminal desactivada»).
6. **Equipo lleva los títulos de columna** (Persona · Rol · Último ingreso · Estado). Felipe no sabía qué era la fecha de cada
   fila: es el último ingreso al sistema.
7. **Las filas de Equipo aprovechan el ancho** (Felipe 2026-10-05: el rol y la fecha quedaban al otro extremo de la pantalla).
   - Desde 1024 px las columnas van juntas a la izquierda, con anchos fijos.
   - Bajo cada nombre va su correo.
   - Una columna «Estado» toma el espacio que sobra: de turno hoy, suspendido, terminal desactivada.
   - En pantallas más chicas el estado sigue junto al nombre.
8. **«Terminales» se ve igual que «Todas»** (Felipe 2026-10-05: «¿por qué se ve diferente?»). Era la pantalla vieja de terminales,
   con su tabla y dos cajas de texto.
   - Ahora es la misma lista agrupada por sede, solo con las terminales, más «+ Nueva terminal».
   - Tocar una terminal abre su ficha (`components/colaboradores/FichaTerminal.tsx`), con el mismo cajón que la de una persona
     (`CajonFicha.tsx`). Trae una frase y tres botones: «Clave nueva», «Cambiar rol» y «Desactivar» o «Reactivar».
   - Los modales son los de siempre: la clave se muestra UNA vez y desactivar se confirma. Viven en `ColaboradoresPanel` y no
     dentro del cajón (ADR-0128).
   - El atajo «Terminales» sale aunque no haya ninguna, para poder crear la primera.
   - Se fueron `TerminalesPanel` y `TablaTerminales`.

## Qué no cambia

El borrador, la barra de guardar, la versión contra pisarse (ADR-0193), la pantalla al entrar y la vista previa del menú son
los mismos. También todas las reglas: `controlDe`, «solo das lo que tienes», el Líder solo lo edita un Admin y P6 (Colaboradores
y Roles no van en un rol de terminal). Las RPC y los modales (nuevo, duplicar, renombrar, archivar, asignar, cuentas del rol)
tampoco cambian.

## Cómo se verificó

- Toda la suite web está en verde.
- Con datos inventados en el navegador:
  - las tarjetas con sus íconos, barra y caras;
  - elegir «Ventas» y tocar «Facturación»: la baldosa se pone negra con el punto verde, el menú marca «Comprobantes» y sale
    la barra «1 cambio · afecta a 2 cuentas»;
  - los títulos de Equipo alineados con cada fila;
  - a 1500 px, la lista con sus columnas juntas y «Estado»;
  - el atajo «Terminales» con la misma lista, la ficha de «Caja TRU» y «Clave nueva» abriendo su modal.
