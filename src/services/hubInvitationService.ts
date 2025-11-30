/**
 * Hub Invitation Service
 * Handles creating, sending, and accepting hub invitations
 */

import { supabase } from './supabase';
import { addHubMember } from './hubMemberService';

export interface HubInvitation {
  id: string;
  hub_id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invited_by: string;
  invitation_token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  accepted_at?: string;
  created_at: string;
}

export interface CreateInvitationInput {
  email: string;
  role: 'admin' | 'member' | 'viewer';
}

/**
 * Create and send invitation
 * Only admins can invite
 */
export async function createInvitation(
  hubId: string,
  inviterUserId: string,
  input: CreateInvitationInput
): Promise<HubInvitation> {
  // Verify inviter is admin
  const { data: membership } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', hubId)
    .eq('user_id', inviterUserId)
    .eq('status', 'active')
    .single();

  if (membership?.role !== 'admin') {
    throw new Error('Only admins can invite members');
  }

  // Check if user is already a member
  const { data: existingMember } = await supabase
    .from('hub_members')
    .select('id, user:users(email)')
    .eq('hub_id', hubId)
    .eq('status', 'active');

  const alreadyMember = existingMember?.some(
    (m: any) => m.user?.email === input.email
  );

  if (alreadyMember) {
    throw new Error('User is already a member of this hub');
  }

  // Check for existing pending invitation
  const { data: existingInvite } = await supabase
    .from('hub_invitations')
    .select('id')
    .eq('hub_id', hubId)
    .eq('email', input.email)
    .eq('status', 'pending')
    .single();

  if (existingInvite) {
    throw new Error('Invitation already sent to this email');
  }

  // Create invitation
  const { data, error } = await supabase
    .from('hub_invitations')
    .insert({
      hub_id: hubId,
      email: input.email,
      role: input.role,
      invited_by: inviterUserId,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create invitation: ${error.message}`);
  }

  // TODO: Send invitation email
  // await sendInvitationEmail(data.email, data.invitation_token, hubId);

  return data as HubInvitation;
}

/**
 * Get invitation by token
 */
export async function getInvitationByToken(
  token: string
): Promise<HubInvitation | null> {
  const { data, error } = await supabase
    .from('hub_invitations')
    .select('*')
    .eq('invitation_token', token)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {  // Not found
      return null;
    }
    throw new Error(`Failed to get invitation: ${error.message}`);
  }

  return data as HubInvitation;
}

/**
 * Accept invitation
 * Called after user signs up/logs in via invitation link
 */
export async function acceptInvitation(
  token: string,
  userId: string
): Promise<void> {
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new Error(`Invitation is ${invitation.status}`);
  }

  if (new Date(invitation.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('hub_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id);

    throw new Error('Invitation has expired');
  }

  // Verify user's email matches invitation
  const { data: user } = await supabase.auth.admin.getUserById(userId);

  if (user?.user?.email !== invitation.email) {
    throw new Error('Email does not match invitation');
  }

  // Add user to hub
  await addHubMember(
    invitation.hub_id,
    userId,
    invitation.role,
    invitation.invited_by
  );

  // Mark invitation as accepted
  await supabase
    .from('hub_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString()
    })
    .eq('id', invitation.id);
}

/**
 * Revoke invitation
 * Only admins can revoke
 */
export async function revokeInvitation(
  invitationId: string,
  adminUserId: string
): Promise<void> {
  // Get invitation
  const { data: invitation } = await supabase
    .from('hub_invitations')
    .select('hub_id')
    .eq('id', invitationId)
    .single();

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  // Verify admin
  const { data: membership } = await supabase
    .from('hub_members')
    .select('role')
    .eq('hub_id', invitation.hub_id)
    .eq('user_id', adminUserId)
    .eq('status', 'active')
    .single();

  if (membership?.role !== 'admin') {
    throw new Error('Only admins can revoke invitations');
  }

  // Revoke
  const { error } = await supabase
    .from('hub_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId);

  if (error) {
    throw new Error(`Failed to revoke invitation: ${error.message}`);
  }
}

/**
 * Get all invitations for a hub
 */
export async function getHubInvitations(hubId: string): Promise<HubInvitation[]> {
  const { data, error } = await supabase
    .from('hub_invitations')
    .select('*')
    .eq('hub_id', hubId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get hub invitations: ${error.message}`);
  }

  return data as HubInvitation[];
}

/**
 * Clean up expired invitations
 * Called periodically (cron job)
 */
export async function cleanupExpiredInvitations(): Promise<number> {
  const { data, error } = await supabase
    .from('hub_invitations')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    throw new Error(`Failed to cleanup invitations: ${error.message}`);
  }

  return data?.length || 0;
}
