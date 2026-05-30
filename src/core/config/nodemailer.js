const nodemailer = require("nodemailer");
const { retryAsync } = require("@core/utils/retry");

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

const sendEmail = async (recipientEmail, subject, content) => {
    const mailOptions = {
        from: fromEmailAddress,
        to: recipientEmail,
        subject: subject,
        text: content,
        html: `<b>${content}</b>`,
    };

    const info = await retryAsync(
        () => transporter.sendMail(mailOptions),
        {
            retries: 2,
            baseDelayMs: 1000,
            timeoutMs: 5000,
            operationName: "send email",
            onRetry: ({ attempt, delayMs, error }) => {
                console.warn(
                    `[Retry] send email failed on attempt ${attempt}. Retrying in ${delayMs}ms: ${error.message}`,
                );
            },
        },
    );

    console.log("Email sent: " + info.response);
    return info;
};

module.exports = {
    transporter,
    sendEmail,
};
