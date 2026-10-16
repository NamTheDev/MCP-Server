import { SCOPES, type Scope } from "../config/auth";
import { astatements } from "../database/auth-db";

const [cmd, ...rest] = Bun.argv.slice(2);

function usage(): never {
  console.error(`Usage:
  bun scripts/auth-cli.ts list
  bun scripts/auth-cli.ts add <user_id> [scope1,scope2,...]
  bun scripts/auth-cli.ts revoke <user_id>

Scopes: ${SCOPES.join(", ")}
Default scopes for add: read,write`);
  process.exit(1);
}

switch (cmd) {
  case "list": {
    const rows = astatements.listUsers.all();
    if (rows.length === 0) {
      console.log("(no users)");
      break;
    }
    for (const r of rows) {
      console.log(`${r.user_id}\t${r.status}\t${r.scopes}\t${r.username ?? ""}`);
    }
    break;
  }
  case "add": {
    const [userId, scopeStr] = rest;
    if (!userId) usage();
    const scopes = (
      scopeStr ? scopeStr.split(",") : ["read", "write"]
    ).map((s) => s.trim()) as Scope[];
    for (const s of scopes) {
      if (!SCOPES.includes(s)) {
        console.error(`Bad scope: ${s}`);
        process.exit(1);
      }
    }
    astatements.upsertUser.get(userId, "", JSON.stringify(scopes), Date.now());
    console.log(`Added ${userId} with scopes ${scopes.join(", ")}.`);
    break;
  }
  case "revoke": {
    const [userId] = rest;
    if (!userId) usage();
    astatements.revokeUser.run(userId);
    console.log(`Revoked ${userId}.`);
    break;
  }
  default:
    usage();
}
