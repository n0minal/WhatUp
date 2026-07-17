import type { MessageStatus } from '../types';

const LABELS: Record<MessageStatus, string> = {
  received: 'Received',
  processing: 'Processing',
  sent: 'Sent',
  failed: 'Failed',
};

function Icon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'received':
      // Down-into-tray arrow
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 2v7M5 6.5 8 9.5l3-3M3 12.5h10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'processing':
      // Spinner arc (rotation animated in CSS)
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="spin">
          <path
            d="M14 8a6 6 0 1 1-6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'sent':
      // Double check
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="m1.5 8.5 3 3L10 6M7 11l1 1L13.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'failed':
      // Exclamation in circle
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.8v3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="11.2" r="0.9" fill="currentColor" />
        </svg>
      );
  }
}

export function StatusIndicator({ status, withLabel = false }: { status: MessageStatus; withLabel?: boolean }) {
  return (
    <span className={`status status--${status}`} title={LABELS[status]}>
      <Icon status={status} />
      {withLabel && <span className="status__label">{LABELS[status]}</span>}
    </span>
  );
}
