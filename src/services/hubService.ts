/**
 * Hub Service
 * Manages hub creation, updates, and membership queries
 *
 * IMPORTANT: Hubs = Storage Infrastructure ONLY
 * - Users OWN their files (user_id maintained)
 * - Hubs PROVIDE storage backend (S3/R2 config)
 * - Hub membership required for UPLOADING (not viewing own files)
 */

import { supabase } from './supabase';

export interface Hub {
  id: string;
  name: string;
  slug: string;
  description?: string;
  owner_id: string;
  settings: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateHubInput {
  name: string;
  slug: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface UpdateHubInput {
  name?: string;
  description?: string;
  settings?: Record<string, any>;
  is_active?: boolean;
}

/**
 * Create a new hub
 * User becomes hub owner and admin automatically (via trigger)
 */
export async function createHub(
  userId: string,
  input: CreateHubInput
): Promise<Hub> {
  // Validate slug format (lowercase, alphanumeric, hyphens)
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(input.slug)) {
    throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
  }

  const { data, error } = await supabase
    .from('hubs')
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description,
      owner_id: userId,
      settings: input.settings || {}
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {  // Unique violation
      throw new Error('Hub slug already exists');
    }
    throw new Error(`Failed to create hub: ${error.message}`);
  }

  return data as Hub;
}

/**
 * Get hub by ID
 */
export async function getHubById(hubId: string): Promise<Hub | null> {
  const { data, error } = await supabase
    .from('hubs')
    .select('*')
    .eq('id', hubId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {  // Not found
      return null;
    }
    throw new Error(`Failed to get hub: ${error.message}`);
  }

  return data as Hub;
}

/**
 * Get hub by slug
 */
export async function getHubBySlug(slug: string): Promise<Hub | null> {
  const { data, error } = await supabase
    .from('hubs')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {  // Not found
      return null;
    }
    throw new Error(`Failed to get hub: ${error.message}`);
  }

  return data as Hub;
}

/**
 * Get all hubs where user is a member
 */
export async function getUserHubs(userId: string): Promise<Hub[]> {
  const { data, error } = await supabase
    .from('hubs')
    .select(`
      *,
      hub_members!inner(role, status, joined_at)
    `)
    .eq('hub_members.user_id', userId)
    .eq('hub_members.status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get user hubs: ${error.message}`);
  }

  return data as any[];
}

/**
 * Update hub
 * Only hub owner can update
 */
export async function updateHub(
  hubId: string,
  userId: string,
  input: UpdateHubInput
): Promise<Hub> {
  // Verify user is hub owner
  const hub = await getHubById(hubId);
  if (!hub) {
    throw new Error('Hub not found');
  }

  if (hub.owner_id !== userId) {
    throw new Error('Only hub owner can update hub');
  }

  const { data, error } = await supabase
    .from('hubs')
    .update(input)
    .eq('id', hubId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update hub: ${error.message}`);
  }

  return data as Hub;
}

/**
 * Delete hub
 * Only hub owner can delete
 * Cascades to members, storage configs, uploads, folders
 */
export async function deleteHub(hubId: string, userId: string): Promise<void> {
  // Verify user is hub owner
  const hub = await getHubById(hubId);
  if (!hub) {
    throw new Error('Hub not found');
  }

  if (hub.owner_id !== userId) {
    throw new Error('Only hub owner can delete hub');
  }

  const { error } = await supabase
    .from('hubs')
    .delete()
    .eq('id', hubId);

  if (error) {
    throw new Error(`Failed to delete hub: ${error.message}`);
  }
}

/**
 * Check if user is member of hub
 */
export async function isHubMember(
  hubId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('hub_members')
    .select('id')
    .eq('hub_id', hubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  return !!data && !error;
}

/**
 * Check if user is hub admin
 */
export async function isHubAdmin(
  hubId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  return data?.role === 'admin' && !error;
}

/**
 * Get user's role in hub
 */
export async function getUserHubRole(
  hubId: string,
  userId: string
): Promise<'admin' | 'member' | 'viewer' | null> {
  const { data, error } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as 'admin' | 'member' | 'viewer';
}
