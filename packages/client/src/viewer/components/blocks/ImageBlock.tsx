import * as React from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Dialog, DialogContent, DialogTrigger } from '../../../components/ui/dialog';

interface ImageBlockProps {
  ref_: string;
  mediaType?: string;
  encoding?: 'base64' | 'url' | 'file';
}

/**
 * Inline image with click-to-zoom. Resolves `ref` from LOCAL data only
 * (data-URI / base64 / object-URL). NEVER fetches a remote URL. A broken or
 * unresolvable ref renders a non-crashing placeholder (FR-6).
 */
export function ImageBlock({ ref_, mediaType, encoding }: ImageBlockProps) {
  const [broken, setBroken] = React.useState(false);
  const src = resolveLocalSrc(ref_, mediaType, encoding);

  if (!src || broken) {
    return (
      <div
        className={cn(
          'my-3 flex items-center gap-2 rounded-md border border-dashed border-border',
          'bg-sidebar px-3 py-2 text-body-sm text-muted',
        )}
      >
        <ImageOff className="size-4 shrink-0" />
        <span>Image unavailable</span>
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        className="my-3 block cursor-zoom-in rounded-md border border-border bg-surface p-1"
        aria-label="Zoom image"
      >
        <img
          src={src}
          alt="Session image"
          loading="lazy"
          onError={() => setBroken(true)}
          className="max-h-80 max-w-full rounded-sm object-contain"
        />
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] p-2">
        <img
          src={src}
          alt="Session image (zoomed)"
          className="max-h-[80vh] max-w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

/** Build a safe local src. Remote http(s) refs are refused (offline guarantee). */
function resolveLocalSrc(
  ref: string,
  mediaType: string | undefined,
  encoding: 'base64' | 'url' | 'file' | undefined,
): string | null {
  if (!ref) return null;
  // Already a usable local source.
  if (ref.startsWith('data:') || ref.startsWith('blob:')) return ref;
  // 'url' encoding pointing at a remote resource is refused.
  if (/^https?:/i.test(ref)) return null;
  if (encoding === 'url') {
    // A non-http url encoding we don't recognize → refuse rather than guess.
    return null;
  }
  // base64 payload without the data: prefix.
  if (encoding === 'base64' || /^[A-Za-z0-9+/=\s]+$/.test(ref.slice(0, 64))) {
    const mt = mediaType || 'image/png';
    return `data:${mt};base64,${ref.replace(/\s+/g, '')}`;
  }
  return null;
}
