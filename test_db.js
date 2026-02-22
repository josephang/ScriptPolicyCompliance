const parent = {
  parentpath: __dirname,
  getConfigFilePath: (f) => __dirname + '/plugin-scripttask.db',
  args: {}
};
const db = require('./db.js').CreateDB(parent);
setTimeout(async () => {
    try {
        console.log("Attempting to add policy...");
        await db.addPolicy({ name: "Test Policy", detectScriptId: "123" });
        const policies = await db.getPolicies();
        console.log("Polices in DB:", policies.length);
    } catch(e) { console.error("Error", e); }
}, 500);
