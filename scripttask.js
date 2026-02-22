/** 
* @description MeshCentral ScriptTask
* @author Ryan Blenis
* @copyright 
* @license Apache-2.0
*/

"use strict";

module.exports.scripttask = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.db = null;
    obj.intervalTimer = null;
    obj.debug = obj.meshServer.debug;
    obj.VIEWS = __dirname + '/views/';

    obj.exports = [
        'onDeviceRefreshEnd',
        'resizeContent',
        'historyData',
        'variableData',
        'policyData',
        'smtpData',
        'complianceStateData',
        'deviceEvents',
        'complianceOverview',
        'retentionRules',
        'powerHistory',
        'hook_processAgentData',
        'malix_triggerOption',
        'hook_agentCoreIsStable',
        'server_startup'
    ];

    obj.malix_triggerOption = function (selectElem) {
        selectElem.options.add(new Option("ScriptTask - Run Script", "scripttask_runscript"));
    }
    obj.malix_triggerFields_scripttask_runscript = function () {

    }

    obj.resetQueueTimer = function () {
        clearTimeout(obj.intervalTimer);
        obj.intervalTimer = setInterval(obj.queueRun, 1 * 60 * 1000); // every minute
    };

    obj.server_startup = function () {
        try {
            console.log("CompliancePowerScript: Attempting to initialize DB...");
            obj.meshServer.pluginHandler.scripttask_db = require(__dirname + '/db.js').CreateDB(obj.meshServer);
            obj.db = obj.meshServer.pluginHandler.scripttask_db;
            obj.db_error = null;
            obj.resetQueueTimer();
            console.log("CompliancePowerScript: DB Successfully Initialized!");
        } catch (err) {
            obj.db_error = String(err) + " : " + String(err.stack);
            console.log("CompliancePowerScript DB INITIALIZATION FATAL ERROR:", err, err.stack);
        }
    };

    obj.hook_agentCoreIsStable = function (agent) {
        if (typeof agent === 'object' && agent.dbNodeKey) {
            obj.evaluateDeviceCompliance(agent.dbNodeKey);
            obj.recordComplianceEvents(agent).catch(e => {
                console.log('ScriptPolicyCompliance: recordComplianceEvents error', e);
            });
        }
    };

    // Capture lastUser from real-time agent data messages
    obj.hook_processAgentData = function (agent, command, tag) {
        if (!obj.db || !agent || !agent.dbNodeKey) return;
        var nodeId = agent.dbNodeKey;
        var meshId = agent.dbMeshKey || null;
        var user = null;
        if (command) {
            if (command.loginuser) user = command.loginuser;
            else if (command.loginInfo && command.loginInfo.user) user = command.loginInfo.user;
            else if (command.users && command.users.length) user = command.users[0];
            else if (command.action === 'sessions' && command.user) user = command.user;
        }
        if (user && typeof user === 'string' && user.trim()) {
            obj.db.getLastDeviceEvent(nodeId, 'lastUser').then(last => {
                if (!last.length || last[0].data.user !== user) {
                    obj.db.addDeviceEvent(nodeId, meshId, 'lastUser', { user: user });
                }
            }).catch(() => { });
        }
    };

    obj.recordComplianceEvents = async function (agent) {
        if (!obj.db) return;
        var nodeId = agent.dbNodeKey;
        var meshId = agent.dbMeshKey || null;

        // Extract public IP (format: "1.2.3.4:port" or "::ffff:1.2.3.4:port")
        var rawAddr = agent.remoteaddrport || '';
        var ip = rawAddr.replace(/^::ffff:/, '').replace(/:\d+$/, '') || 'unknown';

        // Record IP only if changed
        var lastIp = await obj.db.getLastDeviceEvent(nodeId, 'ipSeen');
        if (!lastIp.length || lastIp[0].data.ip !== ip) {
            await obj.db.addDeviceEvent(nodeId, meshId, 'ipSeen', { ip: ip });
        }

        // Record boot time and last user from node record
        await obj.recordNodeInfoIfChanged(nodeId, meshId);
    };

    obj.recordNodeInfoIfChanged = async function (nodeId, meshId) {
        try {
            var nodes = await new Promise((resolve, reject) => {
                obj.meshServer.db.Get(nodeId, (err, docs) => {
                    if (err) reject(err); else resolve(docs);
                });
            });
            if (!nodes || !nodes.length) return;
            var node = nodes[0];

            // --- Boot Time: check all known MeshCentral field paths ---
            var bootTime = null;
            if (node.osinforaw && node.osinforaw.LastBootUpTime) {
                bootTime = node.osinforaw.LastBootUpTime;
            } else if (node.osinfo && node.osinfo.LastBootUpTime) {
                bootTime = node.osinfo.LastBootUpTime;
            } else if (node.osinfo && node.osinfo.lastBootUpTime) {
                bootTime = node.osinfo.lastBootUpTime;
            } else if (node.lastboottime) {
                bootTime = node.lastboottime;
            } else if (node.LastBootUpTime) {
                bootTime = node.LastBootUpTime;
            } else if (node.systeminformation && node.systeminformation.BootupTimestamp) {
                bootTime = node.systeminformation.BootupTimestamp;
            }

            // Debug: log available fields once if we still can't find boot time
            if (!bootTime) {
                var topKeys = Object.keys(node).filter(k => !['_id', 'type'].includes(k));
                console.log('ScriptPolicyCompliance: Boot time not found for node', nodeId, '— available top-level keys:', topKeys.join(', '));
                // Try to find any field with "boot" in it
                for (var k of topKeys) {
                    if (k.toLowerCase().includes('boot')) {
                        console.log('ScriptPolicyCompliance: Found boot-related field:', k, '=', JSON.stringify(node[k]));
                        bootTime = String(node[k]);
                        break;
                    }
                    if (typeof node[k] === 'object' && node[k] !== null) {
                        var subKeys = Object.keys(node[k]);
                        for (var sk of subKeys) {
                            if (sk.toLowerCase().includes('boot')) {
                                console.log('ScriptPolicyCompliance: Found boot-related sub-field:', k + '.' + sk, '=', JSON.stringify(node[k][sk]));
                                bootTime = String(node[k][sk]);
                                break;
                            }
                        }
                        if (bootTime) break;
                    }
                }
            }

            if (bootTime) {
                var lastBoot = await obj.db.getLastDeviceEvent(nodeId, 'bootTime');
                if (!lastBoot.length || lastBoot[0].data.bootTime !== bootTime) {
                    await obj.db.addDeviceEvent(nodeId, meshId, 'bootTime', { bootTime: bootTime });
                }
            }

            // --- Last Logged-In User: check known field paths ---
            var lastUser = null;
            if (node.loginuser) {
                lastUser = node.loginuser;
            } else if (node.login && node.login.user) {
                lastUser = node.login.user;
            } else if (node.winuser) {
                lastUser = node.winuser;
            } else if (node.rdplogin) {
                lastUser = node.rdplogin;
            } else if (node.lauser) {
                lastUser = node.lauser;
            } else if (node.loggeduser) {
                lastUser = node.loggeduser;
            }

            // Debug: log user-related fields if not found
            if (!lastUser) {
                var topKeys2 = Object.keys(node);
                for (var k2 of topKeys2) {
                    if (k2.toLowerCase().includes('user') || k2.toLowerCase().includes('login') || k2.toLowerCase().includes('logon')) {
                        console.log('ScriptPolicyCompliance: Found user-related field:', k2, '=', JSON.stringify(node[k2]));
                        if (typeof node[k2] === 'string' && node[k2]) { lastUser = node[k2]; break; }
                    }
                }
            }

            if (lastUser) {
                var lastUserRec = await obj.db.getLastDeviceEvent(nodeId, 'lastUser');
                if (!lastUserRec.length || lastUserRec[0].data.user !== lastUser) {
                    await obj.db.addDeviceEvent(nodeId, meshId, 'lastUser', { user: lastUser });
                }
            }
        } catch (e) {
            console.log('ScriptPolicyCompliance: recordNodeInfoIfChanged error:', e.message);
        }
    };

    obj.evaluateDeviceCompliance = async function (nodeId) {
        try {
            var policies = await obj.db.getPolicies();
            var assignments = await obj.db.getAllPolicyAssignments();
            if (!policies.length || !assignments.length) return;

            var agent = obj.meshServer.webserver.wsagents[nodeId];
            if (!agent) return;
            var meshId = agent.dbMeshKey;

            var nodeObj = null;
            if (obj.meshServer.webserver.wsagents[nodeId]) {
                nodeObj = obj.meshServer.webserver.wsagents[nodeId].dbNodeKey;
            }

            var applicablePolicies = {};
            for (let a of assignments) {
                if (a.targetType === 'node' && a.targetId === nodeId) applicablePolicies[a.policyId] = true;
                if (a.targetType === 'mesh' && a.targetId === meshId) {
                    if (!a.excludeNodes || a.excludeNodes.indexOf(nodeId) === -1) applicablePolicies[a.policyId] = true;
                }
                if (a.targetType === 'tag') {
                    // MeshCentral tags are often sent down to the agent or stored in the webserver meshes dictionary
                    // Without doing a full DB query here which is slow on connect, we do a best-effort check if tags exist on the agent object
                    // In MeshCentral, tags are usually associated with the device document natively
                    // Since we can't easily synchronously query the db.GetNode, we will flag it if the Tag functionality is fully needed
                    applicablePolicies[a.policyId] = true; // FIXME: Best effort Tag assignment until proper mesh node lookup is integrated
                }
            }

            for (let p of policies) {
                if (!p.enabled) continue;
                if (applicablePolicies[p._id]) {
                    var state = await obj.db.getComplianceState(nodeId);
                    var pState = state.find(s => s.policyId === p._id);
                    var now = Math.floor(Date.now() / 1000);

                    if (pState && pState.lastRunTime) {
                        var cd = p.cooldownMinutes || 60;
                        if ((now - pState.lastRunTime) < (cd * 60)) continue;
                        if (pState.state === 'Compliant' && pState.version === p.version) continue;
                    }

                    if (p.detectScriptId) {
                        await obj.db.addJob({
                            scriptId: p.detectScriptId,
                            node: nodeId,
                            runBy: 'Compliance Engine',
                            isComplianceDetect: true,
                            policyId: p._id,
                            policyVersion: p.version
                        });
                    }
                }
            }
            obj.queueRun();
        } catch (e) { console.error('PLUGIN: ScriptTask: evaluateDeviceCompliance error', e); }
    };

    obj.onDeviceRefreshEnd = function () {
        pluginHandler.registerPluginTab({
            tabTitle: 'ScriptTask',
            tabId: 'pluginScriptTask'
        });
        QA('pluginScriptTask', '<iframe id="pluginIframeScriptTask" style="width: 100%; height: 700px; overflow: auto" scrolling="yes" frameBorder=0 src="/pluginadmin.ashx?pin=scripttask&user=1&nc=' + Math.random() + '" />');
    };
    // may not be needed, saving for later. Can be called to resize iFrame
    obj.resizeContent = function () {
        var iFrame = document.getElementById('pluginIframeScriptTask');
        var newHeight = 700;
        //var sHeight = iFrame.contentWindow.document.body.scrollHeight;
        //if (sHeight > newHeight) newHeight = sHeight;
        //if (newHeight > 1600) newHeight = 1600;
        iFrame.style.height = newHeight + 'px';
    };

    obj.queueRun = async function () {
        var onlineAgents = Object.keys(obj.meshServer.webserver.wsagents);
        //obj.debug('ScriptTask', 'Queue Running', Date().toLocaleString(), 'Online agents: ', onlineAgents);

        obj.db.getPendingJobs(onlineAgents)
            .then((jobs) => {
                if (jobs.length == 0) return;
                //@TODO check for a large number and use taskLimiter to queue the jobs
                jobs.forEach(job => {
                    obj.db.get(job.scriptId)
                        .then(async (script) => {
                            script = script[0];
                            var foundVars = script.content.match(/#(.*?)#/g);
                            var replaceVars = {};
                            if (foundVars != null && foundVars.length > 0) {
                                var foundVarNames = [];
                                foundVars.forEach(fv => {
                                    foundVarNames.push(fv.replace(/^#+|#+$/g, ''));
                                });

                                var limiters = {
                                    scriptId: job.scriptId,
                                    nodeId: job.node,
                                    meshId: obj.meshServer.webserver.wsagents[job.node]['dbMeshKey'],
                                    names: foundVarNames
                                };
                                var finvals = await obj.db.getVariables(limiters);
                                var ordering = { 'global': 0, 'script': 1, 'mesh': 2, 'node': 3 }
                                finvals.sort((a, b) => {
                                    return (ordering[a.scope] - ordering[b.scope])
                                        || a.name.localeCompare(b.name);
                                });
                                finvals.forEach(fv => {
                                    replaceVars[fv.name] = fv.value;
                                });
                                replaceVars['GBL:meshId'] = obj.meshServer.webserver.wsagents[job.node]['dbMeshKey'];
                                replaceVars['GBL:nodeId'] = job.node;
                                //console.log('FV IS', finvals);
                                //console.log('RV IS', replaceVars);
                            }
                            var dispatchTime = Math.floor(new Date() / 1000);
                            var jObj = {
                                action: 'plugin',
                                plugin: 'scripttask',
                                pluginaction: 'triggerJob',
                                jobId: job._id,
                                scriptId: job.scriptId,
                                replaceVars: replaceVars,
                                scriptHash: script.contentHash,
                                dispatchTime: dispatchTime
                            };
                            //obj.debug('ScriptTask', 'Sending job to agent');
                            try {
                                obj.meshServer.webserver.wsagents[job.node].send(JSON.stringify(jObj));
                                obj.db.update(job._id, { dispatchTime: dispatchTime });
                            } catch (e) { }
                        })
                        .catch(e => console.log('PLUGIN: ScriptTask: Could not dispatch job.', e));
                });
            })
            .then(() => {
                obj.makeJobsFromSchedules();
                obj.cleanHistory();
            })
            .catch(e => { console.log('PLUGIN: ScriptTask: Queue Run Error: ', e); });
    };

    obj.cleanHistory = function () {
        if (Math.round(Math.random() * 100) == 99) {
            //obj.debug('Plugin', 'ScriptTask', 'Running history cleanup');
            obj.db.deleteOldHistory();
        }
    };

    obj.downloadFile = function (req, res, user) {
        var id = req.query.dl;
        obj.db.get(id)
            .then(found => {
                if (found.length != 1) { res.sendStatus(401); return; }
                var file = found[0];
                res.setHeader('Content-disposition', 'attachment; filename=' + file.name);
                res.setHeader('Content-type', 'text/plain');
                //var fs = require('fs');
                res.send(file.content);
            });
    };

    obj.updateFrontEnd = async function (ids) {
        if (ids.scriptId != null) {
            var scriptHistory = null;
            obj.db.getJobScriptHistory(ids.scriptId)
                .then((sh) => {
                    scriptHistory = sh;
                    return obj.db.getJobSchedulesForScript(ids.scriptId);
                })
                .then((scriptSchedule) => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'historyData', scriptId: ids.scriptId, nodeId: null, scriptHistory: scriptHistory, nodeHistory: null, scriptSchedule: scriptSchedule });
                });
        }
        if (ids.nodeId != null) {
            var nodeHistory = null;
            obj.db.getJobNodeHistory(ids.nodeId)
                .then((nh) => {
                    nodeHistory = nh;
                    return obj.db.getJobSchedulesForNode(ids.nodeId);
                })
                .then((nodeSchedule) => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'historyData', scriptId: null, nodeId: ids.nodeId, scriptHistory: null, nodeHistory: nodeHistory, nodeSchedule: nodeSchedule });
                });
        }
        if (ids.tree === true) {
            obj.db.getScriptTree()
                .then((tree) => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'newScriptTree', tree: tree });
                });
        }
        if (ids.variables === true) {
            obj.db.getVariables()
                .then((vars) => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'variableData', vars: vars });
                });
        }
    };

    obj.handleAdminReq = function (req, res, user) {
        if ((user.siteadmin & 0xFFFFFFFF) == 1 && req.query.admin == 1) {
            // admin wants admin, grant
            var vars = {};
            res.render(obj.VIEWS + 'admin', vars);
            return;
        } else if (req.query.admin == 1 && (user.siteadmin & 0xFFFFFFFF) == 0) {
            // regular user wants admin
            res.sendStatus(401);
            return;
        } else if (req.query.user == 1) {
            // regular user wants regular access, grant
            if (req.query.dl != null) return obj.downloadFile(req, res, user);
            var vars = {};

            if (req.query.edit == 1) { // edit script
                if (req.query.id == null) return res.sendStatus(401);
                obj.db.get(req.query.id)
                    .then((scripts) => {
                        if (scripts[0].filetype == 'proc') {
                            vars.procData = JSON.stringify(scripts[0]);
                            res.render(obj.VIEWS + 'procedit', vars);
                        } else {
                            vars.scriptData = JSON.stringify(scripts[0]);
                            res.render(obj.VIEWS + 'scriptedit', vars);
                        }
                    });
                return;
            } else if (req.query.schedule == 1) {
                var vars = {};
                res.render(obj.VIEWS + 'schedule', vars);
                return;
            } else if (req.query.policy == 1) {
                var vars = {};
                res.render(obj.VIEWS + 'policy', vars);
                return;
            } else if (req.query.smtp == 1) {
                var vars = {};
                res.render(obj.VIEWS + 'smtp', vars);
                return;
            }
            // default user view (tree)
            try {
                if (!obj.db) { res.status(500).send("<pre>CRASH: obj.db is completely undefined!\n\nDB_INIT_ERROR:\n" + String(obj.db_error) + "\n\nDid db.js fail to load?</pre>"); return; }
                if (typeof obj.db.getScriptTree !== 'function') { res.status(500).send("CRASH: obj.db.getScriptTree is not a function! db.js missing exports?"); return; }

                vars.scriptTree = 'null';
                obj.db.getScriptTree()
                    .then(tree => {
                        vars.scriptTree = JSON.stringify(tree);
                        res.render(obj.VIEWS + 'user', vars);
                    }).catch(err => {
                        res.status(500).send("<pre>CRASH Promise Rejected in getScriptTree: " + String(err) + "\nSTACK: " + String(err.stack) + "</pre>");
                    });
            } catch (err) {
                res.status(500).send("<pre>CRASH Synchronous Exception in handleAdminReq: " + String(err) + "\nSTACK: " + String(err.stack) + "</pre>");
            }
            return;
        } else if (req.query.include == 1) {
            switch (req.query.path.split('/').pop().split('.').pop()) {
                case 'css': res.contentType('text/css'); break;
                case 'js': res.contentType('text/javascript'); break;
            }
            res.sendFile(__dirname + '/includes/' + req.query.path); // don't freak out. Express covers any path issues.
            return;
        }
        res.sendStatus(401);
        return;
    };

    obj.historyData = function (message) {
        if (typeof pluginHandler.scripttask.loadHistory == 'function') pluginHandler.scripttask.loadHistory(message);
        if (typeof pluginHandler.scripttask.loadSchedule == 'function') pluginHandler.scripttask.loadSchedule(message);
    };

    obj.variableData = function (message) {
        if (typeof pluginHandler.scripttask.loadVariables == 'function') pluginHandler.scripttask.loadVariables(message);
    };

    obj.policyData = function (message) {
        if (typeof pluginHandler.scripttask.policyData == 'function') pluginHandler.scripttask.policyData(message);
    };

    obj.smtpData = function (message) {
        if (typeof pluginHandler.scripttask.smtpData == 'function') pluginHandler.scripttask.smtpData(message);
    };

    obj.complianceStateData = function (message) {
        if (typeof pluginHandler.scripttask.complianceStateData == 'function') pluginHandler.scripttask.complianceStateData(message);
    };

    obj.deviceEvents = function (message) {
        if (typeof pluginHandler.scripttask.deviceEvents == 'function') pluginHandler.scripttask.deviceEvents(message);
    };

    obj.complianceOverview = function (message) {
        if (typeof pluginHandler.scripttask.complianceOverview == 'function') pluginHandler.scripttask.complianceOverview(message);
    };

    obj.retentionRules = function (message) {
        if (typeof pluginHandler.scripttask.retentionRules == 'function') pluginHandler.scripttask.retentionRules(message);
    };

    obj.powerHistory = function (message) {
        if (typeof pluginHandler.scripttask.powerHistory == 'function') pluginHandler.scripttask.powerHistory(message);
    };

    obj.determineNextJobTime = function (s) {
        var nextTime = null;
        var nowTime = Math.floor(new Date() / 1000);

        // special case: we've reached the end of our run
        if (s.endAt !== null && s.endAt <= nowTime) {
            return nextTime;
        }

        switch (s.recur) {
            case 'once':
                if (s.nextRun == null) nextTime = s.startAt;
                else nextTime = null;
                break;
            case 'minutes':
                /*var lRun = s.nextRun || nowTime;
                if (lRun == null) lRun = nowTime;
                nextTime = lRun + (s.interval * 60);
                if (s.startAt > nextTime) nextTime = s.startAt;*/
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60);
                // this prevents "catch-up" tasks being scheduled if an endpoint is offline for a long period of time
                // e.g. always make sure the next scheduled time is relevant to the scheduled interval, but in the future
                if (nextTime < nowTime) {
                    // initially I was worried about this causing event loop lockups
                    // if there was a long enough time gap. Testing over 50 years of backlog for a 3 min interval
                    // still ran under a fraction of a second. Safe to say this approach is safe! (~8.5 million times)
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
                break;
            case 'hourly':
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60 * 60);
                if (nextTime < nowTime) {
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60 * 60);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
                break;
            case 'daily':
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60 * 60 * 24);
                if (nextTime < nowTime) {
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60 * 60 * 24);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
                break;
            case 'weekly':
                var tempDate = new Date();
                var nowDate = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate());

                if (s.daysOfWeek.length == 0) {
                    nextTime = null;
                    break;
                }
                s.daysOfWeek = s.daysOfWeek.map(el => Number(el));
                var baseTime = s.startAt;
                //console.log('dow is ', s.daysOfWeek);
                var lastDayOfWeek = Math.max(...s.daysOfWeek);
                var startX = 0;
                //console.log('ldow is ', lastDayOfWeek);
                if (s.nextRun != null) {
                    baseTime = s.nextRun;
                    //console.log('basetime 2: ', baseTime);
                    if (nowDate.getDay() == lastDayOfWeek) {
                        baseTime = baseTime + (s.interval * 604800) - (lastDayOfWeek * 86400);
                        //console.log('basetime 3: ', baseTime);
                    }
                    startX = 0;
                } else if (s.startAt < nowTime) {
                    baseTime = Math.floor(nowDate.getTime() / 1000);
                    //console.log('basetime 4: ', baseTime);
                }
                //console.log('startX is: ', startX);
                //var secondsFromMidnight = nowTimeDate.getSeconds() + (nowTimeDate.getMinutes() * 60) + (nowTimeDate.getHours() * 60 * 60);
                //console.log('seconds from midnight: ', secondsFromMidnight);
                //var dBaseTime = new Date(0); dBaseTime.setUTCSeconds(baseTime);
                //var dMidnight = new Date(dBaseTime.getFullYear(), dBaseTime.getMonth(), dBaseTime.getDate());
                //baseTime = Math.floor(dMidnight.getTime() / 1000);
                for (var x = startX; x <= 7; x++) {
                    var checkDate = baseTime + (86400 * x);
                    var d = new Date(0); d.setUTCSeconds(checkDate);
                    var dm = new Date(d.getFullYear(), d.getMonth(), d.getDate());

                    console.log('testing date: ', dm.toLocaleString()); // dMidnight.toLocaleString());
                    //console.log('if break check :', (s.daysOfWeek.indexOf(d.getDay()) !== -1 && checkDate >= nowTime));
                    //console.log('checkDate vs nowTime: ', (checkDate - nowTime), ' if positive, nowTime is less than checkDate');
                    if (s.nextRun == null && s.daysOfWeek.indexOf(dm.getDay()) !== -1 && dm.getTime() >= nowDate.getTime()) break;
                    if (s.daysOfWeek.indexOf(dm.getDay()) !== -1 && dm.getTime() > nowDate.getTime()) break;
                    //if (s.daysOfWeek.indexOf(d.getDay()) !== -1 && Math.floor(d.getTime() / 1000) >= nowTime) break;
                }
                var sa = new Date(0); sa.setUTCSeconds(s.startAt);
                var sad = new Date(sa.getFullYear(), sa.getMonth(), sa.getDate());
                var diff = (sa.getTime() - sad.getTime()) / 1000;
                nextTime = Math.floor(dm.getTime() / 1000) + diff;
                //console.log('next schedule is ' + d.toLocaleString());
                break;
            default:
                nextTime = null;
                break;
        }

        if (s.endAt != null && nextTime > s.endAt) nextTime = null; // if the next time reaches the bound of the endAt time, nullify

        return nextTime;
    };

    obj.makeJobsFromSchedules = function (scheduleId) {
        //obj.debug('ScriptTask', 'makeJobsFromSchedules starting');
        return obj.db.getSchedulesDueForJob(scheduleId)
            .then(schedules => {
                //obj.debug('ScriptTask', 'Found ' + schedules.length + ' schedules to process. Current time is: ' + Math.floor(new Date() / 1000));
                if (schedules.length) {
                    schedules.forEach(s => {
                        var nextJobTime = obj.determineNextJobTime(s);
                        var nextJobScheduled = false;
                        if (nextJobTime === null) {
                            //obj.debug('ScriptTask', 'Removing Job Schedule for', JSON.stringify(s));
                            obj.db.removeJobSchedule(s._id);
                        } else {
                            //obj.debug('ScriptTask', 'Scheduling Job for', JSON.stringify(s));
                            obj.db.get(s.scriptId)
                                .then(scripts => {
                                    // if a script is scheduled to run, but a previous run hasn't completed, 
                                    // don't schedule another job for the same (device probably offline).
                                    // results in the minimum jobs running once an agent comes back online.
                                    return obj.db.getIncompleteJobsForSchedule(s._id)
                                        .then((jobs) => {
                                            if (jobs.length > 0) { /* obj.debug('Plugin', 'ScriptTask', 'Skipping job creation'); */ return Promise.resolve(); }
                                            else { /* obj.debug('Plugin', 'ScriptTask', 'Creating new job'); */ nextJobScheduled = true; return obj.db.addJob({ scriptId: s.scriptId, scriptName: scripts[0].name, node: s.node, runBy: s.scheduledBy, dontQueueUntil: nextJobTime, jobSchedule: s._id }); }
                                        });
                                })
                                .then(() => {

                                    if (nextJobScheduled) { /* obj.debug('Plugin', 'ScriptTask', 'Updating nextRun time'); */ return obj.db.update(s._id, { nextRun: nextJobTime }); }
                                    else { /* obj.debug('Plugin', 'ScriptTask', 'NOT updating nextRun time'); */ return Promise.resolve(); }
                                })
                                .then(() => {
                                    obj.updateFrontEnd({ scriptId: s.scriptId, nodeId: s.node });
                                })
                                .catch((e) => { console.log('PLUGIN: ScriptTask: Error managing job schedules: ', e); });
                        }
                    });
                }
            });
    };

    obj.deleteElement = function (command) {
        var delObj = null;
        obj.db.get(command.id)
            .then((found) => {
                var file = found[0];
                delObj = { ...{}, ...found[0] };
                return file;
            })
            .then((file) => {
                if (file.type == 'folder') return obj.db.deleteByPath(file.path); //@TODO delete schedules for scripts within folders
                if (file.type == 'script') return obj.db.deleteSchedulesForScript(file._id);
                if (file.type == 'jobSchedule') return obj.db.deletePendingJobsForSchedule(file._id);
            })
            .then(() => {
                return obj.db.delete(command.id)
            })
            .then(() => {
                var updateObj = { tree: true };
                if (delObj.type == 'jobSchedule') {
                    updateObj.scriptId = delObj.scriptId;
                    updateObj.nodeId = delObj.node;
                }
                return obj.updateFrontEnd(updateObj);
            })
            .catch(e => { console.log('PLUGIN: ScriptTask: Error deleting ', e.stack); });
    };

    obj.serveraction = function (command, myparent, grandparent) {
        switch (command.pluginaction) {
            case 'addScript':
                obj.db.addScript(command.name, command.content, command.path, command.filetype)
                    .then(() => {
                        obj.updateFrontEnd({ tree: true });
                    });
                break;
            case 'new':
                var parent_path = '';
                var new_path = '';
                obj.db.get(command.parent_id)
                    .then(found => {
                        if (found.length > 0) {
                            var file = found[0];
                            parent_path = file.path;
                        } else {
                            parent_path = 'Shared';
                        }
                    })
                    .then(() => {
                        obj.db.addScript(command.name, '', parent_path, command.filetype)
                    })
                    .then(() => {
                        obj.updateFrontEnd({ tree: true });
                    });
                break;
            case 'rename':
                obj.db.get(command.id)
                    .then((docs) => {
                        var doc = docs[0];
                        if (doc.type == 'folder') {
                            console.log('old', doc.path, 'new', doc.path.replace(doc.path, command.name));
                            return obj.db.update(command.id, { path: doc.path.replace(doc.name, command.name) })
                                .then(() => { // update sub-items
                                    return obj.db.getByPath(doc.path)
                                })
                                .then((found) => {
                                    if (found.length > 0) {
                                        var proms = [];
                                        found.forEach(f => {
                                            proms.push(obj.db.update(f._id, { path: doc.path.replace(doc.name, command.name) }));
                                        })
                                        return Promise.all(proms);
                                    }
                                })
                        } else {
                            return Promise.resolve();
                        }
                    })
                    .then(() => {
                        obj.db.update(command.id, { name: command.name })
                    })
                    .then(() => {
                        return obj.db.updateScriptJobName(command.id, command.name);
                    })
                    .then(() => {
                        obj.updateFrontEnd({ scriptId: command.id, nodeId: command.currentNodeId, tree: true });
                    });
                break;
            case 'move':
                var toPath = null, fromPath = null, parentType = null;
                obj.db.get(command.to)
                    .then(found => { // get target data
                        if (found.length > 0) {
                            var file = found[0];
                            toPath = file.path;
                        } else throw Error('Target destination not found');
                    })
                    .then(() => { // get item to be moved
                        return obj.db.get(command.id);
                    })
                    .then((found) => { // set item to new location
                        var file = found[0];
                        if (file.type == 'folder') {
                            fromPath = file.path;
                            toPath += '/' + file.name;
                            parentType = 'folder';
                            if (file.name == 'Shared' && file.path == 'Shared') throw Error('Cannot move top level directory: Shared');
                        }
                        return obj.db.update(command.id, { path: toPath });
                    })
                    .then(() => { // update sub-items
                        return obj.db.getByPath(fromPath)
                    })
                    .then((found) => {
                        if (found.length > 0) {
                            var proms = [];
                            found.forEach(f => {
                                proms.push(obj.db.update(f._id, { path: toPath }));
                            })
                            return Promise.all(proms);
                        }
                    })
                    .then(() => {
                        return obj.updateFrontEnd({ tree: true });
                    })
                    .catch(e => { console.log('PLUGIN: ScriptTask: Error moving ', e.stack); });
                break;
            case 'newFolder':
                var parent_path = '';
                var new_path = '';

                obj.db.get(command.parent_id)
                    .then(found => {
                        if (found.length > 0) {
                            var file = found[0];
                            parent_path = file.path;
                        } else {
                            parent_path = 'Shared';
                        }
                    })
                    .then(() => {
                        new_path = parent_path + '/' + command.name;
                    })
                    .then(() => {
                        return obj.db.addFolder(command.name, new_path);
                    })
                    .then(() => {
                        return obj.updateFrontEnd({ tree: true });
                    })
                    .catch(e => { console.log('PLUGIN: ScriptTask: Error creating new folder ', e.stack); });
                break;
            case 'delete':
                obj.deleteElement(command);
                break;
            case 'addScheduledJob':
                /* { 
                    scriptId: scriptId, 
                    node: s, 
                    scheduledBy: myparent.user.name,
                    recur: command.recur, // [once, minutes, hourly, daily, weekly, monthly]
                    interval: x,
                    daysOfWeek: x, // only used for weekly recur val
                    // onTheXDay: x, // only used for monthly
                    startAt: x,
                    endAt: x,
                    runCountLimit: x,
                    lastRun: x,
                    nextRun: x,
                    type: "scheduledJob"
                } */
                var sj = command.schedule;

                var sched = {
                    scriptId: command.scriptId,
                    node: null,
                    scheduledBy: myparent.user.name,
                    recur: sj.recur,
                    interval: sj.interval,
                    daysOfWeek: sj.dayVals,
                    startAt: sj.startAt,
                    endAt: sj.endAt,
                    lastRun: null,
                    nextRun: null,
                    type: "jobSchedule"
                };
                var sel = command.nodes;
                var proms = [];
                if (Array.isArray(sel)) {
                    sel.forEach((s) => {
                        var sObj = {
                            ...sched, ...{
                                node: s
                            }
                        };
                        proms.push(obj.db.addJobSchedule(sObj));
                    });
                } else {
                    test.push(sObj);
                    proms.push(obj.db.addJobSchedule(sObj));
                }
                Promise.all(proms)
                    .then(() => {
                        obj.makeJobsFromSchedules();
                        return Promise.resolve();
                    })
                    .catch(e => { console.log('PLUGIN: ScriptTask: Error adding schedules. The error was: ', e); });
                break;
            case 'runScript':
                var scriptId = command.scriptId;
                var sel = command.nodes;
                var proms = [];
                if (Array.isArray(sel)) {
                    sel.forEach((s) => {
                        proms.push(obj.db.addJob({ scriptId: scriptId, node: s, runBy: myparent.user.name }));
                    });
                } else {
                    proms.push(obj.db.addJob({ scriptId: scriptId, node: sel, runBy: myparent.user.name }));
                }
                Promise.all(proms)
                    .then(() => {
                        return obj.db.get(scriptId);
                    })
                    .then(scripts => {
                        return obj.db.updateScriptJobName(scriptId, scripts[0].name);
                    })
                    .then(() => {
                        obj.resetQueueTimer();
                        obj.queueRun();
                        obj.updateFrontEnd({ scriptId: scriptId, nodeId: command.currentNodeId });
                    });
                break;
            case 'getScript':
                //obj.debug('ScriptTask', 'getScript Triggered', JSON.stringify(command));
                obj.db.get(command.scriptId)
                    .then(script => {
                        myparent.send(JSON.stringify({
                            action: 'plugin',
                            plugin: 'scripttask',
                            pluginaction: 'cacheScript',
                            nodeid: myparent.dbNodeKey,
                            rights: true,
                            sessionid: true,
                            script: script[0]
                        }));
                    });
                break;
            case 'jobComplete':
                var jobNodeHistory = null, scriptHistory = null;
                var jobId = command.jobId, retVal = command.retVal, errVal = command.errVal, dispatchTime = command.dispatchTime;
                var completeTime = Math.floor(new Date() / 1000);
                var exitCode = command.exitCode;

                obj.db.get(jobId)
                    .then(jobs => {
                        var job = jobs[0];
                        if (job == null) return;
                        return obj.db.update(jobId, {
                            completeTime: completeTime,
                            returnVal: retVal,
                            errorVal: errVal,
                            exitCode: exitCode,
                            dispatchTime: dispatchTime
                        }).then(() => job);
                    })
                    .then(job => {
                        if (job == null) return Promise.resolve();
                        if (job.isComplianceDetect || job.isComplianceRemediate) {
                            var compliant = (exitCode === 0);
                            var stateStr = compliant ? 'Compliant' : 'Non-compliant';
                            if (errVal) stateStr = 'Error';

                            obj.db.updateComplianceState(job.node, job.policyId, {
                                state: stateStr,
                                lastRunTime: completeTime,
                                lastExitCode: exitCode,
                                lastOutput: String(retVal || errVal || '').substring(0, 500),
                                version: job.policyVersion
                            });
                            obj.db.addComplianceHistory({
                                nodeId: job.node,
                                policyId: job.policyId,
                                action: job.isComplianceDetect ? 'Detect' : 'Remediate',
                                state: stateStr,
                                exitCode: exitCode,
                                output: String(retVal || errVal || '').substring(0, 500)
                            });

                            // Queue Remediation if Detect fails
                            if (job.isComplianceDetect && !compliant && !errVal) {
                                obj.db.getPolicy(job.policyId).then(pols => {
                                    var p = pols[0];
                                    if (p && p.remediateScriptId) {
                                        obj.db.addJob({
                                            scriptId: p.remediateScriptId,
                                            node: job.node,
                                            runBy: 'Compliance Engine',
                                            isComplianceRemediate: true,
                                            policyId: p._id,
                                            policyVersion: job.policyVersion
                                        });
                                        obj.queueRun();
                                    }
                                });
                            }
                        }

                        if (job.jobSchedule != null) {
                            return obj.db.update(job.jobSchedule, { lastRun: completeTime })
                                .then(() => {
                                    obj.makeJobsFromSchedules(job.jobSchedule);
                                });
                        }
                    })
                    .then(() => {
                        obj.updateFrontEnd({ scriptId: command.scriptId, nodeId: myparent.dbNodeKey });
                    })
                    .catch(e => { console.log('PLUGIN: ScriptTask: Failed to complete job. ', e); });
                break;
            case 'loadNodeHistory':
                obj.updateFrontEnd({ nodeId: command.nodeId });
                break;
            case 'loadScriptHistory':
                obj.updateFrontEnd({ scriptId: command.scriptId });
                break;
            case 'editScript':
                obj.db.update(command.scriptId, { type: command.scriptType, name: command.scriptName, content: command.scriptContent })
                    .then(() => {
                        obj.updateFrontEnd({ scriptId: command.scriptId, tree: true });
                    });
                break;
            case 'clearAllPendingJobs':
                obj.db.deletePendingJobsForNode(myparent.dbNodeKey);
                break;
            case 'loadVariables':
                obj.updateFrontEnd({ variables: true });
                break;
            case 'newVar':
                obj.db.addVariable(command.name, command.scope, command.scopeTarget, command.value)
                    .then(() => {
                        obj.updateFrontEnd({ variables: true });
                    })
                break;
            case 'editVar':
                obj.db.update(command.id, {
                    name: command.name,
                    scope: command.scope,
                    scopeTarget: command.scopeTarget,
                    value: command.value
                })
                    .then(() => {
                        obj.updateFrontEnd({ variables: true });
                    })
                break;
            case 'deleteVar':
                obj.db.delete(command.id)
                    .then(() => {
                        obj.updateFrontEnd({ variables: true });
                    })
                break;
            case 'getPolicies':
                obj.db.getPolicies().then(policies => {
                    obj.db.getAllPolicyAssignments().then(assignments => {
                        var targets = ['*', 'server-users'];
                        obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'policyData', policies: policies, assignments: assignments });
                    }).catch(e => {
                        var targets = ['*', 'server-users'];
                        obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'policyData', error: 'Assignments Error: ' + String(e) });
                        console.log("CompliancePowerScript ERROR getAllPolicyAssignments:", e);
                    });
                }).catch(e => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'policyData', error: 'Policies Error: ' + String(e) });
                    console.log("CompliancePowerScript ERROR getPolicies:", e);
                });
                break;
            case 'savePolicy':
                if (command.policy._id) {
                    obj.db.updatePolicy(command.policy._id, command.policy).then(() => {
                        obj.serveraction({ pluginaction: 'getPolicies' }, myparent, grandparent);
                    }).catch(err => console.log('ScriptPolicyCompliance ERROR updating policy:', err));
                } else {
                    obj.db.addPolicy(command.policy).then(() => {
                        obj.serveraction({ pluginaction: 'getPolicies' }, myparent, grandparent);
                    }).catch(err => console.log('ScriptPolicyCompliance ERROR adding policy:', err));
                }
                break;
            case 'deletePolicy':
                obj.db.deletePolicy(command.id).then(() => {
                    obj.serveraction({ pluginaction: 'getPolicies' }, myparent, grandparent);
                });
                break;
            case 'testComplianceNotify':
                obj.notifyComplianceFailure(
                    "This is a test notification generated from the Compliance Policies UI.",
                    { name: 'SMTP Integration Test Policy' },
                    "test-node-1234",
                    "Your Compliance Engine Email settings are fully operational.",
                    99
                );
                break;
            case 'savePolicyAssignment':
                obj.db.addPolicyAssignment(command.assignment).then(() => {
                    obj.serveraction({ pluginaction: 'getPolicies' }, myparent, grandparent);
                });
                break;
            case 'getSmtpConfig':
                obj.db.getSmtpConfig().then(config => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'smtpData', config: config[0] || {} });
                }).catch(e => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'smtpData', error: String(e) });
                    console.log("CompliancePowerScript ERROR getSmtpConfig:", e);
                });
                break;
            case 'saveSmtpConfig':
                obj.db.saveSmtpConfig(command.config).then(() => {
                    obj.serveraction({ pluginaction: 'getSmtpConfig' }, myparent, grandparent);
                });
                break;
            case 'deletePolicyAssignment':
                obj.db.deletePolicyAssignment(command.id).then(() => {
                    obj.serveraction({ pluginaction: 'getPolicies' }, myparent, grandparent);
                });
                break;
            case 'getComplianceState':
                obj.db.getComplianceState(command.nodeId).then(state => {
                    obj.db.getComplianceHistory(command.nodeId, command.policyId).then(history => {
                        var targets = ['*', 'server-users'];
                        obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'complianceStateData', state: state, history: history });
                    });
                });
                break;
            case 'runComplianceEvaluation':
                obj.evaluateDeviceCompliance(command.nodeId);
                break;
            case 'getDeviceEvents':
                obj.db.getDeviceEvents(command.nodeId).then(events => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'deviceEvents', nodeId: command.nodeId, events: events });
                }).catch(e => { console.log('ScriptPolicyCompliance ERROR getDeviceEvents:', e); });
                break;
            case 'getComplianceOverview':
                obj.db.getAllDeviceEventNodes().then(allEvents => {
                    // Aggregate: for each nodeId, latest of each event type (data sorted desc, first = latest)
                    var nodeMap = {};
                    allEvents.forEach(ev => {
                        if (!nodeMap[ev.nodeId]) nodeMap[ev.nodeId] = {};
                        if (!nodeMap[ev.nodeId][ev.eventType]) nodeMap[ev.nodeId][ev.eventType] = ev;
                    });
                    var overview = Object.keys(nodeMap).map(nodeId => ({
                        nodeId: nodeId,
                        lastIp: nodeMap[nodeId].ipSeen ? nodeMap[nodeId].ipSeen.data.ip : null,
                        lastIpTimestamp: nodeMap[nodeId].ipSeen ? nodeMap[nodeId].ipSeen.timestamp : null,
                        lastUser: nodeMap[nodeId].lastUser ? nodeMap[nodeId].lastUser.data.user : null,
                        lastUserTimestamp: nodeMap[nodeId].lastUser ? nodeMap[nodeId].lastUser.timestamp : null,
                        lastBoot: nodeMap[nodeId].bootTime ? nodeMap[nodeId].bootTime.data.bootTime : null,
                        lastBootTimestamp: nodeMap[nodeId].bootTime ? nodeMap[nodeId].bootTime.timestamp : null
                    }));
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'complianceOverview', overview: overview });
                }).catch(e => { console.log('ScriptPolicyCompliance ERROR getComplianceOverview:', e); });
                break;
            case 'getRetentionRules':
                obj.db.getRetentionRules().then(rules => {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'retentionRules', rules: rules });
                }).catch(e => { console.log('ScriptPolicyCompliance ERROR getRetentionRules:', e); });
                break;
            case 'saveRetentionRule':
                obj.db.saveRetentionRule(command.rule).then(() => {
                    obj.serveraction({ pluginaction: 'getRetentionRules' }, myparent, grandparent);
                }).catch(e => { console.log('ScriptPolicyCompliance ERROR saveRetentionRule:', e); });
                break;
            case 'deleteRetentionRule':
                obj.db.deleteRetentionRule(command.id).then(() => {
                    obj.serveraction({ pluginaction: 'getRetentionRules' }, myparent, grandparent);
                }).catch(e => { console.log('ScriptPolicyCompliance ERROR deleteRetentionRule:', e); });
                break;
            case 'getPowerHistory':
                if (obj.meshServer && obj.meshServer.db && typeof obj.meshServer.db.GetEvents == 'function') {
                    // Query power events for the node.
                    // Action 10 = power events (in MeshCentral core).
                    var nodeid = command.nodeId;
                    var timeLimit = Math.floor(Date.now() / 1000) - (command.days || 180) * 86400; // 180 days by default

                    obj.meshServer.db.GetEvents([nodeid], null, timeLimit, function (err, docs) {
                        var pEvents = [];
                        if (!err && docs) {
                            docs.forEach(function (ev) {
                                // Filter for power events. MeshCentral uses msg to denote power state changes or structured event ids.
                                // It can also just be filtered to all events related to the node, then we pluck power-specific ones.
                                if (ev.action === 'nodePowerState' || ev.action === 'agentcore' || ev.msg && ev.msg.indexOf('Power') >= 0 || ev.m === 10 || ev.action === 'nodeconnectivity' || ev.action === 'power') {
                                    pEvents.push({ time: ev.time, msg: ev.msg, action: ev.action, state: ev.state || ev.s });
                                }
                            });
                        }
                        var targets = ['*', 'server-users'];
                        obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'powerHistory', events: pEvents, nodeId: nodeid });
                    });
                } else {
                    var targets = ['*', 'server-users'];
                    obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'powerHistory', events: [], nodeId: command.nodeId, error: "Database not available" });
                }
                break;
            default:
                console.log('PLUGIN: ScriptTask: unknown action');
                break;
        }
    };

    obj.notifyComplianceFailure = async function (alertMessage, policy, nodeId, details, exitCode) {
        var nodemailer;
        try {
            nodemailer = require('nodemailer');
        } catch (e) {
            console.log("CompliancePowerScript: nodemailer not found, cannot send emails.");
            return;
        }

        // 1. Get SMTP from Plugin DB or Core
        var smtpConfig = null;
        var pluginSmtpArray = await obj.db.getSmtpConfig();
        var pluginSmtp = pluginSmtpArray && pluginSmtpArray.length > 0 ? pluginSmtpArray[0] : null;

        if (pluginSmtp && pluginSmtp.host) {
            smtpConfig = pluginSmtp;
        } else if (obj.meshServer.config && obj.meshServer.config.smtp) {
            smtpConfig = obj.meshServer.config.smtp;
        }

        if (!smtpConfig || (!smtpConfig.host && !smtpConfig.service)) {
            console.log("CompliancePowerScript: No SMTP config found.");
            return;
        }

        var transportConfig = {
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.tlsstrict || smtpConfig.tls || false,
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.pass
            }
        };

        if (smtpConfig.port === 465) transportConfig.secure = true;

        var transporter = nodemailer.createTransport(transportConfig);

        var nodeName = nodeId;
        var agent = obj.meshServer.webserver.wsagents[nodeId];
        if (agent && agent.dbNodeKey) {
            var n = await obj.meshServer.db.Get(agent.dbNodeKey);
            if (n && n.length > 0) nodeName = n[0].name;
        } else {
            if (nodeId && nodeId.startsWith('test')) nodeName = "Test Node";
        }

        var mailOptions = {
            from: smtpConfig.from || smtpConfig.user,
            to: pluginSmtp && pluginSmtp.toAddress ? pluginSmtp.toAddress : (smtpConfig.from || smtpConfig.user),
            subject: `[Compliance Alert] Device ${nodeName} failed Policy: ${policy.name}`,
            text: `Compliance Alert Engine\n\nDevice: ${nodeName}\nPolicy: ${policy.name}\n\nMessage: ${alertMessage}\nExit Code: ${exitCode}\n\nDetails:\n${details}`
        };

        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                console.log('ScriptPolicyCompliance Mail Error:', error);
            } else {
                console.log('ScriptPolicyCompliance Mail Sent:', info.response);
            }
        });
    };

    return obj;
}
