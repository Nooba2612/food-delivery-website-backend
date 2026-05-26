const nodemailer = require("nodemailer");

const fromEmailAddress = process.env.FROM_EMAIL;
const fromEmailPassword = process.env.FROM_EMAIL_PASSWORD;

// Create a transporter object using Gmail's SMTP
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: fromEmailAddress,
        pass: fromEmailPassword,
    },
});

const sendEmail = (recipientEmail, subject, content) => {
    // Setup email data
    const mailOptions = {
        from: fromEmailAddress,
        to: recipientEmail,
        subject: subject,
        text: content,
        html: `<b>${content}</b>`,
    };

    // Send email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log("Error sending email:", error);
        } else {
            console.log("Email sent: " + info.response);
        }
    });
};

module.exports = {
    transporter,
    sendEmail,
};
