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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      file_shares: {
        Row: {
          allow_download: boolean | null
          created_at: string | null
          download_count: number | null
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          max_downloads: number | null
          permission: string
          share_token: string | null
          shared_by: string
          shared_with: string | null
          upload_id: string | null
        }
        Insert: {
          allow_download?: boolean | null
          created_at?: string | null
          download_count?: number | null
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          max_downloads?: number | null
          permission: string
          share_token?: string | null
          shared_by: string
          shared_with?: string | null
          upload_id?: string | null
        }
        Update: {
          allow_download?: boolean | null
          created_at?: string | null
          download_count?: number | null
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          max_downloads?: number | null
          permission?: string
          share_token?: string | null
          shared_by?: string
          shared_with?: string | null
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_shares_shared_with_fkey"
            columns: ["shared_with"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_shares_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["upload_id"]
          },
        ]
      }
      folder_shares: {
        Row: {
          allow_download: boolean | null
          created_at: string | null
          download_count: number | null
          expires_at: string | null
          folder_id: string | null
          id: string
          last_accessed_at: string | null
          max_downloads: number | null
          permission: string
          recursive: boolean | null
          share_token: string | null
          shared_by: string
          shared_with: string | null
        }
        Insert: {
          allow_download?: boolean | null
          created_at?: string | null
          download_count?: number | null
          expires_at?: string | null
          folder_id?: string | null
          id?: string
          last_accessed_at?: string | null
          max_downloads?: number | null
          permission: string
          recursive?: boolean | null
          share_token?: string | null
          shared_by: string
          shared_with?: string | null
        }
        Update: {
          allow_download?: boolean | null
          created_at?: string | null
          download_count?: number | null
          expires_at?: string | null
          folder_id?: string | null
          id?: string
          last_accessed_at?: string | null
          max_downloads?: number | null
          permission?: string
          recursive?: boolean | null
          share_token?: string | null
          shared_by?: string
          shared_with?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folder_shares_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_shares_shared_with_fkey"
            columns: ["shared_with"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string | null
          description: string | null
          hub_id: string | null
          id: string
          name: string
          owner_id: string
          parent_id: string | null
          path: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          hub_id?: string | null
          id?: string
          name: string
          owner_id: string
          parent_id?: string | null
          path: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          hub_id?: string | null
          id?: string
          name?: string
          owner_id?: string
          parent_id?: string | null
          path?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folders_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          hub_id: string
          id: string
          invitation_token: string | null
          invited_by: string
          role: string
          status: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          hub_id: string
          id?: string
          invitation_token?: string | null
          invited_by: string
          role: string
          status?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          hub_id?: string
          id?: string
          invitation_token?: string | null
          invited_by?: string
          role?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hub_invitations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_members: {
        Row: {
          created_at: string | null
          default_folder_id: string | null
          hub_id: string
          id: string
          invited_by: string | null
          joined_at: string | null
          role: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          default_folder_id?: string | null
          hub_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          default_folder_id?: string | null
          hub_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_members_default_folder_id_fkey"
            columns: ["default_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_members_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_storage_configs: {
        Row: {
          access_key_id: string
          bucket_name: string
          created_at: string | null
          endpoint_url: string
          force_path_style: boolean | null
          hub_id: string
          id: string
          is_active: boolean | null
          name: string
          provider_type: string
          region: string
          secret_access_key: string
          updated_at: string | null
        }
        Insert: {
          access_key_id: string
          bucket_name: string
          created_at?: string | null
          endpoint_url: string
          force_path_style?: boolean | null
          hub_id: string
          id?: string
          is_active?: boolean | null
          name: string
          provider_type: string
          region: string
          secret_access_key: string
          updated_at?: string | null
        }
        Update: {
          access_key_id?: string
          bucket_name?: string
          created_at?: string | null
          endpoint_url?: string
          force_path_style?: boolean | null
          hub_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          provider_type?: string
          region?: string
          secret_access_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hub_storage_configs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: true
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          owner_id: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          owner_id: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          owner_id?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          bucket_name: string
          completed_at: string | null
          content_type: string
          created_at: string | null
          description: string | null
          file_key: string
          file_size_bytes: number | null
          filename: string
          final_bucket_name: string | null
          final_file_key: string | null
          folder_id: string | null
          hub_id: string | null
          hub_storage_config_id: string | null
          id: string
          is_folder_cover: boolean | null
          parts: Json | null
          processing_message: string | null
          processing_progress: number | null
          processing_status: string | null
          sort_order: number | null
          status: string
          tags: string[] | null
          thumbnail_s3_key: string | null
          total_size: number
          updated_at: string | null
          upload_id: string
          upload_type: string
          user_id: string
        }
        Insert: {
          bucket_name: string
          completed_at?: string | null
          content_type: string
          created_at?: string | null
          description?: string | null
          file_key: string
          file_size_bytes?: number | null
          filename: string
          final_bucket_name?: string | null
          final_file_key?: string | null
          folder_id?: string | null
          hub_id?: string | null
          hub_storage_config_id?: string | null
          id?: string
          is_folder_cover?: boolean | null
          parts?: Json | null
          processing_message?: string | null
          processing_progress?: number | null
          processing_status?: string | null
          sort_order?: number | null
          status: string
          tags?: string[] | null
          thumbnail_s3_key?: string | null
          total_size: number
          updated_at?: string | null
          upload_id: string
          upload_type?: string
          user_id: string
        }
        Update: {
          bucket_name?: string
          completed_at?: string | null
          content_type?: string
          created_at?: string | null
          description?: string | null
          file_key?: string
          file_size_bytes?: number | null
          filename?: string
          final_bucket_name?: string | null
          final_file_key?: string | null
          folder_id?: string | null
          hub_id?: string | null
          hub_storage_config_id?: string | null
          id?: string
          is_folder_cover?: boolean | null
          parts?: Json | null
          processing_message?: string | null
          processing_progress?: number | null
          processing_status?: string | null
          sort_order?: number | null
          status?: string
          tags?: string[] | null
          thumbnail_s3_key?: string | null
          total_size?: number
          updated_at?: string | null
          upload_id?: string
          upload_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploads_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_hub_storage_config_id_fkey"
            columns: ["hub_storage_config_id"]
            isOneToOne: false
            referencedRelation: "hub_storage_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_orphaned_avatars: {
        Args: never
        Returns: {
          deleted_file: string
        }[]
      }
      cleanup_stale_uploads: { Args: { hours_old?: number }; Returns: number }
      get_decrypted_storage_config: {
        Args: { config_id: string; requesting_user_id: string }
        Returns: {
          access_key_id: string
          bucket_name: string
          created_at: string
          endpoint_url: string
          force_path_style: boolean
          id: string
          last_used_at: string
          region: string
          secret_access_key: string
          updated_at: string
          user_id: string
        }[]
      }
      identify_orphaned_avatars: {
        Args: never
        Returns: {
          file_size: number
          last_modified: string
          orphaned_file: string
        }[]
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
  public: {
    Enums: {},
  },
} as const
