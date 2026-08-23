import {
  siAmazons3,
  siBackblaze,
  siBox,
  siDropbox,
  siGoogledrive,
  siMega,
  siNextcloud,
  siOpenstack,
  siOwncloud,
  siProtondrive,
} from 'simple-icons';
import { Cloud, Folder, HardDrive, Network, Server, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SimpleIcon {
  title: string;
  path: string;
  hex: string;
}

/**
 * rclone backend type -> brand icon. Providers simple-icons does not ship
 * (OneDrive, pCloud, …) fall back to a generic glyph tinted with the brand
 * colour, so the sidebar stays visually consistent.
 */
const BRAND: Record<string, SimpleIcon> = {
  drive: siGoogledrive,
  s3: siAmazons3,
  dropbox: siDropbox,
  box: siBox,
  mega: siMega,
  b2: siBackblaze,
  nextcloud: siNextcloud,
  owncloud: siOwncloud,
  protondrive: siProtondrive,
  swift: siOpenstack,
};

const FALLBACK: Record<string, { icon: LucideIcon; hex: string }> = {
  onedrive: { icon: Cloud, hex: '#0078D4' },
  pcloud: { icon: Cloud, hex: '#00A6E2' },
  azureblob: { icon: Cloud, hex: '#0078D4' },
  googlecloudstorage: { icon: Cloud, hex: '#4285F4' },
  sftp: { icon: Server, hex: '#6366f1' },
  ftp: { icon: Server, hex: '#64748b' },
  smb: { icon: Network, hex: '#8b5cf6' },
  webdav: { icon: Share2, hex: '#0ea5e9' },
  http: { icon: Share2, hex: '#0ea5e9' },
  local: { icon: HardDrive, hex: '#71717a' },
  alias: { icon: Folder, hex: '#71717a' },
  crypt: { icon: HardDrive, hex: '#22c55e' },
};

export function ProviderIcon({
  type,
  className,
  monochrome = false,
}: {
  type: string;
  className?: string;
  monochrome?: boolean;
}) {
  const brand = BRAND[type];
  if (brand) {
    return (
      <svg
        role="img"
        aria-label={brand.title}
        viewBox="0 0 24 24"
        className={cn('size-4 shrink-0', className)}
        fill={monochrome ? 'currentColor' : `#${brand.hex}`}
      >
        <path d={brand.path} />
      </svg>
    );
  }

  const fallback = FALLBACK[type];
  const Icon = fallback?.icon ?? Cloud;
  return (
    <Icon
      aria-label={type}
      className={cn('size-4 shrink-0', className)}
      style={monochrome || !fallback ? undefined : { color: fallback.hex }}
    />
  );
}
