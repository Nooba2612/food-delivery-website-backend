const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGE_SERVICE_SID;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let client;

if (accountSid && authToken && !accountSid.includes("dummy") && !authToken.includes("dummy")) {
    try {
        client = twilio(accountSid, authToken);
    } catch (error) {
        console.error("Failed to initialize Twilio client:", error.message);
    }
}

const { formatPhoneNumber } = require("../helpers/phoneHelper");

const createVerification = async (phoneNumber, otp, type = "verification") => {
    // formatPhoneNumber is idempotent (+84XXXXXXXXX)
    const formattedPhone = formatPhoneNumber(phoneNumber);
    console.log(`[Twilio] Attempting to send OTP to ${formattedPhone}`);

    if (!client) {
        console.warn("Twilio client not initialized (check credentials).");
        return { success: false, error: "Twilio misconfigured" };
    }

    const body = type === "reset" 
        ? `Your password reset OTP is: ${otp}`
        : `Your Eatsy verification code is: ${otp}`;

    try {
        const messageOptions = {
            body: body,
            to: formattedPhone,
        };

        if (messagingServiceSid && !messagingServiceSid.includes("dummy")) {
            messageOptions.messagingServiceSid = messagingServiceSid;
        } else if (twilioPhoneNumber && !twilioPhoneNumber.includes("dummy")) {
            messageOptions.from = twilioPhoneNumber;
        } else {
            console.warn("Neither Messaging Service SID nor Twilio Phone Number provided.");
            return { success: false, error: "Missing sender configuration" };
        }

        const message = await client.messages.create(messageOptions);
        console.log(`[Twilio] SMS sent successfully. SID: ${message.sid}`);
        return { success: true, sid: message.sid };
    } catch (error) {
        console.error(`[Twilio] Error sending SMS to ${formattedPhone}:`, error.message);
        return { success: false, error: error.message };
    }
};

module.exports = { createVerification };


