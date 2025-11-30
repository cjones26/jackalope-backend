// Permission Service - Handles file and folder access permission checks
// Checks ownership, file shares, and folder shares with expiration and download limits

import { supabase } from './supabase';
import { Database } from '@/types/database';

type UploadRow = Database['public']['Tables']['uploads']['Row'];
type FolderRow = Database['public']['Tables']['folders']['Row'];
type FileShareRow = Database['public']['Tables']['file_shares']['Row'];
type FolderShareRow = Database['public']['Tables']['folder_shares']['Row'];

export interface FileAccessResult {
  hasAccess: boolean;
  upload: UploadRow | null;
  ownerId: string | null;
}

export interface FolderAccessResult {
  hasAccess: boolean;
  folder: FolderRow | null;
  ownerId: string | null;
}

export class PermissionService {
  /**
   * Check if user has access to a file
   * Checks: ownership, direct file share, folder share (if file is in a folder)
   */
  async checkFileAccess(uploadId: string, requestingUserId: string): Promise<FileAccessResult> {
    // Get the upload record (must be completed to be accessible)
    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('status', 'completed')
      .single();

    if (uploadError || !upload) {
      return { hasAccess: false, upload: null, ownerId: null };
    }

    // Check if user is the owner
    if (upload.user_id === requestingUserId) {
      return { hasAccess: true, upload, ownerId: upload.user_id };
    }

    // Check for direct file share
    const { data: fileShare } = await supabase
      .from('file_shares')
      .select('*')
      .eq('upload_id', uploadId)
      .or(`shared_with.eq.${requestingUserId},shared_with.is.null`) // Specific user or public share
      .gte('expires_at', new Date().toISOString())
      .single();

    if (fileShare) {
      // Check download limits if applicable
      if (
        fileShare.max_downloads !== null &&
        fileShare.download_count !== null &&
        fileShare.download_count >= fileShare.max_downloads
      ) {
        return { hasAccess: false, upload: null, ownerId: null };
      }
      return { hasAccess: true, upload, ownerId: upload.user_id };
    }

    // Check for folder share access if file is in a folder
    if (upload.folder_id) {
      const hasAccess = await this.checkFolderShareAccess(
        upload.folder_id,
        requestingUserId
      );
      if (hasAccess) {
        return { hasAccess: true, upload, ownerId: upload.user_id };
      }
    }

    return { hasAccess: false, upload: null, ownerId: null };
  }

  /**
   * Check if user has access to a folder
   * Checks: ownership, direct folder share
   */
  async checkFolderAccess(
    folderId: string,
    requestingUserId: string
  ): Promise<FolderAccessResult> {
    // Get the folder record
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single();

    if (folderError || !folder) {
      return { hasAccess: false, folder: null, ownerId: null };
    }

    // Check if user is the owner
    if (folder.owner_id === requestingUserId) {
      return { hasAccess: true, folder, ownerId: folder.owner_id };
    }

    // Check for folder share
    const hasAccess = await this.checkFolderShareAccess(folderId, requestingUserId);
    if (hasAccess) {
      return { hasAccess: true, folder, ownerId: folder.owner_id };
    }

    return { hasAccess: false, folder: null, ownerId: null };
  }

  /**
   * Check if user has folder share access
   * Helper method used by both file and folder access checks
   */
  private async checkFolderShareAccess(
    folderId: string,
    requestingUserId: string
  ): Promise<boolean> {
    const { data: folderShare } = await supabase
      .from('folder_shares')
      .select('*')
      .eq('folder_id', folderId)
      .or(`shared_with.eq.${requestingUserId},shared_with.is.null`)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (!folderShare) {
      return false;
    }

    // Check download limits if applicable
    if (
      folderShare.max_downloads !== null &&
      folderShare.download_count !== null &&
      folderShare.download_count >= folderShare.max_downloads
    ) {
      return false;
    }

    return true;
  }

  /**
   * Increment download count for a file share
   */
  async incrementFileShareDownloadCount(uploadId: string, userId: string): Promise<void> {
    try {
      // Find the file share for this upload and user
      const { data: fileShare } = await supabase
        .from('file_shares')
        .select('id, download_count')
        .eq('upload_id', uploadId)
        .or(`shared_with.eq.${userId},shared_with.is.null`)
        .single();

      if (fileShare) {
        const newCount = (fileShare.download_count || 0) + 1;
        await supabase
          .from('file_shares')
          .update({
            download_count: newCount,
            last_accessed_at: new Date().toISOString(),
          })
          .eq('id', fileShare.id);
      }
    } catch (error) {
      // Non-critical, just log
      console.error('Error incrementing file share download count:', error);
    }
  }

  /**
   * Increment download count for a folder share
   */
  async incrementFolderShareDownloadCount(folderId: string, userId: string): Promise<void> {
    try {
      // Find the folder share for this folder and user
      const { data: folderShare } = await supabase
        .from('folder_shares')
        .select('id, download_count')
        .eq('folder_id', folderId)
        .or(`shared_with.eq.${userId},shared_with.is.null`)
        .single();

      if (folderShare) {
        const newCount = (folderShare.download_count || 0) + 1;
        await supabase
          .from('folder_shares')
          .update({
            download_count: newCount,
            last_accessed_at: new Date().toISOString(),
          })
          .eq('id', folderShare.id);
      }
    } catch (error) {
      // Non-critical, just log
      console.error('Error incrementing folder share download count:', error);
    }
  }

  /**
   * Check if user can modify/delete a file
   * Only the owner can modify/delete files
   */
  async canModifyFile(uploadId: string, userId: string): Promise<boolean> {
    const { data: upload } = await supabase
      .from('uploads')
      .select('user_id')
      .eq('upload_id', uploadId)
      .single();

    return upload?.user_id === userId;
  }

  /**
   * Check if user can modify/delete a folder
   * Only the owner can modify/delete folders
   */
  async canModifyFolder(folderId: string, userId: string): Promise<boolean> {
    const { data: folder } = await supabase
      .from('folders')
      .select('owner_id')
      .eq('id', folderId)
      .single();

    return folder?.owner_id === userId;
  }
}
