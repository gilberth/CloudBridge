import {
  Archive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  File as FileIcon,
  Folder,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const EXTENSIONS: Record<string, { icon: typeof FileIcon; className: string }> = {};

const register = (icon: typeof FileIcon, className: string, extensions: string[]) => {
  for (const extension of extensions) EXTENSIONS[extension] = { icon, className };
};

register(FileImage, 'text-violet-500', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic', 'avif', 'tiff']);
register(FileVideo, 'text-rose-500', ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv']);
register(FileAudio, 'text-amber-500', ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus']);
register(Archive, 'text-orange-500', ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst']);
register(FileSpreadsheet, 'text-emerald-500', ['csv', 'xls', 'xlsx', 'ods', 'tsv']);
register(FileText, 'text-sky-500', ['txt', 'md', 'pdf', 'doc', 'docx', 'rtf', 'odt', 'log']);
register(FileCode, 'text-teal-500', [
  'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'toml', 'sh', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'html', 'css', 'sql', 'conf', 'ini',
]);

export function FileTypeIcon({
  name,
  isDir,
  className,
}: {
  name: string;
  isDir: boolean;
  className?: string;
}) {
  if (isDir) return <Folder className={cn('size-4 shrink-0 text-primary', className)} />;
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const match = EXTENSIONS[extension];
  const Icon = match?.icon ?? FileIcon;
  return <Icon className={cn('size-4 shrink-0 text-muted-foreground', match?.className, className)} />;
}
