function ToastNotifications({ toastNotifications }) {
  return (<div className="toast-container">{toastNotifications.map(toast => (<div key={toast.id} className="toast"><span style={{ fontSize: '1.5rem' }}>✅</span><span>{toast.message}</span></div>))}</div>);
}
export default ToastNotifications;
