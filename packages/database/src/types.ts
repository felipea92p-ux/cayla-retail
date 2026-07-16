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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bom_items: {
        Row: {
          cantidad_requerida: number
          created_at: string
          id: string
          insumo: string
          producto_id: string
          unidad: string
        }
        Insert: {
          cantidad_requerida: number
          created_at?: string
          id?: string
          insumo: string
          producto_id: string
          unidad: string
        }
        Update: {
          cantidad_requerida?: number
          created_at?: string
          id?: string
          insumo?: string
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
      movimientos: {
        Row: {
          canal: string | null
          cantidad: number
          created_at: string
          id: string
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
          created_at?: string
          id?: string
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
          created_at?: string
          id?: string
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
          id: string
          proveedor: string
          sede_destino_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha?: string
          id?: string
          proveedor: string
          sede_destino_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          id?: string
          proveedor?: string
          sede_destino_id?: string
          updated_at?: string
        }
        Relationships: [
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
          estado: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          sede_id: string
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad_planeada: number
          cantidad_producida?: number
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          sede_id: string
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad_planeada?: number
          cantidad_producida?: number
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          sede_id?: string
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
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
      personas: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          created_at: string
          id: string
          nombre: string
          rol: string
          sede_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          nombre: string
          rol: string
          sede_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
          rol?: string
          sede_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          categoria: string | null
          created_at: string
          descripcion: string | null
          estado: string
          genero: string | null
          id: string
          marca: string | null
          referencia: string
          sku_padre: string
          temporada: string | null
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          genero?: string | null
          id?: string
          marca?: string | null
          referencia: string
          sku_padre: string
          temporada?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          genero?: string | null
          id?: string
          marca?: string | null
          referencia?: string
          sku_padre?: string
          temporada?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sedes: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          id: string
          nombre: string
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          tipo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock: {
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
      variantes: {
        Row: {
          color: string | null
          costo: number
          created_at: string
          foto_url: string | null
          id: string
          precio: number
          precio_oferta: number | null
          producto_id: string
          sku: string
          stock_minimo: number
          talla: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          costo?: number
          created_at?: string
          foto_url?: string | null
          id?: string
          precio?: number
          precio_oferta?: number | null
          producto_id: string
          sku: string
          stock_minimo?: number
          talla?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          costo?: number
          created_at?: string
          foto_url?: string | null
          id?: string
          precio?: number
          precio_oferta?: number | null
          producto_id?: string
          sku?: string
          stock_minimo?: number
          talla?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_aplicar_movimiento: {
        Args: { p_movimiento_id: string }
        Returns: undefined
      }
      fn_es_lider: { Args: never; Returns: boolean }
      fn_persona_actual: {
        Args: never
        Returns: {
          activo: boolean
          auth_user_id: string | null
          created_at: string
          id: string
          nombre: string
          rol: string
          sede_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "personas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_sede_actual_persona: { Args: never; Returns: string }
      recalcular_stock: { Args: never; Returns: undefined }
      registrar_movimiento: {
        Args: {
          p_canal?: string
          p_cantidad: number
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
