// ============================================================================
// GENERADO por `pnpm --filter @cayla-retail/database gen-types`
// (`supabase gen types typescript --project-id vovjyyiafkxteijimpuy --schema retail`)
//
// ⚠ TIENE PARCHES A MANO. Por eso `gen-types` ya NO escribe acá: deja la
//   salida cruda en src/types.produccion.ts (gitignored) para compararla y
//   trasladar solo lo que cambió. Antes escribía encima y borraba a la vez
//   los parches y esta lista que dice qué reponer (revisión 2026-09-11).
//
//   Ningún entorno tiene hoy el esquema completo, así que ninguna regeneración
//   sale correcta sola:
//     · producción NO tiene la taxonomía universal (`0052` no está aplicada allá)
//     · local NO tiene `catalogo_con_stock`, `configuracion_empresa`,
//       `sede_meta`, `sede_datos_fiscales`, `persona_actual`, `puede_operar_sede`
//
//   Lo puesto a mano, con fecha, para poder reponerlo después de regenerar:
//     · 2026-09-10 — los 5 tipos de taxonomía y las 2 columnas de anclaje
//       (solo existen en local)
//     · 2026-09-10 — `ventas.token_cliente` y `registrar_venta.p_token`
//       (solo existen en producción; local se puso al día con la migración
//       `0054`, así que este parche sobra el día que se regenere DESPUÉS de
//       aplicar `0052` en producción)
//     · 2026-09-11 — `importaciones`, `producto_atributos`,
//       `productos.importacion_id` y las funciones `importar_catalogo`,
//       `deshacer_importacion`, `fn_codigo_tres_letras`,
//       `fn_familia_color_de_universal`, `fn_familia_de_universal`
//       (migración `0056`; solo existen en local hasta que se aplique allá)
//     · 2026-09-11 — `importaciones.token` (migración `0057`)
//
//   El arreglo de fondo —decidir cuál de los dos entornos es la fuente— está en
//   el BACKLOG. Mientras tanto, después de cada `gen-types` hay que releer esta
//   lista y reponer lo que falte.
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  retail: {
    Tables: {
      activos_fijos: {
        Row: {
          costo: number
          created_at: string
          cuenta_codigo: string
          depreciacion_apertura: number
          descripcion: string | null
          estado: string
          fecha_adquisicion: string
          id: string
          nombre: string
          nota: string | null
          serie: string | null
          tasa_anual: number
          unidad_id: string
          updated_at: string
          valor_residual: number
          vida_util_meses: number
        }
        Insert: {
          costo: number
          created_at?: string
          cuenta_codigo: string
          depreciacion_apertura?: number
          descripcion?: string | null
          estado?: string
          fecha_adquisicion: string
          id?: string
          nombre: string
          nota?: string | null
          serie?: string | null
          tasa_anual: number
          unidad_id: string
          updated_at?: string
          valor_residual?: number
          vida_util_meses: number
        }
        Update: {
          costo?: number
          created_at?: string
          cuenta_codigo?: string
          depreciacion_apertura?: number
          descripcion?: string | null
          estado?: string
          fecha_adquisicion?: string
          id?: string
          nombre?: string
          nota?: string | null
          serie?: string | null
          tasa_anual?: number
          unidad_id?: string
          updated_at?: string
          valor_residual?: number
          vida_util_meses?: number
        }
        Relationships: [
          {
            foreignKeyName: "activos_fijos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      ajustes_efectivo: {
        Row: {
          created_at: string
          fecha: string
          id: string
          monto: number
          motivo: string
          sede_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          monto: number
          motivo: string
          sede_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          monto?: number
          motivo?: string
          sede_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_efectivo_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_efectivo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      asiento_lineas: {
        Row: {
          asiento_id: string
          cuenta_id: string
          debe: number
          glosa: string | null
          haber: number
          id: string
        }
        Insert: {
          asiento_id: string
          cuenta_id: string
          debe?: number
          glosa?: string | null
          haber?: number
          id?: string
        }
        Update: {
          asiento_id?: string
          cuenta_id?: string
          debe?: number
          glosa?: string | null
          haber?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asiento_lineas_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_lineas_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      asientos: {
        Row: {
          creado_por: string | null
          created_at: string
          fecha: string
          glosa: string
          id: string
          origen: string
          referencia_id: string | null
          referencia_tipo: string | null
          unidad_id: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          fecha?: string
          glosa: string
          id?: string
          origen?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          unidad_id: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          fecha?: string
          glosa?: string
          id?: string
          origen?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asientos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          cantidad_requerida: number
          created_at: string
          id: string
          insumo: string
          precio_unitario: number | null
          producto_id: string
          unidad: string
        }
        Insert: {
          cantidad_requerida: number
          created_at?: string
          id?: string
          insumo: string
          precio_unitario?: number | null
          producto_id: string
          unidad: string
        }
        Update: {
          cantidad_requerida?: number
          created_at?: string
          id?: string
          insumo?: string
          precio_unitario?: number | null
          producto_id?: string
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          abierta_en: string
          abierta_por: string | null
          cerrada_en: string | null
          cerrada_por: string | null
          diferencia: number | null
          estado: string
          id: string
          monto_apertura: number
          monto_cierre_contado: number | null
          monto_cierre_esperado: number | null
          sede_id: string
        }
        Insert: {
          abierta_en?: string
          abierta_por?: string | null
          cerrada_en?: string | null
          cerrada_por?: string | null
          diferencia?: number | null
          estado?: string
          id?: string
          monto_apertura: number
          monto_cierre_contado?: number | null
          monto_cierre_esperado?: number | null
          sede_id: string
        }
        Update: {
          abierta_en?: string
          abierta_por?: string | null
          cerrada_en?: string | null
          cerrada_por?: string | null
          diferencia?: number | null
          estado?: string
          id?: string
          monto_apertura?: number
          monto_cierre_contado?: number | null
          monto_cierre_esperado?: number | null
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_abierta_por_fkey"
            columns: ["abierta_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_cerrada_por_fkey"
            columns: ["cerrada_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          taxonomia_categoria_id: string | null
          created_at: string
          familia: string
          id: string
          nombre: string
          prefijo: string
          tallas_sugeridas: string[] | null
        }
        Insert: {
          taxonomia_categoria_id?: string | null
          created_at?: string
          familia: string
          id?: string
          nombre: string
          prefijo: string
          tallas_sugeridas?: string[] | null
        }
        Update: {
          taxonomia_categoria_id?: string | null
          created_at?: string
          familia?: string
          id?: string
          nombre?: string
          prefijo?: string
          tallas_sugeridas?: string[] | null
        }
        Relationships: []
      }
      codigos_barras: {
        Row: {
          codigo: string
          creado_por: string | null
          created_at: string
          id: string
          nota: string | null
          origen: string
          variante_id: string
        }
        Insert: {
          codigo: string
          creado_por?: string | null
          created_at?: string
          id?: string
          nota?: string | null
          origen: string
          variante_id: string
        }
        Update: {
          codigo?: string
          creado_por?: string | null
          created_at?: string
          id?: string
          nota?: string | null
          origen?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "codigos_barras_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codigos_barras_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_correlativos: {
        Row: {
          prefijo: string
          ultimo: number
          updated_at: string
        }
        Insert: {
          prefijo: string
          ultimo?: number
          updated_at?: string
        }
        Update: {
          prefijo?: string
          ultimo?: number
          updated_at?: string
        }
        Relationships: []
      }
      colores: {
        Row: {
          taxonomia_valor_id: string | null
          activo: boolean
          codigo: string
          created_at: string
          familia_color: string
          hex: string | null
          nombre: string
          orden: number
        }
        Insert: {
          taxonomia_valor_id?: string | null
          activo?: boolean
          codigo: string
          created_at?: string
          familia_color: string
          hex?: string | null
          nombre: string
          orden?: number
        }
        Update: {
          taxonomia_valor_id?: string | null
          activo?: boolean
          codigo?: string
          created_at?: string
          familia_color?: string
          hex?: string | null
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      comprobantes: {
        Row: {
          anulacion_solicitada_at: string | null
          anulado_at: string | null
          anulado_por: string | null
          cliente_nombre: string | null
          cliente_num_doc: string | null
          cliente_tipo_doc: string
          comprobante_original_id: string | null
          created_at: string
          entorno_transmision: string | null
          enviado_at: string | null
          estado: string
          id: string
          igv: number
          items: Json | null
          moneda: string
          motivo: string | null
          motivo_anulacion: string | null
          motivo_rechazo: string | null
          numero: number
          respuesta_anulacion: Json | null
          respuesta_sunat: Json | null
          sede_id: string
          serie: string
          subtotal: number
          tipo: string
          total: number
          usuario_id: string | null
          venta_id: string | null
        }
        Insert: {
          anulacion_solicitada_at?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          cliente_tipo_doc?: string
          comprobante_original_id?: string | null
          created_at?: string
          entorno_transmision?: string | null
          enviado_at?: string | null
          estado?: string
          id?: string
          igv?: number
          items?: Json | null
          moneda?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          numero: number
          respuesta_anulacion?: Json | null
          respuesta_sunat?: Json | null
          sede_id: string
          serie: string
          subtotal?: number
          tipo: string
          total: number
          usuario_id?: string | null
          venta_id?: string | null
        }
        Update: {
          anulacion_solicitada_at?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          cliente_tipo_doc?: string
          comprobante_original_id?: string | null
          created_at?: string
          entorno_transmision?: string | null
          enviado_at?: string | null
          estado?: string
          id?: string
          igv?: number
          items?: Json | null
          moneda?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          numero?: number
          respuesta_anulacion?: Json | null
          respuesta_sunat?: Json | null
          sede_id?: string
          serie?: string
          subtotal?: number
          tipo?: string
          total?: number
          usuario_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_comprobante_original_id_fkey"
            columns: ["comprobante_original_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_empresa: {
        Row: {
          email: string | null
          id: boolean
          nombre_comercial: string | null
          razon_social: string
          resolucion_autorizacion: string | null
          ruc: string
          telefono: string | null
          updated_at: string
          web: string | null
        }
        Insert: {
          email?: string | null
          id?: boolean
          nombre_comercial?: string | null
          razon_social: string
          resolucion_autorizacion?: string | null
          ruc: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Update: {
          email?: string | null
          id?: boolean
          nombre_comercial?: string | null
          razon_social?: string
          resolucion_autorizacion?: string | null
          ruc?: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Relationships: []
      }
      contenedores: {
        Row: {
          codigo: string
          created_at: string
          id: string
          sede_id: string
          tipo: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          sede_id: string
          tipo: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          sede_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contenedores_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      conteo_lineas: {
        Row: {
          actualizado_en: string
          cantidad_contada: number
          cantidad_sistema: number
          contado_en: string
          contado_por: string | null
          contenedor_id: string | null
          conteo_id: string
          diferencia: number | null
          id: string
          movimiento_id: string | null
          nota: string | null
          variante_id: string
        }
        Insert: {
          actualizado_en?: string
          cantidad_contada: number
          cantidad_sistema: number
          contado_en?: string
          contado_por?: string | null
          contenedor_id?: string | null
          conteo_id: string
          diferencia?: number | null
          id?: string
          movimiento_id?: string | null
          nota?: string | null
          variante_id: string
        }
        Update: {
          actualizado_en?: string
          cantidad_contada?: number
          cantidad_sistema?: number
          contado_en?: string
          contado_por?: string | null
          contenedor_id?: string | null
          conteo_id?: string
          diferencia?: number | null
          id?: string
          movimiento_id?: string | null
          nota?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteo_lineas_contado_por_fkey"
            columns: ["contado_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_lineas_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_lineas_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_lineas_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      conteos: {
        Row: {
          abierto_en: string
          abierto_por: string | null
          alcance: string
          alcance_categoria_id: string | null
          alcance_contenedor_id: string | null
          alcance_familia: string | null
          cerrado_en: string | null
          cerrado_por: string | null
          estado: string
          id: string
          lineas_ajustadas: number | null
          nombre: string | null
          nota: string | null
          sede_id: string
          tratar_no_contado: string
          ubicacion: string
          unidades_diferencia: number | null
        }
        Insert: {
          abierto_en?: string
          abierto_por?: string | null
          alcance?: string
          alcance_categoria_id?: string | null
          alcance_contenedor_id?: string | null
          alcance_familia?: string | null
          cerrado_en?: string | null
          cerrado_por?: string | null
          estado?: string
          id?: string
          lineas_ajustadas?: number | null
          nombre?: string | null
          nota?: string | null
          sede_id: string
          tratar_no_contado?: string
          ubicacion?: string
          unidades_diferencia?: number | null
        }
        Update: {
          abierto_en?: string
          abierto_por?: string | null
          alcance?: string
          alcance_categoria_id?: string | null
          alcance_contenedor_id?: string | null
          alcance_familia?: string | null
          cerrado_en?: string | null
          cerrado_por?: string | null
          estado?: string
          id?: string
          lineas_ajustadas?: number | null
          nombre?: string | null
          nota?: string | null
          sede_id?: string
          tratar_no_contado?: string
          ubicacion?: string
          unidades_diferencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conteos_abierto_por_fkey"
            columns: ["abierto_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_alcance_categoria_id_fkey"
            columns: ["alcance_categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_alcance_contenedor_id_fkey"
            columns: ["alcance_contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_contables: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          elemento: string
          es_contra: boolean
          explicacion: string
          id: string
          naturaleza: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          elemento: string
          es_contra?: boolean
          explicacion: string
          id?: string
          naturaleza: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          elemento?: string
          es_contra?: boolean
          explicacion?: string
          id?: string
          naturaleza?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      depositos_bancarios: {
        Row: {
          created_at: string
          fecha: string
          id: string
          monto: number
          nota: string | null
          sede_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          monto: number
          nota?: string | null
          sede_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          monto?: number
          nota?: string | null
          sede_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "depositos_bancarios_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_bancarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          created_at: string
          especificacion: string | null
          id: string
          igv: number
          metodo_pago: string | null
          sede_id: string
          subtotal: number
          total: number
          usuario_id: string | null
        }
        Insert: {
          categoria: string
          created_at?: string
          especificacion?: string | null
          id?: string
          igv?: number
          metodo_pago?: string | null
          sede_id: string
          subtotal?: number
          total: number
          usuario_id?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          especificacion?: string | null
          id?: string
          igv?: number
          metodo_pago?: string | null
          sede_id?: string
          subtotal?: number
          total?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      importaciones: {
        Row: {
          categorias_creadas: number
          colores_creados: number
          created_at: string
          deshecha_en: string | null
          estado: string
          id: string
          origen: string
          persona_id: string | null
          plan: Json
          productos_creados: number
          token: string | null
          variantes_creadas: number
        }
        Insert: {
          categorias_creadas?: number
          colores_creados?: number
          created_at?: string
          deshecha_en?: string | null
          estado?: string
          id?: string
          origen: string
          persona_id?: string | null
          plan: Json
          productos_creados?: number
          token?: string | null
          variantes_creadas?: number
        }
        Update: {
          categorias_creadas?: number
          colores_creados?: number
          created_at?: string
          deshecha_en?: string | null
          estado?: string
          id?: string
          origen?: string
          persona_id?: string | null
          plan?: Json
          productos_creados?: number
          token?: string | null
          variantes_creadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "importaciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          created_at: string
          fecha_recepcion: string
          id: string
          nota: string | null
          numero_guia: string | null
          orden_compra_id: string | null
          origen: string
          proveedor: string | null
          proveedor_id: string | null
          recibido_por: string | null
          sede_id: string
        }
        Insert: {
          created_at?: string
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          orden_compra_id?: string | null
          origen: string
          proveedor?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          sede_id: string
        }
        Update: {
          created_at?: string
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          orden_compra_id?: string | null
          origen?: string
          proveedor?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_orden_compra_id_fkey"
            columns: ["orden_compra_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_recibido_por_fkey"
            columns: ["recibido_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          canal: string | null
          cantidad: number
          contenedor_id: string | null
          created_at: string
          id: string
          lote_id: string | null
          monto: number | null
          motivo: string | null
          nota: string | null
          sede_destino_id: string | null
          sede_id: string
          tipo: string
          usuario_id: string | null
          variante_id: string
          venta_id: string | null
        }
        Insert: {
          canal?: string | null
          cantidad: number
          contenedor_id?: string | null
          created_at?: string
          id?: string
          lote_id?: string | null
          monto?: number | null
          motivo?: string | null
          nota?: string | null
          sede_destino_id?: string | null
          sede_id: string
          tipo: string
          usuario_id?: string | null
          variante_id: string
          venta_id?: string | null
        }
        Update: {
          canal?: string | null
          cantidad?: number
          contenedor_id?: string | null
          created_at?: string
          id?: string
          lote_id?: string | null
          monto?: number | null
          motivo?: string | null
          nota?: string | null
          sede_destino_id?: string | null
          sede_id?: string
          tipo?: string
          usuario_id?: string | null
          variante_id?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sede_destino_id_fkey"
            columns: ["sede_destino_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          fecha_estimada: string | null
          id: string
          monto_estimado: number | null
          nota: string | null
          proveedor: string
          proveedor_id: string | null
          sede_destino_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha?: string
          fecha_estimada?: string | null
          id?: string
          monto_estimado?: number | null
          nota?: string | null
          proveedor: string
          proveedor_id?: string | null
          sede_destino_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          fecha_estimada?: string | null
          id?: string
          monto_estimado?: number | null
          nota?: string | null
          proveedor?: string
          proveedor_id?: string | null
          sede_destino_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_sede_destino_id_fkey"
            columns: ["sede_destino_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra_items: {
        Row: {
          cantidad: number
          costo_unitario: number
          id: string
          orden_id: string
          variante_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario: number
          id?: string
          orden_id: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          id?: string
          orden_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_items_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_produccion: {
        Row: {
          cantidad_planeada: number
          cantidad_producida: number
          created_at: string
          destino_sede_id: string | null
          estado: string
          etapa: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          nota: string | null
          sede_id: string
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad_planeada: number
          cantidad_producida?: number
          created_at?: string
          destino_sede_id?: string | null
          estado?: string
          etapa?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nota?: string | null
          sede_id: string
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad_planeada?: number
          cantidad_producida?: number
          created_at?: string
          destino_sede_id?: string | null
          estado?: string
          etapa?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nota?: string | null
          sede_id?: string
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_produccion_destino_sede_id_fkey"
            columns: ["destino_sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      patrimonio_items: {
        Row: {
          categoria: string | null
          created_at: string
          id: string
          monto: number
          nombre: string
          nota: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          id?: string
          monto?: number
          nombre: string
          nota?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          id?: string
          monto?: number
          nombre?: string
          nota?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      produccion_lineas: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          produccion_id: string
          variante_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          produccion_id: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          produccion_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produccion_lineas_produccion_id_fkey"
            columns: ["produccion_id"]
            isOneToOne: false
            referencedRelation: "producciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produccion_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      producciones: {
        Row: {
          cantidad: number
          costo_avios: number
          costo_maquila: number
          costo_tela: number
          costo_unitario: number | null
          creado_por: string | null
          created_at: string
          detalle: string | null
          es_muestra: boolean
          estado: string
          etapas: Json
          fecha: string
          fecha_entrega: string | null
          id: string
          inventariado_at: string | null
          nota: string | null
          precio_taller: number
          producto_id: string | null
          unidad_id: string
          variante_id: string | null
        }
        Insert: {
          cantidad: number
          costo_avios?: number
          costo_maquila?: number
          costo_tela?: number
          costo_unitario?: number | null
          creado_por?: string | null
          created_at?: string
          detalle?: string | null
          es_muestra?: boolean
          estado?: string
          etapas?: Json
          fecha?: string
          fecha_entrega?: string | null
          id?: string
          inventariado_at?: string | null
          nota?: string | null
          precio_taller?: number
          producto_id?: string | null
          unidad_id: string
          variante_id?: string | null
        }
        Update: {
          cantidad?: number
          costo_avios?: number
          costo_maquila?: number
          costo_tela?: number
          costo_unitario?: number | null
          creado_por?: string | null
          created_at?: string
          detalle?: string | null
          es_muestra?: boolean
          estado?: string
          etapas?: Json
          fecha?: string
          fecha_entrega?: string | null
          id?: string
          inventariado_at?: string | null
          nota?: string | null
          precio_taller?: number
          producto_id?: string | null
          unidad_id?: string
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producciones_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producciones_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producciones_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_atributos: {
        Row: {
          atributo_id: string
          producto_id: string
          valor_id: string | null
          valor_texto: string | null
        }
        Insert: {
          atributo_id: string
          producto_id: string
          valor_id?: string | null
          valor_texto?: string | null
        }
        Update: {
          atributo_id?: string
          producto_id?: string
          valor_id?: string | null
          valor_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_atributos_atributo_id_fkey"
            columns: ["atributo_id"]
            isOneToOne: false
            referencedRelation: "taxonomia_atributos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_atributos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_atributos_valor_id_fkey"
            columns: ["valor_id"]
            isOneToOne: false
            referencedRelation: "taxonomia_valores"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          importacion_id: string | null
          categoria_id: string | null
          codigo: string | null
          costo_mano_obra: number | null
          created_at: string
          descripcion: string | null
          estado: string
          foto_url: string | null
          genero: string | null
          id: string
          marca: string | null
          material: string | null
          proveedor_id: string | null
          referencia: string
          sku_padre: string
          temporada: string | null
          updated_at: string
        }
        Insert: {
          importacion_id?: string | null
          categoria_id?: string | null
          codigo?: string | null
          costo_mano_obra?: number | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          foto_url?: string | null
          genero?: string | null
          id?: string
          marca?: string | null
          material?: string | null
          proveedor_id?: string | null
          referencia: string
          sku_padre: string
          temporada?: string | null
          updated_at?: string
        }
        Update: {
          importacion_id?: string | null
          categoria_id?: string | null
          codigo?: string | null
          costo_mano_obra?: number | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          foto_url?: string | null
          genero?: string | null
          id?: string
          marca?: string | null
          material?: string | null
          proveedor_id?: string | null
          referencia?: string
          sku_padre?: string
          temporada?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      proformas: {
        Row: {
          cliente_nombre: string | null
          cliente_num_doc: string | null
          comprobante_id: string | null
          created_at: string
          estado: string
          id: string
          igv: number
          items: Json
          sede_id: string
          subtotal: number
          total: number
          usuario_id: string | null
          vence_at: string | null
        }
        Insert: {
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          comprobante_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          igv?: number
          items: Json
          sede_id: string
          subtotal?: number
          total: number
          usuario_id?: string | null
          vence_at?: string | null
        }
        Update: {
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          comprobante_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          igv?: number
          items?: Json
          sede_id?: string
          subtotal?: number
          total?: number
          usuario_id?: string | null
          vence_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proformas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          banco: string | null
          categoria: string | null
          contacto: string | null
          created_at: string
          cuenta_bancaria: string | null
          direccion: string | null
          id: string
          marca: string | null
          nombre: string
          nota: string | null
          ruc: string | null
          score: number | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          categoria?: string | null
          contacto?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          direccion?: string | null
          id?: string
          marca?: string | null
          nombre: string
          nota?: string | null
          ruc?: string | null
          score?: number | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          banco?: string | null
          categoria?: string | null
          contacto?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          direccion?: string | null
          id?: string
          marca?: string | null
          nombre?: string
          nota?: string | null
          ruc?: string | null
          score?: number | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sede_datos_fiscales: {
        Row: {
          departamento: string | null
          direccion: string | null
          distrito: string | null
          provincia: string | null
          sede_id: string
          telefono: string | null
          ubigeo: string | null
          updated_at: string
        }
        Insert: {
          departamento?: string | null
          direccion?: string | null
          distrito?: string | null
          provincia?: string | null
          sede_id: string
          telefono?: string | null
          ubigeo?: string | null
          updated_at?: string
        }
        Update: {
          departamento?: string | null
          direccion?: string | null
          distrito?: string | null
          provincia?: string | null
          sede_id?: string
          telefono?: string | null
          ubigeo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sede_meta: {
        Row: {
          created_at: string
          sede_id: string
          tienda_asociada_id: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          sede_id: string
          tienda_asociada_id?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          sede_id?: string
          tienda_asociada_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sede_meta_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: true
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sede_meta_tienda_asociada_id_fkey"
            columns: ["tienda_asociada_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      series_comprobantes: {
        Row: {
          id: string
          sede_id: string
          serie: string
          siguiente_numero: number
          tipo: string
        }
        Insert: {
          id?: string
          sede_id: string
          serie: string
          siguiente_numero?: number
          tipo: string
        }
        Update: {
          id?: string
          sede_id?: string
          serie?: string
          siguiente_numero?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_comprobantes_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          cantidad: number
          contenedor_id: string | null
          sede_id: string
          stock_minimo: number | null
          ultima_entrada: string | null
          ultima_salida: string | null
          ultima_venta: string | null
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad?: number
          contenedor_id?: string | null
          sede_id: string
          stock_minimo?: number | null
          ultima_entrada?: string | null
          ultima_salida?: string | null
          ultima_venta?: string | null
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          contenedor_id?: string | null
          sede_id?: string
          stock_minimo?: number | null
          ultima_entrada?: string | null
          ultima_salida?: string | null
          ultima_venta?: string | null
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_almacen: {
        Row: {
          cantidad: number
          sede_id: string
          ultima_entrada: string | null
          ultima_salida: string | null
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad?: number
          sede_id: string
          ultima_entrada?: string | null
          ultima_salida?: string | null
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          sede_id?: string
          ultima_entrada?: string | null
          ultima_salida?: string | null
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_almacen_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_almacen_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomia_atributos: {
        Row: {
          descripcion: string | null
          handle: string
          id: string
          nombre: string
        }
        Insert: {
          descripcion?: string | null
          handle: string
          id: string
          nombre: string
        }
        Update: {
          descripcion?: string | null
          handle?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      taxonomia_categoria_atributos: {
        Row: {
          atributo_id: string
          categoria_id: string
        }
        Insert: {
          atributo_id: string
          categoria_id: string
        }
        Update: {
          atributo_id?: string
          categoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomia_categoria_atributos_atributo_id_fkey"
            columns: ["atributo_id"]
            isOneToOne: false
            referencedRelation: "taxonomia_atributos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxonomia_categoria_atributos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "taxonomia_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomia_categorias: {
        Row: {
          id: string
          nivel: number
          nombre: string
          padre_id: string | null
          ruta: string
          vertical: string
        }
        Insert: {
          id: string
          nivel: number
          nombre: string
          padre_id?: string | null
          ruta: string
          vertical: string
        }
        Update: {
          id?: string
          nivel?: number
          nombre?: string
          padre_id?: string | null
          ruta?: string
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomia_categorias_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "taxonomia_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomia_valores: {
        Row: {
          atributo_id: string
          handle: string
          id: string
          nombre: string
        }
        Insert: {
          atributo_id: string
          handle: string
          id: string
          nombre: string
        }
        Update: {
          atributo_id?: string
          handle?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomia_valores_atributo_id_fkey"
            columns: ["atributo_id"]
            isOneToOne: false
            referencedRelation: "taxonomia_atributos"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomia_versiones: {
        Row: {
          cargada_en: string
          es_activa: boolean
          version: string
        }
        Insert: {
          cargada_en?: string
          es_activa?: boolean
          version: string
        }
        Update: {
          cargada_en?: string
          es_activa?: boolean
          version?: string
        }
        Relationships: []
      }
      variantes: {
        Row: {
          codigo: string | null
          color: string | null
          color_id: string | null
          costo: number
          created_at: string
          foto_url: string | null
          id: string
          precio: number
          precio_oferta: number | null
          precio_taller: number
          producto_id: string
          sku: string
          stock_minimo: number
          talla: string | null
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          color?: string | null
          color_id?: string | null
          costo?: number
          created_at?: string
          foto_url?: string | null
          id?: string
          precio?: number
          precio_oferta?: number | null
          precio_taller?: number
          producto_id: string
          sku: string
          stock_minimo?: number
          talla?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          color?: string | null
          color_id?: string | null
          costo?: number
          created_at?: string
          foto_url?: string | null
          id?: string
          precio?: number
          precio_oferta?: number | null
          precio_taller?: number
          producto_id?: string
          sku?: string
          stock_minimo?: number
          talla?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "variantes_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          caja_id: string
          created_at: string
          id: string
          metodo_pago: string
          monto_total: number
          nota: string | null
          sede_id: string
          token_cliente: string | null
          usuario_id: string | null
        }
        Insert: {
          caja_id: string
          created_at?: string
          id?: string
          metodo_pago: string
          monto_total: number
          nota?: string | null
          sede_id: string
          token_cliente?: string | null
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string
          created_at?: string
          id?: string
          metodo_pago?: string
          monto_total?: number
          nota?: string | null
          sede_id?: string
          token_cliente?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_historicas_mensuales: {
        Row: {
          anio: number
          id: string
          mes: number
          monto: number
          sede_id: string
        }
        Insert: {
          anio: number
          id?: string
          mes: number
          monto?: number
          sede_id: string
        }
        Update: {
          anio?: number
          id?: string
          mes?: number
          monto?: number
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_historicas_mensuales_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      personas: {
        Row: {
          auth_user_id: string | null
          email: string | null
          estado: string | null
          id: string | null
          nombre: string | null
          rol: string | null
          sede_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          email?: string | null
          estado?: string | null
          id?: string | null
          nombre?: never
          rol?: never
          sede_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          email?: string | null
          estado?: string | null
          id?: string | null
          nombre?: never
          rol?: never
          sede_id?: string | null
        }
        Relationships: []
      }
      sedes: {
        Row: {
          activo: boolean | null
          codigo: string | null
          id: string | null
          nombre: string | null
          tienda_asociada_id: string | null
          tipo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sede_meta_tienda_asociada_id_fkey"
            columns: ["tienda_asociada_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abrir_caja: {
        Args: { p_monto_apertura: number; p_sede_id: string }
        Returns: string
      }
      abrir_conteo: {
        Args: {
          p_alcance?: string
          p_alcance_categoria_id?: string
          p_alcance_contenedor_id?: string
          p_alcance_familia?: string
          p_nombre?: string
          p_sede_id: string
          p_ubicacion?: string
        }
        Returns: string
      }
      actualizar_transmision_comprobante: {
        Args: {
          p_comprobante_id: string
          p_entorno: string
          p_estado: string
          p_motivo_rechazo?: string
          p_respuesta_sunat?: Json
        }
        Returns: undefined
      }
      anular_comprobante: {
        Args: {
          p_comprobante_id: string
          p_confirmada: boolean
          p_motivo: string
          p_respuesta?: Json
        }
        Returns: undefined
      }
      anular_conteo: {
        Args: { p_conteo_id: string; p_motivo: string }
        Returns: undefined
      }
      bajar_a_piso: {
        Args: {
          p_cantidad: number
          p_nota?: string
          p_sede_id: string
          p_variante_id: string
        }
        Returns: string
      }
      catalogo_con_stock: {
        Args: never
        Returns: {
          categoria: string
          color: string
          costo: number
          created_at: string
          estado: string
          familia: string
          foto_url: string
          marca: string
          minimo_por_sede: Json
          precio: number
          producto_id: string
          referencia: string
          sku: string
          stock_minimo: number
          stock_por_sede: Json
          talla: string
          ultima_venta: string
          variante_id: string
        }[]
      }
      cerrar_caja: {
        Args: { p_caja_id: string; p_monto_contado: number }
        Returns: {
          diferencia: number
          monto_contado: number
          monto_esperado: number
        }[]
      }
      cerrar_conteo: {
        Args: { p_conteo_id: string }
        Returns: {
          lineas_ajustadas: number
          lineas_totales: number
          unidades_faltantes: number
          unidades_sobrantes: number
        }[]
      }
      cerrar_produccion: {
        Args: {
          p_buenas: Json
          p_costo_avios: number
          p_costo_maquila: number
          p_costo_tela: number
          p_produccion_id: string
        }
        Returns: undefined
      }
      conteo_contar: {
        Args: {
          p_cantidad: number
          p_contenedor_id?: string
          p_conteo_id: string
          p_modo?: string
          p_variante_id: string
        }
        Returns: string
      }
      conteo_contar_por_codigo: {
        Args: {
          p_cantidad?: number
          p_codigo: string
          p_conteo_id: string
          p_modo?: string
        }
        Returns: string
      }
      conteo_crear_variante: {
        Args: {
          p_cantidad: number
          p_categoria_id?: string
          p_codigo_barras?: string
          p_color_codigo: string
          p_contenedor_id?: string
          p_conteo_id: string
          p_costo?: number
          p_precio?: number
          p_producto_id?: string
          p_referencia: string
          p_sku?: string
          p_talla: string
        }
        Returns: string
      }
      convertir_proforma_a_comprobante: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_proforma_id: string
          p_tipo: string
          p_venta_id?: string
        }
        Returns: string
      }
      crear_producto_con_variantes: {
        Args: {
          p_categoria_id?: string
          p_genero?: string
          p_marca?: string
          p_proveedor_id?: string
          p_referencia: string
          p_sku_padre: string
          p_temporada?: string
          p_variantes: Json
        }
        Returns: string
      }
      crear_proforma: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_igv: number
          p_items: Json
          p_sede_id: string
          p_subtotal: number
          p_total: number
          p_vence_at?: string
        }
        Returns: string
      }
      deshacer_importacion: {
        Args: { p_importacion_id: string }
        Returns: Json
      }
      devolver_a_almacen: {
        Args: {
          p_cantidad: number
          p_nota?: string
          p_sede_id: string
          p_variante_id: string
        }
        Returns: string
      }
      eliminar_produccion: {
        Args: { p_produccion_id: string }
        Returns: undefined
      }
      emitir_comprobante: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_igv: number
          p_items?: Json
          p_sede_id: string
          p_subtotal: number
          p_tipo: string
          p_total: number
          p_venta_id?: string
        }
        Returns: string
      }
      emitir_nota: {
        Args: {
          p_comprobante_original_id: string
          p_igv: number
          p_items?: Json
          p_motivo: string
          p_subtotal: number
          p_tipo: string
          p_total: number
        }
        Returns: string
      }
      es_lider: { Args: never; Returns: boolean }
      es_supervisor: { Args: never; Returns: boolean }
      fijar_stock_minimo: {
        Args: { p_minimo?: number; p_sede_id: string; p_variante_id: string }
        Returns: undefined
      }
      fn_aplicar_movimiento: {
        Args: { p_movimiento_id: string }
        Returns: undefined
      }
      fn_asignar_codigo_producto: {
        Args: { p_producto_id: string }
        Returns: string
      }
      fn_asignar_codigo_variante: {
        Args: { p_variante_id: string }
        Returns: string
      }
      fn_clave_texto: { Args: { p: string }; Returns: string }
      fn_codigo_tres_letras: {
        Args: { p_nombre: string; p_tabla: string }
        Returns: string
      }
      fn_componer_codigo_variante: {
        Args: { p_base: string; p_color_id: string; p_talla: string }
        Returns: string
      }
      fn_familia_color_de_universal: {
        Args: { p_valor_id: string }
        Returns: string
      }
      fn_familia_de_universal: {
        Args: { p_categoria_id: string }
        Returns: string
      }
      fn_reservar_numero_serie: {
        Args: { p_sede_id: string; p_tipo: string }
        Returns: {
          numero: number
          serie: string
        }[]
      }
      fn_siguiente_correlativo: { Args: { p_prefijo: string }; Returns: number }
      fn_token_talla: { Args: { p_talla: string }; Returns: string }
      importar_catalogo: { Args: { p_catalogo: Json }; Returns: Json }
      mi_sede: { Args: never; Returns: string }
      persona_actual: {
        Args: never
        Returns: {
          auth_user_id: string
          email: string
          id: string
          nombre: string
          rol: string
          sede_id: string
        }[]
      }
      previsualizar_cierre_conteo: {
        Args: { p_conteo_id: string }
        Returns: {
          codigo: string
          color: string
          contada: number
          diferencia: number
          origen: string
          referencia: string
          sistema: number
          talla: string
          variante_id: string
        }[]
      }
      puede_operar_sede: { Args: { p_sede_id: string }; Returns: boolean }
      recalcular_stock: { Args: never; Returns: undefined }
      recibir_lote: {
        Args: {
          p_items: Json
          p_nota?: string
          p_numero_guia?: string
          p_orden_compra_id?: string
          p_origen: string
          p_proveedor?: string
          p_sede_id: string
        }
        Returns: string
      }
      registrar_asiento: {
        Args: {
          p_fecha?: string
          p_glosa: string
          p_lineas: Json
          p_origen: string
          p_referencia_id?: string
          p_referencia_tipo?: string
          p_unidad_id: string
        }
        Returns: string
      }
      registrar_codigo_barras: {
        Args: {
          p_codigo: string
          p_nota?: string
          p_origen?: string
          p_variante_id: string
        }
        Returns: string
      }
      registrar_deposito: {
        Args: {
          p_fecha?: string
          p_monto: number
          p_nota?: string
          p_sede_id: string
        }
        Returns: string
      }
      registrar_gasto: {
        Args: {
          p_categoria: string
          p_especificacion?: string
          p_igv: number
          p_sede_id: string
          p_subtotal: number
          p_total: number
        }
        Returns: string
      }
      registrar_movimiento: {
        Args: {
          p_canal?: string
          p_cantidad: number
          p_contenedor_id?: string
          p_lote_id?: string
          p_monto?: number
          p_motivo?: string
          p_nota?: string
          p_sede_destino_id?: string
          p_sede_id: string
          p_tipo: string
          p_variante_id: string
          p_venta_id?: string
        }
        Returns: string
      }
      registrar_produccion: {
        Args: {
          p_cantidad: number
          p_categoria_id?: string
          p_costo_avios: number
          p_costo_maquila: number
          p_costo_tela: number
          p_detalle?: string
          p_es_muestra?: boolean
          p_fecha_entrega?: string
          p_marcar_terminado?: boolean
          p_material?: string
          p_nota?: string
          p_precio_taller: number
          p_producto_id?: string
          p_referencia?: string
          p_unidad_id: string
          p_variantes?: Json
        }
        Returns: string
      }
      registrar_serie_comprobante: {
        Args: {
          p_sede_id: string
          p_serie: string
          p_siguiente_numero?: number
          p_tipo: string
        }
        Returns: string
      }
      registrar_venta: {
        Args: {
          p_caja_id: string
          p_items: Json
          p_metodo_pago: string
          p_nota?: string
          p_token?: string
        }
        Returns: string
      }
      revertir_produccion_inventario: {
        Args: { p_produccion_id: string }
        Returns: undefined
      }
      set_etapa_produccion: {
        Args: { p_estado: string; p_etapa: string; p_produccion_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  retail: {
    Enums: {},
  },
} as const
