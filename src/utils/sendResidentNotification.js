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
    token: 'cy50UuLwTJuhuzy2PNq1gu:APA91bECAQ1mkSRSYTjptf1bylVI7ifeoSanxz-jFfzqSTcMr0TMFYf-J_VpeVBjOmiZQ3OxnhZ_aIy0WsYJXW5a8Q7L2FpbFk8gS1J2IQBNZ3f8GC2z_hfQ-bRl_j8tHA9G9jhkMS2v',
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
