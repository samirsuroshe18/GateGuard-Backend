import admin from 'firebase-admin';

const sendNotification = (token, action, payload) => {
  const message = {
    data: {
      action: action,  // 'USER_ROLE_SELECTION' Optional: use it if you want to distinguish the notification type
      payload: payload,  // Custom data, like role or any other data you want to send
    },
    token: token,
    android: {
      priority: "high", // Set high priority for Android
    },
    apns: {
      headers: {
        "apns-priority": "5", // Set high priority for iOS
      },
    },
  };

  admin.messaging().send(message)
    .then((response) => {
      console.log('Successfully sent notification:', response);
    })
    .catch((error) => {
      console.log('Error sending notification:', error);
    });
};


// Function to send a cancel notification (example for FCM)
function sendNotificationCancel(token, payload) {
  const message = {
    data: {
      action: 'CANCEL',
      payload: payload,
    },
    token: token,
  };

  admin.messaging().send(message)
    .then((response) => {
      console.log('Cancel notification sent:', response);
    })
    .catch((error) => {
      console.log('Error sending cancel notification:', error);
    });
}

export { sendNotification, sendNotificationCancel }
