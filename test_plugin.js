const parent = {
    parent: {
        debug: function(){},
        pluginHandler: {},
        args: {}
    }
};
try {
    const plugin = require('./scripttask.js').scripttask(parent);
    console.log("Plugin loaded OK. obj.db = ", plugin.db);
} catch (e) {
    console.error("FATAL PLUGIN LOAD ERROR:", e);
}
