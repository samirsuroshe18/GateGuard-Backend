import admin from 'firebase-admin';

const sendNotification = (fcmToken) => {
  const message = {
    token: fcmToken,
    notification: {
      title: "New Request",
      body: "You have a new approval request.",
    },
    data: {
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    android: {
      notification: {
        title: "New Request",
        body: "Approve or Reject the request.",
        // Configure action buttons
        actions: [
          { title: "Approve", action: "APPROVE" },
          { title: "Reject", action: "REJECT" }
        ]
      },
    },
    apns: {
      payload: {
        aps: {
          category: "NEW_REQUEST",
        },
      },
    },
  };

  admin.messaging().send(message)
    .then((response) => {
      console.log('Successfully sent message:', response);
    })
    .catch((error) => {
      console.log('Error sending message:', error);
    });
};


export { sendNotification }
