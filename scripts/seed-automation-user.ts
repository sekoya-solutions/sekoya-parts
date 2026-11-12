// Creates the automation user, or sets its API key again, on the database of a
// Vercel Preview build (issue #55). It runs on every preview build, after the
// migrations, so a preview or a reset of the Neon preview branch needs no step
// by hand. Run through Payload's command line: payload run <this file>.
import { randomBytes } from "node:crypto";
import config from "@payload-config";
import { getPayload } from "payload";
import {
  AUTOMATION_EMAIL,
  automationUserSkipReason,
} from "../cms/automation-user.ts";

const skip = automationUserSkipReason(process.env);
if (skip) {
  console.log(`Automation user: skipped, ${skip}.`);
  process.exit(0);
}

const apiKey = process.env.AUTOMATION_API_KEY as string;
const payload = await getPayload({ config });
const { docs } = await payload.find({
  collection: "users",
  where: { email: { equals: AUTOMATION_EMAIL } },
  limit: 1,
});

if (docs[0]) {
  // Setting the key again also follows a rotation of AUTOMATION_API_KEY.
  await payload.update({
    collection: "users",
    id: docs[0].id,
    data: { enableAPIKey: true, apiKey },
  });
  console.log("Automation user: key updated.");
} else {
  await payload.create({
    collection: "users",
    data: {
      email: AUTOMATION_EMAIL,
      password: randomBytes(32).toString("hex"),
      enableAPIKey: true,
      apiKey,
    },
  });
  console.log("Automation user: created.");
}
process.exit(0);
