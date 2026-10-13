# ADR-0394 · Íconos del lateral: los más directos para cada pantalla de «Gestión», y ninguno se repite en un mismo perfil

- **Fecha:** 2026-10-13 · **Estado:** construido y verificado en local; sin migración. Rama `claude/iconos-del-lateral-d7a466`.
- **Número:** reservado con `pnpm reservar adr` al empezar (ADR-0381).
- **Pedido:** Felipe, 2026-10-13, mirando el lateral con «Gestión» ya publicado (ADR-0392): «mejora los íconos, los mejores y más
  referenciales, directos, más entendibles, y que ninguno se repita». En su captura, Plan del piso y Rendimiento tenían el mismo dibujo.
- **Complementa:** ADR-0392 (el grupo «Gestión»), ADR-0144 (el menú es un árbol de datos: la clave de ícono vive en `lib/menu.ts` y el
  trazo en `AppShell.tsx`), ADR-0350 (se entiende en 5 segundos), ADR-0357 (la prueba ciega con lectoras simuladas), ADR-0358 («una
  función, una pieza»; la familia `icono` de `/unificar` es de tamaño y trazo dentro de las pantallas y sigue sin decidir: esto es el
  lateral).

## El problema, medido

Se midió por PERFIL, no en el árbol, porque Compras y Producción reusan íconos a propósito (nunca salen juntas). Un perfil real veía
cuatro pares con el mismo dibujo:

| Ícono repetido | Filas que lo comparten (en un mismo perfil) |
|---|---|
| `resumen` (cuatro cuadros) | Plan del piso + Rendimiento (y, en el Taller, también Producción ▸ Resumen) |
| `analisis` (flecha de tendencia) | Análisis + Compras ▸ Plan de campaña |
| `recibir` (bandeja) | Inventario ▸ Recibir mercadería + Producción ▸ Recibir (insumos), en el Taller |

Y los íconos de las pantallas nuevas no decían lo suyo: el de Rendimiento era una cuadrícula que no habla de rendimiento.

## Cómo se eligió (no por gusto)

ADR-0358 pide que Felipe elija mirando, y ADR-0357 ya usó una prueba ciega con lectoras simuladas. Se repitió el método:
1. **Un diseñador por pantalla** propuso candidatos del catálogo de lucide (4196 íconos, ya es dependencia del repo), sabiendo qué
   íconos hay ya en el lateral para no parecerse a ninguno.
2. **Hojas anónimas** (números, no nombres; otro orden por juez; cada ícono grande y a su tamaño real de 18 px) con los íconos ACTUALES
   mezclados como control.
3. **Seis jueces ciegos por ronda, perfiles distintos** (vendedora de primer día, encargada, cajero, dueña, almacenero, contadora): cada uno
   asignó cada ícono a la pantalla que cree que abre (parte 1) y eligió el mejor para cada pantalla (parte 2). Dos rondas, 12 jueces.

Los jueces son agentes que representan perfiles, no personas: igual que en ADR-0357, falta la prueba con colaboradoras reales.

## Decisión

| Pantalla | Antes | Ahora (lucide) | Evidencia |
|---|---|---|---|
| Gestión (el grupo) | diana | `briefcase-business` (maletín) | La diana la leyeron como Rendimiento (4) o campaña (2); 0 de 6. El maletín: 6 de 6 y 5 de 6 en las dos rondas. Empate técnico con el timón (3 votos a 2); se prefirió el maletín porque 2 jueces dijeron que el timón, a 18 px, parece un sol o un asterisco |
| Análisis | flecha de tendencia | `microscope` (microscopio) | La flecha: 0 de 6, la leyeron como Rendimiento. Microscopio: 6 de 6 y mejor de 5 de 6 jueces |
| Frescura del piso | brote | `leaf` (hoja) | Las dos se leen bien (6 de 6); la hoja ganó la elección (3 de 6 contra 0) y en la segunda ronda, 6 de 6 |
| Plan del piso | cuatro cuadros | `shelving-unit` (estantería) | Los cuatro cuadros: 0 de 6, los leyeron como «Gestión». Estantería: 6 de 6 en ambas rondas, mejor de 4 y de 6 |
| Rendimiento | cuatro cuadros | `trophy` (trofeo) | 12 de 12 puntos en la primera ronda y otra vez en la segunda |
| Compras ▸ Plan de campaña | flecha de tendencia | `megaphone` (megáfono) | 12 de 12 y de nuevo 6 de 6 como mejor |
| Producción ▸ Recibir (insumos) | bandeja | `package-open` (caja abierta) | Elegido a la vista, fuera de la prueba: «llegó y se abre»; la caja cerrada con visto se parecía al cubo de Inventario |

