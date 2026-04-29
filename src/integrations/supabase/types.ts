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
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          month: string | null
          note: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          month?: string | null
          note?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          month?: string | null
          note?: string | null
        }
        Relationships: []
      }
      bill_items: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bill_id: string
          created_at: string
          id: string
          member_id: string
          note: string | null
          paid_on: string | null
          requested_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bill_id: string
          created_at?: string
          id?: string
          member_id: string
          note?: string | null
          paid_on?: string | null
          requested_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bill_id?: string
          created_at?: string
          id?: string
          member_id?: string
          note?: string | null
          paid_on?: string | null
          requested_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          is_paid: boolean
          member_id: string
          note: string | null
          paid_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          is_paid?: boolean
          member_id: string
          note?: string | null
          paid_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          is_paid?: boolean
          member_id?: string
          note?: string | null
          paid_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bills_v2: {
        Row: {
          bill_type: string
          created_at: string
          created_by: string | null
          due_date: string
          due_month: string | null
          id: string
          notes: string | null
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          bill_type: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          due_month?: string | null
          id?: string
          notes?: string | null
          title: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bill_type?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          due_month?: string | null
          id?: string
          notes?: string | null
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      correction_requests: {
        Row: {
          created_at: string
          current_value: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          member_id: string | null
          month: string | null
          reason: string
          requested_by: string
          requested_value: Json | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          current_value?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          member_id?: string | null
          month?: string | null
          reason: string
          requested_by: string
          requested_value?: Json | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          current_value?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          member_id?: string | null
          month?: string | null
          reason?: string
          requested_by?: string
          requested_value?: Json | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          member_id: string
          method: string
          note: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          id?: string
          member_id: string
          method?: string
          note?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          member_id?: string
          method?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          title: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          date?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          title: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          title?: string
        }
        Relationships: []
      }
      meals: {
        Row: {
          created_at: string
          date: string
          id: string
          meal_count: number
          member_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          meal_count?: number
          member_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          meal_count?: number
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_links: {
        Row: {
          created_at: string
          member_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_links_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          rent_amount: number
          room: string | null
          seat_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          rent_amount?: number
          room?: string | null
          seat_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          rent_amount?: number
          room?: string | null
          seat_name?: string | null
        }
        Relationships: []
      }
      months: {
        Row: {
          closed_at: string | null
          created_at: string
          final_meal_rate: number
          id: string
          is_closed: boolean
          month: string
          total_expense: number
          total_meals: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          final_meal_rate?: number
          id?: string
          is_closed?: boolean
          month: string
          total_expense?: number
          total_meals?: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          final_meal_rate?: number
          id?: string
          is_closed?: boolean
          month?: string
          total_expense?: number
          total_meals?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      signup_allowlist: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          note: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          note?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_members_with_phone: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string
          room: string
        }[]
      }
      apply_correction: {
        Args: { _note?: string; _request_id: string }
        Returns: undefined
      }
      current_member_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_month_closed: { Args: { _date: string }; Returns: boolean }
      jsonb_diff: { Args: { new: Json; old: Json }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "member" | "bazar_contributor"
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
  public: {
    Enums: {
      app_role: ["admin", "member", "bazar_contributor"],
    },
  },
} as const
