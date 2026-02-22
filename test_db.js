const db = require('./db.js');
const mockMeshServer = {
    parentpath: '/opt/meshcentral',
    getConfigFilePath: function(x) { return '/opt/meshcentral/meshcentral-data/' + x; },
    args: {}
};
module.paths.unshift('/opt/meshcentral/node_modules');
const obj = db.CreateDB(mockMeshServer);
setTimeout(() => {
    console.log("Fetching policies...");
    obj.getPolicies().then(res => console.log("Policies:", res)).catch(err => console.error("Policy error:", err));
    console.log("Fetching SMTP...");
    obj.getSmtpConfig().then(res => console.log("SMTP:", res)).catch(err => console.error("SMTP error:", err));
}, 1000);
