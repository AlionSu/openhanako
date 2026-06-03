import { memo, useEffect, useRef, useState } from 'react';
import { AttachmentChip } from '../shared/AttachmentChip';
import { FolderIcon } from '../shared/FolderIcon';
import { kindOfFileName } from '../../utils/file-kind';
import styles from './InputArea.module.css';

export const AttachedFilesBar = memo(function AttachedFilesBar({ files, onRemove }: {
  files: Array<{ path: string; name: string; isDirectory?: boolean; base64Data?: string; mimeType?: string }>;
  onRemove: (index: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(true);
  const [playingPath, setPlayingPath] = useState<string | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
    }
    audioRef.current = null;
    if (mountedRef.current) setPlayingPath(null);
  };

  useEffect(() => () => {
    mountedRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
  }, []);

  const handleAudioToggle = (file: { path: string; name: string; base64Data?: string; mimeType?: string }) => {
    if (playingPath === file.path) {
      stopAudio();
      return;
    }

    stopAudio();
    const src = getMediaUrl(file);
    if (!src) return;

    const audio = new Audio(src);
    audioRef.current = audio;
    setPlayingPath(file.path);
    audio.onended = () => {
      if (audioRef.current === audio) stopAudio();
    };
    audio.onerror = () => {
      if (audioRef.current === audio) stopAudio();
    };
    const playResult = audio.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => {
        if (audioRef.current === audio) stopAudio();
      });
    }
  };

  return (
    <div className={styles['attached-files']}>
      {files.map((f, i) => {
        const kind = f.isDirectory ? 'directory' : kindOfFileName(f.name || f.path, f.mimeType);
        if (kind === 'audio') {
          return (
            <AudioAttachmentChip
              key={f.path}
              file={f}
              playing={playingPath === f.path}
              onToggle={() => handleAudioToggle(f)}
              onRemove={() => {
                if (playingPath === f.path) stopAudio();
                onRemove(i);
              }}
            />
          );
        }
        if (kind === 'image' || kind === 'svg') {
          return (
            <ImageAttachmentChip
              key={f.path}
              file={f}
              onRemove={() => onRemove(i)}
            />
          );
        }
        return (
          <AttachmentChip
            key={f.path}
            icon={f.isDirectory ? <FolderIcon /> : <ClipIcon />}
            name={f.name}
            onRemove={() => onRemove(i)}
          />
        );
      })}
    </div>
  );
});

function ImageAttachmentChip({
  file,
  onRemove,
}: {
  file: { path: string; name: string; base64Data?: string; mimeType?: string };
  onRemove: () => void;
}) {
  const src = getMediaUrl(file);
  return (
    <span className={styles['media-attachment-chip']} title={file.name}>
      <span className={styles['image-attachment-preview']} aria-hidden="true">
        {src ? (
          <img src={src} alt="" />
        ) : (
          <ClipIcon />
        )}
      </span>
      <span className={styles['media-attachment-name']}>{file.name}</span>
      <RemoveButton name={file.name} onRemove={onRemove} />
    </span>
  );
}

function AudioAttachmentChip({
  file,
  playing,
  onToggle,
  onRemove,
}: {
  file: { path: string; name: string };
  playing: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <span className={styles['media-attachment-chip']} title={file.name}>
      <button
        type="button"
        className={`${styles['audio-attachment-play']}${playing ? ` ${styles['is-playing']}` : ''}`}
        onClick={onToggle}
        aria-label={playing ? `Pause ${file.name}` : `Play ${file.name}`}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className={styles['audio-attachment-wave']} aria-hidden="true" data-testid="audio-attachment-wave">
        {[5, 11, 8, 15, 7, 13, 6, 10, 14, 8, 12, 5].map((height, index) => (
          <span
            key={`${height}-${index}`}
            className={styles['audio-attachment-bar']}
            style={{ height }}
          />
        ))}
      </span>
      <RemoveButton name={file.name} onRemove={onRemove} />
    </span>
  );
}

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      className={styles['media-attachment-remove']}
      onClick={onRemove}
      aria-label={`Remove ${name}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function getMediaUrl(file: { path: string; base64Data?: string; mimeType?: string }) {
  if (file.base64Data && file.mimeType) {
    return `data:${file.mimeType};base64,${file.base64Data}`;
  }
  if (typeof window === 'undefined') return null;
  return window.platform?.getFileUrl?.(file.path) || null;
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72L18.8 12 8 5.14z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
