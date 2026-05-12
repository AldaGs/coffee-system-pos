const ICONS = { success: '✅', warning: '⚠️', error: '⛔' };

function ToastNotifications({ toastNotifications }) {
  if (!toastNotifications || toastNotifications.length === 0) return null;

  return (
    <div className="toast-container">
      {toastNotifications.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type || 'success'}`}>
          <span style={{ fontSize: '1.5rem' }}>{ICONS[toast.type] || ICONS.success}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

export default ToastNotifications;
