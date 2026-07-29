import { useTranslation } from '../../hooks/useTranslation';
import HelpTab from '../admin/HelpTab';

// Register-facing wrapper around HelpTab so cashiers can open the same help
// content without entering the Admin panel. HelpTab renders its own heading,
// search, and sections; this just frames it in a scrollable modal.
function HelpModal({ isOpen, onClose }) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
      <div
        className="modal-content fade-in"
        style={{ maxWidth: '900px', width: '100%', maxHeight: '90vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}
          >
            ✕
          </button>
        </div>
        <HelpTab />
      </div>
    </div>
  );
}

export default HelpModal;
