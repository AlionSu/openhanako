import { memo, useEffect, useRef, type RefObject } from 'react';
import type { FileMentionItem } from '../../utils/file-mention-items';
import { kindOfFileName } from '../../utils/file-kind';
import { FolderIcon } from '../shared/FolderIcon';
import styles from './InputArea.module.css';

export const FileMentionMenu = memo(function FileMentionMenu({
  items,
  selected,
  busy,
  onSelect,
  onHover,
}: {
  items: FileMentionItem[];
  selected: number;
  busy: boolean;
  onSelect: (item: FileMentionItem) => void;
  onHover: (index: number) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className={styles['file-mention-menu']}>
      {items.map((item, i) => (
        <FileMentionButton
          key={item.id}
          item={item}
          selected={i === selected}
          refProp={i === selected ? selectedRef : undefined}
          onHover={() => onHover(i)}
          onSelect={() => onSelect(item)}
        />
      ))}
      {items.length === 0 && busy && <div className={styles['file-mention-empty']}>...</div>}
    </div>
  );
});

function FileMentionButton({
  item,
  selected,
  refProp,
  onHover,
  onSelect,
}: {
  item: FileMentionItem;
  selected: boolean;
  refProp?: RefObject<HTMLButtonElement | null>;
  onHover: () => void;
  onSelect: () => void;
}) {
  const kind = item.isDirectory ? 'directory' : kindOfFileName(item.name || item.path, item.mimeType);
  const thumbnailUrl = (kind === 'image' || kind === 'svg') && item.path && typeof window !== 'undefined'
    ? window.platform?.getFileUrl?.(item.path)
    : null;

  return (
    <button
      ref={refProp}
      className={`${styles['file-mention-item']}${selected ? ` ${styles.selected}` : ''}`}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
    >
      <span className={styles['file-mention-icon']} aria-hidden="true">
        {thumbnailUrl ? (
          <img className={styles['file-mention-thumbnail']} src={thumbnailUrl} alt="" />
        ) : item.isDirectory ? <FolderIcon /> : <FileIcon />}
      </span>
      <span className={styles['file-mention-main']}>
        <span className={styles['file-mention-name']}>@{item.name}</span>
        <span className={styles['file-mention-detail']}>{item.detail || item.path}</span>
      </span>
    </button>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4 1.8h5.2L12 4.7v9.5H4z M9.2 1.8v3h2.8" />
    </svg>
  );
}