Cada trazo se copia a `IC` en `AppShell.tsx` convertido a una sola cadena `d` (formato que ya usa el lateral; lucide es ISC y ya se
inlinaba, p. ej. «productos»), con un comentario `// lucide «nombre»` para saber de dónde vino. Cuatro claves de ícono nuevas en
`ClaveIcono`: `planPiso`, `rendimiento`, `campana` y `recibirInsumos`; `analisis`, `frescura` y `gestion` conservan su clave y
cambian de trazo. `menu-hoy.golden.json` cambia solo las claves de cuatro filas (por su ruta) en los seis perfiles.

**Lo que se ve distinto de lo que se esperaba:** el diseñador de «Gestión» propuso la bombilla y los de «Análisis» la campana y el poste;
los jueces leyeron la bombilla como Análisis y los íconos abstractos (brújula, binoculares, campana, llama, apretón de manos) como «de
cualquier pantalla». Ganan los OBJETOS concretos de tienda u oficio. Para próximos íconos: un objeto que se vea en la tienda gana a una
forma abstracta.

## La regla que queda (y la hace cumplir)

`lib/menu.test.ts`, «ningún ícono se repite en el lateral de un mismo perfil»: recorre los 24 576 perfiles que ya recorre la suite y falla
si un perfil ve dos filas (cabeceras y pantallas, a cualquier profundidad) con la misma clave de ícono. Antes de este cambio fallaba con
cuatro pares; ahora pasa. No mira el árbol entero a propósito: Compras y Producción (Abastecimiento) siguen compartiendo claves porque
nunca salen juntas. **No** puede ver «dos claves distintas que se parecen»: eso se mira en el navegador.

## Lo que queda fuera (se deja a la vista, no se toca)

Pares que se parecen sin repetir clave y que Felipe puede querer mirar: Finanzas (bloques de tablero) ↔ Producción ▸ Resumen (cuatro
cuadros) ↔ Catálogo ▸ Atributos (tres cuadros); Comprobantes ↔ Facturas de proveedor (hoja de documento); y las tres bolsas (Ventas,
Compras, Posventa). Cambiarlos toca pantallas que no se hablaron y puede cambiar un dibujo que alguien ya aprendió.

## Se rompe si

- Se agrega una pantalla con una clave de ícono ya usada por otra que sale en el mismo perfil: la prueba lo dice con los dos ids.
- Se actualiza lucide y cambia el dibujo de un nombre: los trazos están copiados en `IC`, no se leen en ejecución (no cambian solos).
- Un ícono se lee distinto en la tienda real que en la hoja ciega: se cambia con una línea de `IC` (la clave y los ganadores de las dos
  rondas están en este ADR).

## Verificación

- Suite completa (158 137 pruebas) y `tsc` limpios; la prueba nueva falló antes con los cuatro pares y pasa ahora.
- El lateral del líder de una tienda y del Taller dibujado a doble resolución con los trazos de `AppShell.tsx` y las filas de la foto del
  menú, en claro y en oscuro: ninguna fila repite dibujo, y el «Recibir» del Taller ya no se parece a la bandeja.
- Mirado también en el navegador real con la sesión de Felipe (solo lectura): «Gestión» abre con Análisis, Frescura del piso, Plan del
  piso y Rendimiento con sus íconos nuevos.
- **No se corrió** `tema:auditar` ni `guias:recorrer` (no hay base local en esta máquina): ningún color ni control cambió, solo el trazo.
