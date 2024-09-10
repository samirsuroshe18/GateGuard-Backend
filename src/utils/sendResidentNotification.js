import admin from 'firebase-admin';

const sendNotification = (token, action, payload) => {
  const message = {
    data: {
      action: action,  //'USER_ROLE_SELECTION' Optional: use it if you want to distinguish the notification type
      payload: JSON.stringify({...payload}),  // Custom data, like role or any other data you want to send
    },
    token: token,
  };

  admin.messaging().send(message)
    .then((response) => {
      console.log('Successfully sent notification:', response);
    })
    .catch((error) => {
      console.log('Error sending notification:', error);
    });
};


export { sendNotification }
