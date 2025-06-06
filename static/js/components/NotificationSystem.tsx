import React, { useState, useEffect } from 'react';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  persistent?: boolean;
}

interface NotificationSystemProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const NotificationSystem: React.FC<NotificationSystemProps> = ({ notifications, onDismiss }) => {
  useEffect(() => {
    notifications.forEach(notification => {
      if (!notification.persistent && notification.duration !== 0) {
        const timer = setTimeout(() => {
          onDismiss(notification.id);
        }, notification.duration || 5000);
        
        return () => clearTimeout(timer);
      }
    });
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="notification-container" style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 9999,
      maxWidth: '400px'
    }}>
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`notification notification-${notification.type}`}
          style={{
            backgroundColor: getBackgroundColor(notification.type),
            border: `1px solid ${getBorderColor(notification.type)}`,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontWeight: 'bold',
                color: getTextColor(notification.type),
                marginBottom: '4px'
              }}>
                {notification.title}
              </div>
              <div style={{
                color: getTextColor(notification.type),
                fontSize: '14px',
                lineHeight: '1.4'
              }}>
                {notification.message}
              </div>
            </div>
            <button
              onClick={() => onDismiss(notification.id)}
              style={{
                background: 'none',
                border: 'none',
                color: getTextColor(notification.type),
                cursor: 'pointer',
                fontSize: '18px',
                marginLeft: '12px',
                opacity: 0.7
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `
      }}></style>
    </div>
  );
};

function getBackgroundColor(type: string): string {
  switch (type) {
    case 'success': return '#d4edda';
    case 'error': return '#f8d7da';
    case 'warning': return '#fff3cd';
    case 'info': return '#d1ecf1';
    default: return '#f8f9fa';
  }
}

function getBorderColor(type: string): string {
  switch (type) {
    case 'success': return '#c3e6cb';
    case 'error': return '#f5c6cb';
    case 'warning': return '#ffeaa7';
    case 'info': return '#bee5eb';
    default: return '#dee2e6';
  }
}

function getTextColor(type: string): string {
  switch (type) {
    case 'success': return '#155724';
    case 'error': return '#721c24';
    case 'warning': return '#856404';
    case 'info': return '#0c5460';
    default: return '#495057';
  }
}

export default NotificationSystem;