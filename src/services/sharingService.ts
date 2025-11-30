/**
 * Sharing Service
 * Manages user-to-user file and folder sharing
 * Uses existing file_shares and folder_shares tables
 */

import { supabase } from './supabase';

export interface FileShare {
  id: string;
  upload_id: string;
  shared_by: string;
  shared_with: string | null;  // null = public share
  permission: 'view' | 'download';
  share_token: string;
  expires_at?: string;
  max_downloads?: number;
  download_count: number;
  allow_download: boolean;
  created_at: string;
}

export interface FolderShare {
  id: string;
  folder_id: string;
  shared_by: string;
  shared_with: string | null;  // null = public share
  permission: 'view' | 'edit' | 'admin';
  share_token: string;
  expires_at?: string;
  max_downloads?: number;
  download_count: number;
  allow_download: boolean;
  recursive: boolean;
  created_at: string;
}

/**
 * Share file with specific user
 */
export async function shareFile(
  uploadId: string,
  sharedBy: string,
  sharedWith: string,
  permission: 'view' | 'download' = 'view',
  options?: {
    expiresAt?: string;
    maxDownloads?: number;
    allowDownload?: boolean;
  }
): Promise<FileShare> {
  // Verify sharedBy owns the file
  const { data: upload } = await supabase
    .from('uploads')
    .select('user_id')
    .eq('upload_id', uploadId)
    .single();

  if (!upload || upload.user_id !== sharedBy) {
    throw new Error('You can only share files you own');
  }

  const { data, error } = await supabase
    .from('file_shares')
    .insert({
      upload_id: uploadId,
      shared_by: sharedBy,
      shared_with: sharedWith,
      permission,
      expires_at: options?.expiresAt,
      max_downloads: options?.maxDownloads,
      allow_download: options?.allowDownload ?? true
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {  // Unique violation
      throw new Error('File already shared with this user');
    }
    throw new Error(`Failed to share file: ${error.message}`);
  }

  return data as FileShare;
}

/**
 * Share folder with specific user
 */
export async function shareFolder(
  folderId: string,
  sharedBy: string,
  sharedWith: string,
  permission: 'view' | 'edit' | 'admin' = 'view',
  recursive: boolean = true,
  options?: {
    expiresAt?: string;
    maxDownloads?: number;
    allowDownload?: boolean;
  }
): Promise<FolderShare> {
  // Verify sharedBy owns the folder
  const { data: folder } = await supabase
    .from('folders')
    .select('owner_id')
    .eq('folder_id', folderId)
    .single();

  if (!folder || folder.owner_id !== sharedBy) {
    throw new Error('You can only share folders you own');
  }

  const { data, error } = await supabase
    .from('folder_shares')
    .insert({
      folder_id: folderId,
      shared_by: sharedBy,
      shared_with: sharedWith,
      permission,
      recursive,
      expires_at: options?.expiresAt,
      max_downloads: options?.maxDownloads,
      allow_download: options?.allowDownload ?? true
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {  // Unique violation
      throw new Error('Folder already shared with this user');
    }
    throw new Error(`Failed to share folder: ${error.message}`);
  }

  return data as FolderShare;
}

/**
 * Unshare file from specific user
 */
export async function unshareFile(
  uploadId: string,
  sharedWith: string,
  requestingUserId: string
): Promise<void> {
  // Verify requesting user owns the file
  const { data: upload } = await supabase
    .from('uploads')
    .select('user_id')
    .eq('upload_id', uploadId)
    .single();

  if (!upload || upload.user_id !== requestingUserId) {
    throw new Error('You can only unshare files you own');
  }

  const { error } = await supabase
    .from('file_shares')
    .delete()
    .eq('upload_id', uploadId)
    .eq('shared_with', sharedWith);

  if (error) {
    throw new Error(`Failed to unshare file: ${error.message}`);
  }
}

/**
 * Unshare folder from specific user
 */
export async function unshareFolder(
  folderId: string,
  sharedWith: string,
  requestingUserId: string
): Promise<void> {
  // Verify requesting user owns the folder
  const { data: folder } = await supabase
    .from('folders')
    .select('owner_id')
    .eq('folder_id', folderId)
    .single();

  if (!folder || folder.owner_id !== requestingUserId) {
    throw new Error('You can only unshare folders you own');
  }

  const { error } = await supabase
    .from('folder_shares')
    .delete()
    .eq('folder_id', folderId)
    .eq('shared_with', sharedWith);

  if (error) {
    throw new Error(`Failed to unshare folder: ${error.message}`);
  }
}

/**
 * Get all users a file is shared with
 */
export async function getFileShares(uploadId: string): Promise<FileShare[]> {
  const { data, error } = await supabase
    .from('file_shares')
    .select('*')
    .eq('upload_id', uploadId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get file shares: ${error.message}`);
  }

  return data as FileShare[];
}

/**
 * Get all users a folder is shared with
 */
export async function getFolderShares(folderId: string): Promise<FolderShare[]> {
  const { data, error } = await supabase
    .from('folder_shares')
    .select('*')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false});

  if (error) {
    throw new Error(`Failed to get folder shares: ${error.message}`);
  }

  return data as FolderShare[];
}

/**
 * Get all files shared with a user
 */
export async function getFilesSharedWithUser(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('file_shares')
    .select(`
      *,
      upload:uploads(*)
    `)
    .eq('shared_with', userId)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get shared files: ${error.message}`);
  }

  return data as any[];
}

/**
 * Get all folders shared with a user
 */
export async function getFoldersSharedWithUser(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('folder_shares')
    .select(`
      *,
      folder:folders(*)
    `)
    .eq('shared_with', userId)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get shared folders: ${error.message}`);
  }

  return data as any[];
}
