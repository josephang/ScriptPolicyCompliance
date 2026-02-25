/** 
* @description MeshCentral-ScriptTask database module
* @author Ryan Blenis
* @copyright Ryan Blenis 2019
* @license Apache-2.0
*/

"use strict";
var Datastore = null;
var formatId = null;

module.exports.CreateDB = function (meshserver) {
    var obj = {};
    var NEMongo = require(__dirname + '/nemongo.js');
    module.paths.push(require('path').join(meshserver.parentpath, 'node_modules')); // we need to push the node_modules folder for nedb
    obj.dbVersion = 1;

    obj.initFunctions = function () {
        obj.updateDBVersion = function (new_version) {
            return obj.scriptFile.updateOne({ type: "db_version" }, { $set: { version: new_version } }, { upsert: true });
        };

        obj.getDBVersion = function () {
            return new Promise(function (resolve, reject) {
                obj.scriptFile.find({ type: "db_version" }).project({ _id: 0, version: 1 }).toArray(function (err, vers) {
                    if (vers.length == 0) resolve(1);
                    else resolve(vers[0]['version']);
                });
            });
        };

        obj.addScript = function (name, content, path, filetype) {
            if (path == null) path = "Shared"
            if (filetype == 'bash') content = content.split('\r\n').join('\n').split('\r').join('\n');
            var sObj = {
                type: 'script',
                path: path,
                name: name,
                content: content,
                contentHash: require('crypto').createHash('sha384').update(content).digest('hex'),
                filetype: filetype
            };
            return obj.scriptFile.insertOne(sObj);
        };

        obj.addFolder = function (name, path) {
            var sObj = {
                type: 'folder',
                path: path,
                name: name
            };
            return obj.scriptFile.insertOne(sObj);
        };

        obj.getScriptTree = function () {
            return obj.scriptFile.find(
                {
                    type:
                        { $in: ['script', 'folder'] }
                }
            ).sort(
                { path: 1, type: 1, name: 1 }
            ).project(
                { name: 1, path: 1, type: 1, filetype: 1 }
            ).toArray();
        };

        obj.update = function (id, args) {
            id = formatId(id);
            if (args.type == 'script' && args.content !== null) {
                if (args.filetype == 'bash') {
                    args.content = args.content = split('\r\n').join('\n').split('\r').join('\n');
                }
                args.contentHash = require('crypto').createHash('sha384').update(args.content).digest('hex');
            }
            return obj.scriptFile.updateOne({ _id: id }, { $set: args });
        };
        obj.delete = function (id) {
            id = formatId(id);
            return obj.scriptFile.deleteOne({ _id: id });
        };
        obj.deleteByPath = function (path) {
            return obj.scriptFile.deleteMany({ path: path, type: { $in: ['script', 'folder'] } });
        };
        obj.deleteSchedulesForScript = function (id) {
            id = formatId(id);
            return obj.scriptFile.deleteMany({ type: 'jobSchedule', scriptId: id });
        };
        obj.getByPath = function (path) {
            return obj.scriptFile.find({ type: { $in: ['script', 'folder'] }, path: path }).toArray();
        };
        obj.get = function (id) {
            if (id == null || id == 'null') return new Promise(function (resolve, reject) { resolve([]); });
            id = formatId(id);
            return obj.scriptFile.find({ _id: id }).toArray();
        };
        obj.addJob = function (passedObj) {
            var nowTime = Math.floor(new Date() / 1000);
            var defaultObj = {
                type: 'job',
                queueTime: nowTime,
                dontQueueUntil: nowTime,
                dispatchTime: null,
                completeTime: null,
                node: null,
                scriptId: null,
                scriptName: null, // in case the original reference is deleted in the future
                replaceVars: null,
                returnVal: null,
                errorVal: null,
                returnAct: null,
                runBy: null,
                jobSchedule: null
            };
            var jObj = { ...defaultObj, ...passedObj };

            if (jObj.node == null || jObj.scriptId == null) { console.log('PLUGIN: SciptTask: Could not add job'); return false; }

            return obj.scriptFile.insertOne(jObj);
        };
        obj.addJobSchedule = function (schedObj) {
            schedObj.type = 'jobSchedule';
            if (schedObj.node == null || schedObj.scriptId == null) { console.log('PLUGIN: SciptTask: Could not add job schedule'); return false; }
            return obj.scriptFile.insertOne(schedObj);
        };
        obj.removeJobSchedule = function (id) {
            return obj.delete(id);
        };
        obj.getSchedulesDueForJob = function (scheduleId) {
            var nowTime = Math.floor(new Date() / 1000);
            var scheduleIdLimiter = {};
            if (scheduleId != null) {
                scheduleIdLimiter._id = scheduleId;
            }
            return obj.scriptFile.find({
                type: 'jobSchedule',
                // startAt: { $gte: nowTime },
                $or: [
                    { endAt: null },
                    { endAt: { $lte: nowTime } }
                ],
                $or: [
                    { nextRun: null },
                    { nextRun: { $lte: (nowTime + 60) } } // check a minute into the future
                ],
                ...scheduleIdLimiter
            }).toArray();
        };
        obj.deletePendingJobsForNode = function (node) {
            return obj.scriptFile.deleteMany({
                type: 'job',
                node: node,
                completeTime: null,
            });
        };
        obj.getPendingJobs = function (nodeScope) {
            if (nodeScope == null || !Array.isArray(nodeScope)) {
                return false;
            }
            // return jobs that has online nodes and queue time requirements have been met
            return obj.scriptFile.find({
                type: 'job',
                node: { $in: nodeScope },
                completeTime: null,
                //dispatchTime: null,
                $or: [
                    { dontQueueUntil: null },
                    { dontQueueUntil: { $lte: Math.floor(new Date() / 1000) } }
                ]
            }).toArray();
        };
        obj.getJobNodeHistory = function (nodeId) {
            return obj.scriptFile.find({
                type: 'job',
                node: nodeId,
            }).sort({ queueTime: -1 }).limit(200).toArray();
        };
        obj.getJobScriptHistory = function (scriptId) {
            return obj.scriptFile.find({
                type: 'job',
                scriptId: scriptId,
            }).sort({ completeTime: -1, queueTime: -1 }).limit(200).toArray();
        };
        obj.updateScriptJobName = function (scriptId, scriptName) {
            return obj.scriptFile.updateMany({ type: 'job', scriptId: scriptId }, { $set: { scriptName: scriptName } });
        };
        obj.getJobSchedulesForScript = function (scriptId) {
            return obj.scriptFile.find({ type: 'jobSchedule', scriptId: scriptId }).toArray();
        };
        obj.getJobSchedulesForNode = function (nodeId) {
            return obj.scriptFile.find({ type: 'jobSchedule', node: nodeId }).toArray();
        };
        obj.getIncompleteJobsForSchedule = function (schedId) {
            return obj.scriptFile.find({ type: 'job', jobSchedule: schedId, completeTime: null }).toArray();
        };
        obj.deletePendingJobsForSchedule = function (schedId) {
            return obj.scriptFile.deleteMany({ type: 'job', jobSchedule: schedId, completeTime: null });
        };
        obj.deleteOldHistory = function () {
            var nowTime = Math.floor(new Date() / 1000);
            var oldTime = nowTime - (86400 * 90); // 90 days
            return obj.scriptFile.deleteMany({ type: 'job', completeTime: { $lte: oldTime } });
        };
        obj.addVariable = function (name, scope, scopeTarget, value) {
            var vObj = {
                type: 'variable',
                name: name,
                scope: scope,
                scopeTarget: scopeTarget,
                value: value
            };
            return obj.scriptFile.insertOne(vObj);
        };
        obj.getVariables = function (limiters) {
            if (limiters != null) {
                var find = {
                    type: 'variable',
                    name: { $in: limiters.names },
                    $or: [
                        { scope: 'global' },
                        {
                            $and: [
                                { scope: 'script' },
                                { scopeTarget: limiters.scriptId }
                            ]
                        },
                        {
                            $and: [
                                { scope: 'mesh' },
                                { scopeTarget: limiters.meshId }
                            ]
                        },
                        {
                            $and: [
                                { scope: 'node' },
                                { scopeTarget: limiters.nodeId }
                            ]
                        }
                    ]
                };
                return obj.scriptFile.find(find).sort({ name: 1 }).toArray();
            }
            else {
                return obj.scriptFile.find({ type: 'variable' }).sort({ name: 1 }).toArray();
            }
        };
        obj.checkDefaults = function () {
            obj.scriptFile.find({ type: 'folder', name: 'Shared', path: 'Shared' }).toArray()
                .then(found => {
                    if (found.length == 0) obj.addFolder('Shared', 'Shared');
                })
                .catch(e => { console.log('PLUGIN: ScriptTask: Default folder check failed. Error was: ', e); });
        };

        // --- Compliance Power Script Policy Support ---
        obj.addPolicy = function (policyObj) {
            policyObj.type = 'policy';
            // ensure basic fields
            if (!policyObj.name) policyObj.name = "New Policy";
            if (policyObj.enabled === undefined) policyObj.enabled = true;
            if (policyObj.version === undefined) policyObj.version = 1;
            return obj.scriptFile.insertOne(policyObj);
        };
        obj.updatePolicy = function (id, policyObj) {
            policyObj.version = (policyObj.version || 1) + 1; // auto-increment version on update
            return obj.scriptFile.updateOne({ _id: id, type: 'policy' }, { $set: policyObj });
        };
        obj.getPolicies = function () {
            return obj.scriptFile.find({ type: 'policy' }).sort({ name: 1 }).toArray();
        };
        obj.getPolicy = function (id) {
            return obj.scriptFile.find({ _id: id, type: 'policy' }).toArray();
        };
        obj.deletePolicy = function (id) {
            return obj.scriptFile.deleteMany({
                $or: [
                    { _id: id, type: 'policy' },
                    { policyId: id, type: 'policyAssignment' },
                    { policyId: id, type: 'complianceState' }
                ]
            });
        };

        // --- Compliance Power Script Schedules Support ---
        obj.addSchedule = function (scheduleObj) {
            scheduleObj.type = 'schedule';
            if (!scheduleObj.name) scheduleObj.name = "New Schedule";
            return obj.scriptFile.insertOne(scheduleObj);
        };
        obj.updateSchedule = function (id, scheduleObj) {
            return obj.scriptFile.updateOne({ _id: id, type: 'schedule' }, { $set: scheduleObj });
        };
        obj.getSchedules = function () {
            return obj.scriptFile.find({ type: 'schedule' }).sort({ name: 1 }).toArray();
        };
        obj.getSchedule = function (id) {
            return obj.scriptFile.find({ _id: id, type: 'schedule' }).toArray();
        };
        obj.deleteSchedule = function (id) {
            return obj.scriptFile.deleteMany({
                $or: [
                    { _id: id, type: 'schedule' },
                    { scheduleId: id, type: 'scheduleAssignment' }
                ]
            });
        };

        obj.addScheduleAssignment = function (assignObj) {
            assignObj.type = 'scheduleAssignment';
            return obj.scriptFile.insertOne(assignObj);
        };
        obj.getScheduleAssignments = function (scheduleId) {
            return obj.scriptFile.find({ type: 'scheduleAssignment', scheduleId: scheduleId }).toArray();
        };
        obj.getAllScheduleAssignments = function () {
            return obj.scriptFile.find({ type: 'scheduleAssignment' }).toArray();
        };
        obj.deleteScheduleAssignment = function (id) {
            return obj.scriptFile.deleteOne({ _id: id, type: 'scheduleAssignment' });
        };

        // --- Compliance Power Script SMTP Support ---
        obj.getSmtpConfig = function () {
            return obj.scriptFile.find({ type: 'smtpConfig' }).toArray();
        };
        obj.saveSmtpConfig = function (configObj) {
            configObj.type = 'smtpConfig';
            return obj.scriptFile.deleteMany({ type: 'smtpConfig' }).then(() => {
                return obj.scriptFile.insertOne(configObj);
            });
        };

        // --- Compliance Power Script External Download Server ---
        obj.getExternalDownloadServer = function () {
            return obj.scriptFile.find({ type: 'externalDownloadServer' }).toArray();
        };
        obj.saveExternalDownloadServer = function (configObj) {
            configObj.type = 'externalDownloadServer';
            return obj.scriptFile.deleteMany({ type: 'externalDownloadServer' }).then(() => {
                return obj.scriptFile.insertOne(configObj);
            });
        };

        obj.addPolicyAssignment = function (assignObj) {
            assignObj.type = 'policyAssignment';
            return obj.scriptFile.insertOne(assignObj);
        };
        obj.getPolicyAssignments = function (policyId) {
            return obj.scriptFile.find({ type: 'policyAssignment', policyId: policyId }).toArray();
        };
        obj.getAllPolicyAssignments = function () {
            return obj.scriptFile.find({ type: 'policyAssignment' }).toArray();
        };
        obj.deletePolicyAssignment = function (id) {
            return obj.scriptFile.deleteOne({ _id: id, type: 'policyAssignment' });
        };

        obj.getComplianceState = function (nodeId) {
            return obj.scriptFile.find({ type: 'complianceState', nodeId: nodeId }).toArray();
        };
        obj.updateComplianceState = function (nodeId, policyId, stateObj) {
            stateObj.type = 'complianceState';
            stateObj.nodeId = nodeId;
            stateObj.policyId = policyId;
            return obj.scriptFile.updateOne(
                { type: 'complianceState', nodeId: nodeId, policyId: policyId },
                { $set: stateObj },
                { upsert: true }
            );
        };
        obj.addComplianceHistory = function (histObj) {
            histObj.type = 'complianceHistory';
            histObj.time = Math.floor(new Date() / 1000);
            return obj.scriptFile.insertOne(histObj);
        };
        obj.getComplianceHistory = function (nodeId, policyId) {
            return obj.scriptFile.find({ type: 'complianceHistory', nodeId: nodeId, policyId: policyId }).sort({ time: -1 }).limit(50).toArray();
        };
        obj.deleteOldComplianceHistory = function () {
            var oldTime = Math.floor(new Date() / 1000) - (86400 * 30); // 30 days
            return obj.scriptFile.deleteMany({ type: 'complianceHistory', time: { $lte: oldTime } });
        };


        // --- Compliance Tab: Device Event Tracking ---

        obj.addDeviceEvent = function (nodeId, meshId, eventType, data, historicTime) {
            var ts = historicTime ? Math.floor(historicTime / 1000) : Math.floor(Date.now() / 1000);
            var rec = {
                type: 'deviceEvent',
                eventType: eventType,
                nodeId: nodeId,
                meshId: meshId || null,
                timestamp: ts,
                data: data || {}
            };
            return obj.scriptFile.insertOne(rec);
        };

        obj.hasAnyDeviceEvents = function (eventType) {
            return obj.scriptFile.find({ type: 'deviceEvent', eventType: eventType }).limit(1).toArray();
        };

        obj.getLastDeviceEvent = function (nodeId, eventType) {
            return obj.scriptFile.find({ type: 'deviceEvent', nodeId: nodeId, eventType: eventType })
                .sort({ timestamp: -1 }).limit(1).toArray();
        };

        obj.getDeviceEvents = function (nodeId) {
            return obj.scriptFile.find({ type: 'deviceEvent', nodeId: nodeId })
                .sort({ timestamp: -1 }).toArray();
        };

        obj.getAllDeviceEventNodes = function () {
            // returns all distinct nodeId/eventType combos for overview
            return obj.scriptFile.find({ type: 'deviceEvent' })
                .sort({ timestamp: -1 }).toArray();
        };

        obj.deleteOldDeviceEvents = function (eventType, cutoffTimestamp) {
            return obj.scriptFile.deleteMany({
                type: 'deviceEvent',
                eventType: eventType,
                timestamp: { $lte: cutoffTimestamp }
            });
        };

        // --- Compliance Tab: Retention Rules ---

        obj.getRetentionRules = function () {
            return obj.scriptFile.find({ type: 'complianceRetention' }).toArray();
        };

        obj.saveRetentionRule = function (rule) {
            rule.type = 'complianceRetention';
            if (rule._id) {
                var id = rule._id;
                return obj.scriptFile.updateOne({ _id: id }, { $set: rule });
            } else {
                return obj.scriptFile.insertOne(rule);
            }
        };

        obj.deleteRetentionRule = function (id) {
            return obj.scriptFile.deleteOne({ _id: id, type: 'complianceRetention' });
        };

        // --- External Download Server ---
        obj.getExternalDownloadServer = function () {
            return obj.scriptFile.find({ type: 'externalDownloadServer' }).limit(1).toArray();
        };
        obj.saveExternalDownloadServer = function (config) {
            return obj.scriptFile.deleteMany({ type: 'externalDownloadServer' }).then(function () {
                var rec = Object.assign({}, config || {}, { type: 'externalDownloadServer' });
                return obj.scriptFile.insertOne(rec);
            });
        };

        // --- Power State Alert Config ---
        obj.getPowerAlertConfig = function (nodeId) {
            return obj.scriptFile.find({ type: 'powerAlertConfig', nodeId: nodeId }).limit(1).toArray();
        };
        obj.savePowerAlertConfig = function (nodeId, alertOnStateChange) {
            return obj.scriptFile.deleteMany({ type: 'powerAlertConfig', nodeId: nodeId }).then(function () {
                return obj.scriptFile.insertOne({ type: 'powerAlertConfig', nodeId: nodeId, alertOnStateChange: !!alertOnStateChange });
            });
        };

        obj.checkDefaults();
    };

    if (meshserver.args.mongodb) { // use MongDB
        require('mongodb').MongoClient.connect(meshserver.args.mongodb, { useNewUrlParser: true, useUnifiedTopology: true }, function (err, client) {
            if (err != null) { console.log("Unable to connect to database: " + err); process.exit(); return; }

            var dbname = 'meshcentral';
            if (meshserver.args.mongodbname) { dbname = meshserver.args.mongodbname; }
            const db = client.db(dbname);

            obj.scriptFile = db.collection('plugin_scripttask');
            obj.scriptFile.indexes(function (err, indexes) {
                // Check if we need to reset indexes
                var indexesByName = {}, indexCount = 0;
                for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
                if ((indexCount != 6) || (indexesByName['ScriptName1'] == null) || (indexesByName['ScriptPath1'] == null) || (indexesByName['JobTime1'] == null) || (indexesByName['JobNode1'] == null) || (indexesByName['JobScriptID1'] == null)) {
                    // Reset all indexes
                    console.log('Resetting plugin (ScriptTask) indexes...');
                    obj.scriptFile.dropIndexes(function (err) {
                        obj.scriptFile.createIndex({ name: 1 }, { name: 'ScriptName1' });
                        obj.scriptFile.createIndex({ path: 1 }, { name: 'ScriptPath1' });
                        obj.scriptFile.createIndex({ queueTime: 1 }, { name: 'JobTime1' });
                        obj.scriptFile.createIndex({ node: 1 }, { name: 'JobNode1' });
                        obj.scriptFile.createIndex({ scriptId: 1 }, { name: 'JobScriptID1' });
                    });
                }
            });


            if (typeof require('mongodb').ObjectID == 'function') {
                formatId = require('mongodb').ObjectID;
            } else {
                formatId = require('mongodb').ObjectId;
            }
            obj.initFunctions();
        });
    } else { // use NeDb
        try { Datastore = require('@seald-io/nedb'); } catch (ex) { } // This is the NeDB with Node 23 support.
        if (Datastore == null) {
            try { Datastore = require('@yetzt/nedb'); } catch (ex) { } // This is the NeDB with fixed security dependencies.
            if (Datastore == null) { Datastore = require('nedb'); } // So not to break any existing installations, if the old NeDB is present, use it.
        }
        if (obj.scriptFilex == null) {
            obj.scriptFilex = new Datastore({ filename: meshserver.getConfigFilePath('plugin-scripttask.db'), autoload: true });
            obj.scriptFilex.setAutocompactionInterval(40000);
            obj.scriptFilex.ensureIndex({ fieldName: 'name' });
            obj.scriptFilex.ensureIndex({ fieldName: 'path' });
            obj.scriptFilex.ensureIndex({ fieldName: 'queueTime' });
            obj.scriptFilex.ensureIndex({ fieldName: 'node' });
            obj.scriptFilex.ensureIndex({ fieldName: 'scriptId' });
        }
        obj.scriptFile = new NEMongo(obj.scriptFilex);
        formatId = function (id) { return id; };
        obj.initFunctions();
    }
    return obj;
}
