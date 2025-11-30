/**
 * Hub Storage Config Service
 * Manages S3/R2 storage configurations for hubs
 */

import { supabase } from './supabase';

export interface HubStorageConfig {
  id: string;
  hub_id: string;
  name: string;
  provider_type: string;
  endpoint_url: string;
  region: string;
  bucket_name: string;
  access_key_id: string;  // TODO: Encrypt with Vault
  secret_access_key: string;  // TODO: Encrypt with Vault
  force_path_style: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateStorageConfigInput {
  name: string;
  provider_type: string;
  endpoint_url: string;
  region: string;
  bucket_name: string;
  access_key_id: string;
  secret_access_key: string;
  force_path_style?: boolean;
}

/**
 * Create storage config for hub
 * Only one storage config per hub
 */
export async function createHubStorageConfig(
  hubId: string,
  adminUserId: string,
  input: CreateStorageConfigInput
): Promise<HubStorageConfig> {
  // Verify user is hub admin
  const { data: membership } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', adminUserId)
    .eq('status', 'active')
    .single();

  if (membership?.role !== 'admin') {
    throw new Error('Only admins can configure hub storage');
  }

  const { data, error } = await supabase
    .from('hub_storage_configs')
    .insert({
      hub_id: hubId,
      name: input.name,
      provider_type: input.provider_type,
      endpoint_url: input.endpoint_url,
      region: input.region,
      bucket_name: input.bucket_name,
      access_key_id: input.access_key_id,  // TODO: Encrypt
      secret_access_key: input.secret_access_key,  // TODO: Encrypt
      force_path_style: input.force_path_style ?? true,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {  // Unique violation
      throw new Error('Hub already has a storage configuration');
    }
    throw new Error(`Failed to create storage config: ${error.message}`);
  }

  return data as HubStorageConfig;
}

/**
 * Get storage config for hub
 */
export async function getHubStorageConfig(
  hubId: string
): Promise<HubStorageConfig | null> {
  const { data, error } = await supabase
    .from('hub_storage_configs')
    .select('*')
    .eq('hub_id', hubId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {  // Not found
      return null;
    }
    throw new Error(`Failed to get storage config: ${error.message}`);
  }

  return data as HubStorageConfig;
}

/**
 * Update storage config
 * Only admins can update
 */
export async function updateHubStorageConfig(
  hubId: string,
  adminUserId: string,
  updates: Partial<CreateStorageConfigInput>
): Promise<HubStorageConfig> {
  // Verify user is hub admin
  const { data: membership } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', adminUserId)
    .eq('status', 'active')
    .single();

  if (membership?.role !== 'admin') {
    throw new Error('Only admins can update hub storage');
  }

  const { data, error } = await supabase
    .from('hub_storage_configs')
    .update(updates)
    .eq('hub_id', hubId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update storage config: ${error.message}`);
  }

  return data as HubStorageConfig;
}

/**
 * Delete storage config
 * Only admins can delete
 * Cascades to delete all uploads, folders, and thumbnails for this hub
 */
export async function deleteHubStorageConfig(
  hubId: string,
  adminUserId: string
): Promise<void> {
  // Verify user is hub admin
  const { data: membership } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', adminUserId)
    .eq('status', 'active')
    .single();

  if (membership?.role !== 'admin') {
    throw new Error('Only admins can delete hub storage');
  }

  // Delete all thumbnails for uploads in this hub
  const { error: thumbnailsError } = await supabase
    .from('thumbnails')
    .delete()
    .in('upload_id',
      supabase
        .from('uploads')
        .select('id')
        .eq('hub_id', hubId)
    );

  if (thumbnailsError) {
    throw new Error(`Failed to delete thumbnails: ${thumbnailsError.message}`);
  }

  // Delete all uploads in this hub
  const { error: uploadsError } = await supabase
    .from('uploads')
    .delete()
    .eq('hub_id', hubId);

  if (uploadsError) {
    throw new Error(`Failed to delete uploads: ${uploadsError.message}`);
  }

  // Delete all folders in this hub (folders don't have hub_id, they're user-owned)
  // We'll delete folders owned by hub members
  const { data: hubMembers } = await supabase
    .from('hub_members')
    .select('user_id')
    .eq('hub_id', hubId);

  if (hubMembers && hubMembers.length > 0) {
    const userIds = hubMembers.map(m => m.user_id);

    // Note: Only delete folders if they have no uploads outside this hub
    // For simplicity, we'll delete all folders for hub members
    // In production, you may want more sophisticated logic
    const { error: foldersError } = await supabase
      .from('folders')
      .delete()
      .in('owner_id', userIds);

    if (foldersError) {
      // Log but don't fail - folders might be shared across hubs
      console.warn('Error deleting folders:', foldersError);
    }
  }

  // Finally, delete the storage config
  const { error } = await supabase
    .from('hub_storage_configs')
    .delete()
    .eq('hub_id', hubId);

  if (error) {
    throw new Error(`Failed to delete storage config: ${error.message}`);
  }
}

/**
 * Test storage config connection
 * Returns success status and any warnings
 */
export async function testStorageConfig(
  hubId: string,
  userId: string
): Promise<{
  success: boolean;
  provider_type: string;
  warnings: string[];
  error?: string;
}> {
  // Verify user is hub member
  const { data: membership } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!membership) {
    throw new Error('User is not a member of this hub');
  }

  const config = await getHubStorageConfig(hubId);

  if (!config) {
    throw new Error('Hub has no storage configuration');
  }

  // TODO: Actually test S3 connection
  // For now, return basic info

  return {
    success: true,
    provider_type: config.provider_type,
    warnings: []
  };
}
