export interface LocalPhoto { file: File; path: string }
export const isJxr = (name: string) => /\.(jxr|wdp|hdp)$/i.test(name);
export const photoKey = ({ file, path }: LocalPhoto) => JSON.stringify([path, file.size, file.lastModified]);

export function selectedPhotos(files: Iterable<File>): LocalPhoto[] {
  return Array.from(files, file => ({ file, path: file.webkitRelativePath || file.name }));
}

// Capture entries before the drop handler returns: the data store becomes protected.
export async function droppedPhotos(transfer: DataTransfer): Promise<{ photos: LocalPhoto[]; failed: number }> {
  const fallback = selectedPhotos(transfer.files);
  const entries = Array.from(transfer.items, item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
  if (!entries.length) return { photos: fallback, failed: 0 };
  const photos: LocalPhoto[] = [];
  let failed = 0;
  async function visit(entry: FileSystemEntry): Promise<void> {
    try {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
        photos.push({ file, path: entry.fullPath.replace(/^\//, '') });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        // Chromium returns directories in batches (often 100 entries).
        for (;;) {
          const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
          if (!batch.length) break;
          for (const child of batch) await visit(child);
        }
      }
    } catch { failed++; }
  }
  for (const entry of entries) await visit(entry);
  return { photos, failed };
}
