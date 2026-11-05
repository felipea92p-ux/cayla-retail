# Maqueta · Configuración, vista por vista (2026-11-04)

Felipe pidió «una maqueta nueva para cada una de esas vistas» y evaluar qué secciones se pueden quitar o juntar. Están las 8 vistas de hoy, armadas
solo con piezas ya elegidas del vidrio (`docs/vidrio/README.md`, ADR-0596): nada de esta maqueta inventa un material. Datos inventados.

Abrir `index.html` (o con la config `maquetas`). Tocable: las pestañas, las tiendas, «Ver más», los interruptores y las casillas (cambia un número y sal de ella).

## Lo que se elige en la barra

| Pregunta | Caras |
|---|---|
| Pestañas | **5 juntas** (Empresa y tiendas · Metas · Dinero · Gastos · Impuestos) · 8 como hoy (las mismas vistas, sin juntar) |
| Campañas | **Plegadas** · Quitarlas (decisión de negocio) |
| Topes de gasto | Aún sin topes · Con topes (son dos estados de la misma vista, no una elección) |

En negrita, la recomendada. Lo que se quita, se junta o se muda, y por qué, está al pie de `index.html`.

## Medido

Chrome sin ventana, a 1440 × 860 de aparato, en pantallas de alto (hoy → maqueta): Tiendas y caja, 4,3 → Empresa y tiendas 1,0 + Metas 1,6 · Cuentas y Caja, 3,1 → Dinero 1,8 ·
Fijos, Presupuesto y CLAURE → Gastos 1,7 · Impuestos, 1,9 → 1,4. Sin desborde de página a 375, 1280, 1440 y 1920, en claro y oscuro. A 1280 la tabla de cobros puede
correrse dentro de su placa. Los «hoy» se midieron a 900 px de alto y con la base local, casi vacía: con datos reales pesarán más.

## Lo que no cambia

Lo que hace cada casilla, las funciones de la base, quién ve qué, las hojas de editar y la firma del responsable.

## Lo que decidió Felipe

**5 pestañas** (2026-11-04). Y pidió mejorar todas las piezas: mucho texto innecesario y muy pequeño, que sea más visual y entendible. Se sigue vista por vista, empezando por `docs/maquetas/empresa-tiendas-2026-11/`. Campañas, plegada o quitada, sigue sin decidir.
