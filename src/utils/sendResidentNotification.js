import admin from 'firebase-admin';

const sendNotification = async (token, action, payload) => {
  if (!token) {
    console.error('Error: FCM token is missing');
    return { success: false, error: 'Token is required' };
  }

  if (typeof token !== 'string') {
    console.error('Error: FCM token must be a string');
    return { success: false, error: 'Token must be a string' };
  }

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    console.error('Error: FCM token is empty');
    return { success: false, error: 'Token cannot be empty' };
  }

  if (trimmedToken.length < 50) {
    console.error('Error: FCM token appears too short');
    return { success: false, error: 'Token appears invalid (too short)' };
  }

  const message = {
  data: {
    action: action,
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  },
  token: trimmedToken,

  android: {
    priority: "high",
  },

  apns: {
    headers: {
      "apns-priority": "5",
      "apns-push-type": "background"
    },
    payload: {
      aps: {
        "content-available": 1
      }
    }
  }
};

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent notification:', response);
    return { success: true, response };
  } catch (error) {
    console.error('Error sending notification:', error);
    
    // Handle specific FCM errors
    if (error.code === 'messaging/invalid-registration-token') {
      console.error('Token is invalid or expired');
      return { success: false, error: 'Invalid or expired token', shouldRemoveToken: true };
    } else if (error.code === 'messaging/registration-token-not-registered') {
      console.error('Token is not registered');
      return { success: false, error: 'Token not registered', shouldRemoveToken: true };
    } else if (error.code === 'messaging/invalid-argument') {
      console.error('Invalid argument provided');
      return { success: false, error: 'Invalid argument' };
    }
    
    return { success: false, error: error.message };
  }
};

const sendNotificationCancel = async (token, payload) => {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return { success: false, error: 'Valid FCM token required' };
  }
  const trimmedToken = token.trim();

  const message = {
    data: {
      action: 'CANCEL',
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    },
    token: trimmedToken,

    // Android: wake up immediately
    android: { priority: 'high' },

    // iOS: silent/background data push
    apns: {
      headers: {
        'apns-priority': '5',           // background
        'apns-push-type': 'background', // REQUIRED for iOS 13+
        // optional: coalesce duplicate CANCELs
        // 'apns-collapse-id': 'CANCEL'
      },
      payload: {
        aps: { 'content-available': 1 } // no alert/sound/badge for silent push
      }
    }
  };

  try {
    const res = await admin.messaging().send(message);
    console.log('Cancel notification sent:', res);
    return { success: true, response: res };
  } catch (error) {
    console.error('Error sending cancel notification:', error);
    const code = error.code || '';
    if (code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered') {
      return { success: false, error: 'Invalid or unregistered token', shouldRemoveToken: true };
    }
    return { success: false, error: error.message };
  }
};

export { sendNotification, sendNotificationCancel }