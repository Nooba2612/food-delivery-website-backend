const { userModel } = require("./src/models");
const { normalizePhone } = require("./src/helpers/phoneHelper");

async function migratePhoneNumbers() {
    console.log("Starting phone number normalization migration...");
    try {
        const users = await userModel.findAll();
        let updatedCount = 0;

        for (const user of users) {
            if (user.phoneNumber && user.countryCode) {
                const normalized = normalizePhone(user.phoneNumber, user.countryCode);
                if (normalized !== user.phoneNumber) {
                    console.log(`Normalizing user ${user.userId}: ${user.phoneNumber} -> ${normalized}`);
                    await user.update({ phoneNumber: normalized });
                    updatedCount++;
                }
            }
        }

        console.log(`Migration completed. Updated ${updatedCount} users.`);
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

// Note: This script requires the environment to be set up (DB connection, etc.)
// It's meant to be run once manually.
// Usage: node -r ./babel-register.js migrate_phones.js (or similar depending on setup)
// migratePhoneNumbers();
