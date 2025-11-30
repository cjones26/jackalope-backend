/**
 * Hub Member Service
 * Manages hub membership and roles
 */

import { supabase } from './supabase';

export interface HubMember {
  id: string;
  hub_id: string;
  user_id: string;
  role: 'admin' | 'member' | 'viewer';
  status: 'pending' | 'active' | 'suspended';
  invited_by?: string;
  joined_at?: string;
  created_at: string;
}

export interface HubMemberWithUser extends HubMember {
  user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
}

/**
 * Get all members of a hub
 */
export async function getHubMembers(hubId: string): Promise<HubMemberWithUser[]> {
  const { data, error } = await supabase
    .from('hub_members')
    .select(`
      *,
      user:users(id, email, first_name, last_name, avatar_url)
    `)
    .eq('hub_id', hubId)
    .order('joined_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get hub members: ${error.message}`);
  }

  return data as any[];
}

/**
 * Add member to hub
 * Called when accepting invitation or by admin
 */
export async function addHubMember(
  hubId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer',
  invitedBy?: string
): Promise<HubMember> {
  const { data, error } = await supabase
    .from('hub_members')
    .insert({
      hub_id: hubId,
      user_id: userId,
      role,
      status: 'active',
      invited_by: invitedBy,
      joined_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {  // Unique violation
      throw new Error('User is already a member of this hub');
    }
    throw new Error(`Failed to add hub member: ${error.message}`);
  }

  return data as HubMember;
}

/**
 * Update member role
 * Only admins can update roles
 */
export async function updateMemberRole(
  hubId: string,
  userId: string,
  newRole: 'admin' | 'member' | 'viewer',
  adminUserId: string
): Promise<HubMember> {
  // Verify admin is actually an admin
  const { data: adminCheck } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', adminUserId)
    .eq('status', 'active')
    .single();

  if (adminCheck?.role !== 'admin') {
    throw new Error('Only admins can update member roles');
  }

  // Update role
  const { data, error } = await supabase
    .from('hub_members')
    .update({ role: newRole })
    .eq('hub_id', hubId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update member role: ${error.message}`);
  }

  return data as HubMember;
}

/**
 * Remove member from hub
 * Admins can remove any member
 * Users can remove themselves (leave hub)
 */
export async function removeMember(
  hubId: string,
  userIdToRemove: string,
  requestingUserId: string
): Promise<void> {
  // Check if requesting user is admin or removing themselves
  const { data: membership } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', requestingUserId)
    .eq('status', 'active')
    .single();

  const isAdmin = membership?.role === 'admin';
  const isSelf = requestingUserId === userIdToRemove;

  if (!isAdmin && !isSelf) {
    throw new Error('Only admins can remove members, or users can remove themselves');
  }

  // Check if trying to remove hub owner
  const { data: hub } = await supabase
    .from('hubs')
    .select('owner_id')
    .eq('id', hubId)
    .single();

  if (hub?.owner_id === userIdToRemove) {
    throw new Error('Cannot remove hub owner. Transfer ownership or delete hub instead.');
  }

  // Remove member
  const { error } = await supabase
    .from('hub_members')
    .delete()
    .eq('hub_id', hubId)
    .eq('user_id', userIdToRemove);

  if (error) {
    throw new Error(`Failed to remove member: ${error.message}`);
  }
}

/**
 * Suspend member
 * Only admins can suspend
 */
export async function suspendMember(
  hubId: string,
  userIdToSuspend: string,
  adminUserId: string
): Promise<HubMember> {
  // Verify admin
  const { data: adminCheck } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', adminUserId)
    .eq('status', 'active')
    .single();

  if (adminCheck?.role !== 'admin') {
    throw new Error('Only admins can suspend members');
  }

  const { data, error } = await supabase
    .from('hub_members')
    .update({ status: 'suspended' })
    .eq('hub_id', hubId)
    .eq('user_id', userIdToSuspend)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to suspend member: ${error.message}`);
  }

  return data as HubMember;
}

/**
 * Reactivate suspended member
 * Only admins can reactivate
 */
export async function reactivateMember(
  hubId: string,
  userIdToReactivate: string,
  adminUserId: string
): Promise<HubMember> {
  // Verify admin
  const { data: adminCheck } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', adminUserId)
    .eq('status', 'active')
    .single();

  if (adminCheck?.role !== 'admin') {
    throw new Error('Only admins can reactivate members');
  }

  const { data, error } = await supabase
    .from('hub_members')
    .update({ status: 'active' })
    .eq('hub_id', hubId)
    .eq('user_id', userIdToReactivate)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to reactivate member: ${error.message}`);
  }

  return data as HubMember;
}

/**
 * Get users in same hub network as current user
 * For share autocomplete - only show users in shared hubs
 */
export async function getHubNetworkUsers(userId: string): Promise<any[]> {
  // Get hubs where user is a member
  const { data: userHubs, error: hubsError } = await supabase
    .from('hub_members')
    .select('hub_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (hubsError || !userHubs || userHubs.length === 0) {
    return [];
  }

  const hubIds = userHubs.map(h => h.hub_id);

  // Get all users who are members of those hubs (excluding current user)
  const { data: networkUsers, error: usersError } = await supabase
    .from('hub_members')
    .select(`
      user:users(id, email, first_name, last_name, avatar_url)
    `)
    .in('hub_id', hubIds)
    .eq('status', 'active')
    .neq('user_id', userId);

  if (usersError) {
    throw new Error(`Failed to get hub network users: ${usersError.message}`);
  }

  // Deduplicate users (same user might be in multiple shared hubs)
  const uniqueUsers = new Map();
  networkUsers?.forEach((item: any) => {
    if (item.user && !uniqueUsers.has(item.user.id)) {
      uniqueUsers.set(item.user.id, item.user);
    }
  });

  return Array.from(uniqueUsers.values());
}
