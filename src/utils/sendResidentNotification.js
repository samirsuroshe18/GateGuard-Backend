import admin from 'firebase-admin';

const sendNotification = (token, role) => {
  const message = {
    notification: {
      title: 'New User Role Selection',
      body: `A user has selected the role: ${role}`,
      imageUrl: 'https://lh3.googleusercontent.com/a/ACg8ocJLc-iN0blZ8C0zfC9IzhmY4lGnW0onGwtm-PleG9sdqTHzdeCP=s96-c', // URL to your image
    },
    data: {
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      action_approve: 'APPROVE_ACTION',
      action_reject: 'REJECT_ACTION',
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
