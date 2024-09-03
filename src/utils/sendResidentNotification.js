import admin from 'firebase-admin';

const sendNotification = (role) => {
    const message = {
      notification: {
        title: 'New User Role Selection',
        body: `A user has selected the role: ${role}`,
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
  

  export {sendNotification}
  